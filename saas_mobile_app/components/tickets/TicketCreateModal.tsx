import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createClient } from '@/utils/supabase/client';
import { createTicket, uploadTicketPhoto, fetchUsersList } from '@/utils/api/mobileApi';
import MediaCaptureModal, { MediaFile } from '../shared/MediaCaptureModal';
import { useTheme } from '@/context';
import { enhancePrompt } from '@/utils/ai/promptEnhancer';
import { startRecording, stopRecording, transcribeAudio } from '@/utils/ai/voiceTranscription';
import { compressImage, readFileAsArrayBuffer, getStoragePath } from '@/utils/mediaUtils';
import {
  classifyTicket,
  getSkillGroupDisplayName,
  getSkillGroupColor,
  getIssueCodeDisplayName,
  ClassificationResult,
} from '@/utils/ticketing/classifyTicket';
import { RotatingBorder } from '../shared/RotatingBorder';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface TicketCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  organizationId: string;
  onSuccess?: (ticket: any) => void;
  role?: 'tenant' | 'admin' | 'super_admin' | 'staff';
  organizations?: any[];
  properties?: any[];
}

export function TicketCreateModal({
  isOpen,
  onClose,
  propertyId,
  organizationId,
  onSuccess,
  role = 'tenant',
  organizations = [],
  properties = [],
}: TicketCreateModalProps) {
  const isAdminMode = role === 'super_admin';
  const showInternalToggle = role !== 'tenant';
  const supabase = createClient();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [description, setDescription] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isCritical, setIsCritical] = useState(false);
  const [media, setMedia] = useState<MediaFile | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inputLayout, setInputLayout] = useState({ width: 0, height: 0 });

  // Admin Mode state
  const [selectedOrgId, setSelectedOrgId] = useState(organizationId || '');
  const [selectedPropId, setSelectedPropId] = useState(propertyId || '');
  const [availableProperties, setAvailableProperties] = useState<any[]>(properties || []);

  // Classification
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const classifyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mentions
  const [propertyUsers, setPropertyUsers] = useState<{ id: string; full_name: string; role?: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [taggedUser, setTaggedUser] = useState<{ id: string; full_name: string } | null>(null);

  // Enhancer & Voice
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const pid = isAdminMode ? selectedPropId : propertyId;
    if (!pid || !isOpen) return;
    
    // Tenants shouldn't see or use @mentions, so don't fetch users for them
    if (role === 'tenant') {
      setPropertyUsers([]);
      return;
    }

    const fetchUsers = async () => {
      try {
        const res = await fetchUsersList(undefined, pid);
        if (res && res.users) {
          setPropertyUsers(
            res.users
              .map(u => ({ id: u.id, full_name: u.full_name || '', role: u.propertyRole }))
              .filter(u => u.id && u.full_name)
          );
        }
      } catch (e) {
        console.error('Failed to fetch users:', e);
      }
    };
    fetchUsers();
  }, [isOpen, selectedPropId, propertyId, isAdminMode]);

  const handleOrgChange = async (orgId: string) => {
    setSelectedOrgId(orgId);
    setSelectedPropId('');
    if (orgId) {
      const { data } = await supabase
        .from('properties')
        .select('id, name, code')
        .eq('organization_id', orgId)
        .eq('status', 'active');
      setAvailableProperties(data || []);
    } else {
      setAvailableProperties([]);
    }
  };

  // Debounced classification
  useEffect(() => {
    if (!description.trim() || description.trim().length < 5) {
      setClassification(null);
      setIsClassifying(false);
      return;
    }
    setIsClassifying(true);
    if (classifyTimeoutRef.current) clearTimeout(classifyTimeoutRef.current);
    classifyTimeoutRef.current = setTimeout(async () => {
      const result = await classifyTicket(description);
      setClassification(result);
      setIsClassifying(false);
    }, 600);
    return () => { if (classifyTimeoutRef.current) clearTimeout(classifyTimeoutRef.current); };
  }, [description]);

  const handleTextChange = (text: string) => {
    setDescription(text);
    const lowerText = text.toLowerCase();
    if (lowerText.match(/\bac\s*$/)) {
      setSuggestions(['not cooling', 'water leakage', 'making noise']);
    } else if (lowerText.match(/\bwater\s*$/)) {
      setSuggestions(['leaking', 'stagnation', 'pressure low']);
    } else if (lowerText.match(/\blight\s*$/)) {
      setSuggestions(['not working', 'flickering', 'broken']);
    } else if (lowerText.match(/\b(lift|elevator)\s*$/)) {
      setSuggestions(['stuck', 'not working', 'making noise']);
    } else if (lowerText.match(/\bcleaning\s*$/)) {
      setSuggestions(['required', 'not done properly', 'schedule missed']);
    } else if (lowerText.match(/\bdoor\s*$/)) {
      setSuggestions(['lock broken', 'making noise', 'access denied']);
    } else {
      setSuggestions([]);
    }
    const lastAt = text.lastIndexOf('@');
    // Disable mentions for tenants
    if (lastAt !== -1 && role !== 'tenant') {
      const query = text.slice(lastAt + 1);
      if (!query.includes(' ') && !query.includes('\n')) {
        setMentionQuery(query);
        setShowMentionDropdown(true);
        return;
      }
    }
    setShowMentionDropdown(false);
  };

  const applySuggestion = (suggestion: string) => {
    setDescription((prev) => {
      const trimmed = prev.trimEnd();
      return trimmed + ' ' + suggestion + ' ';
    });
    setSuggestions([]);
  };

  const selectMention = (user: { id: string; full_name: string }) => {
    const lastAt = description.lastIndexOf('@');
    const before = description.slice(0, lastAt);
    setDescription(`${before}@${user.full_name} `);
    setTaggedUser(user);
    setShowMentionDropdown(false);
  };

  const handleSubmit = async () => {
    if (!description.trim()) { setError('Please describe the issue'); return; }
    setIsSubmitting(true);
    setError(null);
    const finalOrgId = isAdminMode ? selectedOrgId : organizationId;
    const finalPropId = isAdminMode ? selectedPropId : propertyId;
    if (!finalOrgId || !finalPropId) {
      setError('Please select organization and property');
      setIsSubmitting(false);
      return;
    }
    try {
      const title = description.split('\n')[0].slice(0, 80);
      const result = await createTicket({
        description: description.trim(),
        title,
        propertyId: finalPropId,
        organizationId: finalOrgId,
        isInternal,
        priority: isCritical ? 'critical' : 'medium',
        assignedTo: taggedUser?.id,
      });
      if (result.error) throw new Error(result.error);

      if (media && result.ticket?.id) {
        try {
          const newTicketId = result.ticket.id;
          let uriToUpload = media.uri;
          if (media.type === 'image') uriToUpload = await compressImage(media.uri);
          
          await uploadTicketPhoto(newTicketId, uriToUpload, 'before');
        } catch (uploadError) {
          console.error('Failed to upload media:', uploadError);
        }
      }
      setSuccess(true);
      onSuccess?.(result.ticket);
      setTimeout(() => { handleReset(); onClose(); }, 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to create ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setDescription('');
    setIsInternal(false);
    setIsCritical(false);
    setMedia(null);
    setSuggestions([]);
    setClassification(null);
    setSuccess(false);
    setError(null);
    setTaggedUser(null);
    setShowMentionDropdown(false);
    setIsEnhancing(false);
    setIsRecording(false);
    setRecordDuration(0);
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
  };

  const handleEnhance = async () => {
    if (!description.trim() || description.trim().length < 3) return;
    setIsEnhancing(true);
    try {
      const enhanced = await enhancePrompt(description);
      if (enhanced) { setDescription(enhanced); }
      else { setError('Enhancement unavailable.'); setTimeout(() => setError(null), 3000); }
    } finally { setIsEnhancing(false); }
  };

  const handleMicPress = async () => {
    if (isRecording) {
      setIsRecording(false);
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
      const uri = await stopRecording();
      setRecordDuration(0);
      if (uri) {
        const text = await transcribeAudio(uri);
        if (text) { setDescription((prev) => (prev ? prev + ' ' + text : text)); }
        else { setError('Could not transcribe audio.'); setTimeout(() => setError(null), 3000); }
      }
    } else {
      const started = await startRecording();
      if (started) {
        setIsRecording(true);
        setRecordDuration(0);
        recordTimerRef.current = setInterval(() => setRecordDuration((d) => d + 1), 1000);
      } else {
        setError('Microphone permission denied.');
        setTimeout(() => setError(null), 3000);
      }
    }
  };

  const sgColorObj = classification ? getSkillGroupColor(classification.skill_group) : null;
  const hasContent = description.trim().length >= 5;

  return (
    <Modal visible={isOpen} animationType="slide" transparent={false} onRequestClose={onClose}>
      {/* Full-screen black backdrop */}
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Raise Request</Text>
              <Text style={styles.headerSubtitle}>Describe the issue clearly</Text>
            </View>

            <TouchableOpacity
              style={[styles.submitHeaderBtn, (!description.trim() || isSubmitting) && { opacity: 0.4 }]}
              onPress={handleSubmit}
              disabled={!description.trim() || isSubmitting}
              activeOpacity={0.75}
            >
              <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {success ? (
              <View style={styles.successContainer}>
                <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.successIconRing}>
                  <Ionicons name="checkmark-circle" size={64} color="#10B981" />
                </View>
                <Text style={styles.successTitle}>Request Submitted!</Text>
                <Text style={styles.successBody}>Your ticket has been created and AI-classified. Our team will be notified shortly.</Text>
              </View>
            ) : (
              <>
                {/* Admin Mode Pickers */}
                {isAdminMode && (
                  <View style={styles.glassCard}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Text style={styles.sectionLabel}>
                      <Ionicons name="business-outline" size={11} color="rgba(255,255,255,0.4)" /> Organization
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
                      {organizations.map(org => (
                        <TouchableOpacity
                          key={org.id}
                          style={[styles.filterChip, selectedOrgId === org.id && styles.filterChipActive]}
                          onPress={() => handleOrgChange(org.id)}
                        >
                          <Text style={[styles.filterChipText, selectedOrgId === org.id && styles.filterChipTextActive]}>
                            {org.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
                      <Ionicons name="location-outline" size={11} color="rgba(255,255,255,0.4)" /> Property
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
                      {availableProperties.map(prop => (
                        <TouchableOpacity
                          key={prop.id}
                          style={[styles.filterChip, selectedPropId === prop.id && styles.filterChipActive]}
                          onPress={() => setSelectedPropId(prop.id)}
                        >
                          <Text style={[styles.filterChipText, selectedPropId === prop.id && styles.filterChipTextActive]}>
                            {prop.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Main Input Box */}
                <View
                  style={styles.inputWrapper}
                  onLayout={(e) => setInputLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
                >
                  {inputLayout.height > 0 && (
                    <View style={StyleSheet.absoluteFill}>
                      <RotatingBorder
                        width={inputLayout.width}
                        height={inputLayout.height}
                        borderRadius={24}
                        isDark={true}
                      />
                    </View>
                  )}

                  <View style={[styles.inputInner, { zIndex: showMentionDropdown ? 50 : 10 }]}>
                    <TextInput
                      style={[styles.textArea, Platform.OS === 'web' && { outlineStyle: 'none' } as any]}
                      placeholder="e.g., Water leaking from the AC on the 2nd Floor..."
                      placeholderTextColor="rgba(255,255,255,0.45)"
                      selectionColor={colors.primary}
                      multiline
                      value={description}
                      onChangeText={handleTextChange}
                      textAlignVertical="top"
                    />

                    {/* Predictive Chips */}
                    {suggestions.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={styles.suggestionsScroll} showsVerticalScrollIndicator={false}>
                        {suggestions.map((sug, idx) => (
                          <TouchableOpacity key={idx} style={styles.suggestionChip} onPress={() => applySuggestion(sug)} activeOpacity={0.7}>
                            <Text style={styles.suggestionText}>{sug}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}

                    {/* Mention Dropdown */}
                    {showMentionDropdown && propertyUsers.length > 0 && (
                      <View style={styles.mentionDropdown}>
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                        {propertyUsers
                          .filter(u => u.full_name.toLowerCase().includes(mentionQuery.toLowerCase()))
                          .slice(0, 5)
                          .map(user => (
                            <TouchableOpacity
                              key={user.id}
                              style={styles.mentionItem}
                              onPress={() => selectMention(user)}
                            >
                              <View style={[styles.avatarMini, { backgroundColor: colors.primary }]}>
                                <Text style={styles.avatarText}>
                                  {user.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                </Text>
                              </View>
                              <View>
                                <Text style={styles.mentionName}>{user.full_name}</Text>
                                <Text style={styles.mentionRole}>{user.role?.replace(/_/g, ' ')}</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                      </View>
                    )}

                    {/* Tagged user chip */}
                    {taggedUser && (
                      <View style={styles.taggedRow}>
                        <View style={styles.taggedChip}>
                          <Ionicons name="at" size={11} color={colors.primary} />
                          <Text style={[styles.taggedChipText, { color: colors.primary }]}>{taggedUser.full_name}</Text>
                          <TouchableOpacity onPress={() => {
                            setTaggedUser(null);
                            setDescription(d => d.replace(`@${taggedUser.full_name} `, '').replace(`@${taggedUser.full_name}`, ''));
                          }}>
                            <Ionicons name="close-circle" size={13} color={colors.primary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {/* Media Attachment Badge */}
                    {media && (
                      <View style={styles.mediaBadge}>
                        <Ionicons name={media.type === 'image' ? 'image' : 'videocam'} size={13} color="#60A5FA" />
                        <Text style={styles.mediaBadgeText}>Before photo attached</Text>
                        <TouchableOpacity onPress={() => setMedia(null)} style={{ marginLeft: 4 }}>
                          <Ionicons name="close-circle" size={14} color="rgba(255,255,255,0.4)" />
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Toolbar */}
                    <View style={styles.toolbar}>
                      <View style={styles.toolbarLeft}>
                        <TouchableOpacity style={styles.toolBtn} onPress={() => setShowMediaModal(true)} activeOpacity={0.7}>
                          <Ionicons name="add" size={17} color="rgba(255,255,255,0.55)" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.pillBtn, isEnhancing && { opacity: 0.5 }]}
                          onPress={handleEnhance}
                          disabled={isEnhancing || description.trim().length < 3}
                          activeOpacity={0.7}
                        >
                          {isEnhancing ? (
                            <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
                          ) : (
                            <>
                              <Ionicons name="sparkles-outline" size={13} color="rgba(255,255,255,0.7)" />
                              <Text style={styles.pillBtnText}>Enhance</Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.pillBtn, isRecording && styles.pillBtnRecording]}
                          onPress={handleMicPress}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={isRecording ? 'stop-circle' : 'mic-outline'}
                            size={13}
                            color={isRecording ? '#F87171' : 'rgba(255,255,255,0.7)'}
                          />
                          <Text style={[styles.pillBtnText, isRecording && { color: '#F87171' }]}>
                            {isRecording ? `${recordDuration}s` : 'Voice'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={[styles.sendBtn, (!description.trim() || isSubmitting) && { opacity: 0.35 }]}
                        onPress={handleSubmit}
                        disabled={!description.trim() || isSubmitting}
                        activeOpacity={0.8}
                      >
                        {isSubmitting ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="send" size={15} color="#fff" style={{ marginLeft: 1 }} />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* AI Classification */}
                {(isClassifying || classification) && hasContent && (
                  <View style={styles.classificationCard}>
                    <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.classificationHeader}>
                      <Ionicons name="git-network-outline" size={13} color={colors.primary} />
                      <Text style={[styles.classificationLabel, { color: colors.primary }]}>AI Auto-Classification</Text>
                      {isClassifying && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 'auto' }} />}
                    </View>
                    {classification && !isClassifying && (
                      <View style={styles.classificationBadges}>
                        <View style={[styles.sgBadge, {
                          backgroundColor: sgColorObj ? sgColorObj.bg : 'rgba(255,255,255,0.08)',
                          borderColor: sgColorObj ? sgColorObj.border : 'rgba(255,255,255,0.1)',
                        }]}>
                          <Text style={[styles.sgBadgeText, { color: sgColorObj ? sgColorObj.text : '#fff' }]}>
                            {getSkillGroupDisplayName(classification.skill_group)}
                          </Text>
                        </View>
                        <View style={styles.issueBadge}>
                          <Text style={styles.issueBadgeText}>
                            {getIssueCodeDisplayName(classification.issue_code)}
                          </Text>
                        </View>
                        <View style={[styles.confidenceBadge, {
                          backgroundColor: classification.confidence === 'high' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                          borderColor: classification.confidence === 'high' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)',
                        }]}>
                          <Text style={[styles.confidenceText, { color: classification.confidence === 'high' ? '#10B981' : '#F59E0B' }]}>
                            {classification.confidence === 'high' ? '✓ High Confidence' : '⚠ Low Confidence'}
                          </Text>
                        </View>
                      </View>
                    )}
                    {isClassifying && (
                      <Text style={styles.classifyingText}>Analyzing with AI + Rule Engine...</Text>
                    )}
                  </View>
                )}

                {/* Toggle Cards */}
                <View style={styles.togglesContainer}>
                  {showInternalToggle && (
                    <TouchableOpacity style={styles.toggleCard} onPress={() => setIsInternal(!isInternal)} activeOpacity={0.8}>
                      <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                      <View style={styles.toggleCardLeft}>
                        <View style={[styles.toggleIconBg, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
                          <Ionicons name="eye-off-outline" size={16} color="#F59E0B" />
                        </View>
                        <View>
                          <Text style={styles.toggleCardLabel}>Internal Ticket</Text>
                          <Text style={styles.toggleCardSub}>Not visible to tenants</Text>
                        </View>
                      </View>
                      <View style={[styles.iosToggle, isInternal && { backgroundColor: '#F59E0B' }]}>
                        <View style={[styles.iosToggleCircle, isInternal && styles.iosToggleCircleOn]} />
                      </View>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.toggleCard} onPress={() => setIsCritical(!isCritical)} activeOpacity={0.8}>
                    <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.toggleCardLeft}>
                      <View style={[styles.toggleIconBg, { backgroundColor: isCritical ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)' }]}>
                        <Ionicons name="warning-outline" size={16} color="#EF4444" />
                      </View>
                      <View>
                        <Text style={styles.toggleCardLabel}>Mark as Critical</Text>
                        <Text style={styles.toggleCardSub}>Immediate action required</Text>
                      </View>
                    </View>
                    <View style={[styles.iosToggle, isCritical && { backgroundColor: '#EF4444' }]}>
                      <View style={[styles.iosToggleCircle, isCritical && styles.iosToggleCircleOn]} />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Error */}
                {error && (
                  <View style={styles.errorCard}>
                    <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                    <Ionicons name="alert-circle" size={16} color="#EF4444" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <MediaCaptureModal
        isOpen={showMediaModal}
        onClose={() => setShowMediaModal(false)}
        onCapture={setMedia}
        title="Capture Evidence (Before Photo)"
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#05050A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 1,
    fontWeight: '500',
  },
  submitHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.4)',
    backgroundColor: 'rgba(99,102,241,0.2)',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 14,
  },

  // Glass Card (Admin Pickers)
  glassCard: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(99,102,241,0.25)',
    borderColor: 'rgba(99,102,241,0.5)',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  filterChipTextActive: {
    color: '#A5B4FC',
  },

  // Main Input
  inputWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  inputInner: {
    margin: 2,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(30, 35, 55, 0.75)',
    overflow: 'hidden',
  },
  textArea: {
    fontSize: 15,
    color: '#FFFFFF',
    minHeight: 90,
    maxHeight: 180,
    fontWeight: '400',
    lineHeight: 22,
  },
  suggestionsScroll: {
    marginTop: 8,
    marginBottom: 2,
  },
  suggestionChip: {
    backgroundColor: 'rgba(99,102,241,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
  },
  suggestionText: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '600',
  },
  mentionDropdown: {
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  avatarMini: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  mentionName: { fontSize: 13, fontWeight: '700', color: '#fff' },
  mentionRole: { fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginTop: 1 },
  taggedRow: { flexDirection: 'row', marginTop: 8 },
  taggedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
  },
  taggedChipText: { fontSize: 12, fontWeight: '700' },
  mediaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(96,165,250,0.1)',
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.25)',
  },
  mediaBadgeText: { color: '#60A5FA', fontSize: 12, fontWeight: '600' },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pillBtnRecording: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.25)',
  },
  pillBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },

  // AI Classification
  classificationCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
    padding: 14,
    backgroundColor: 'rgba(99,102,241,0.04)',
  },
  classificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  classificationLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  classificationBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  sgBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  sgBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  issueBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  issueBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '700',
  },
  classifyingText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
  },

  // Toggles
  togglesContainer: {
    gap: 10,
  },
  toggleCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  toggleCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  toggleIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleCardLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  toggleCardSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
    marginTop: 1,
  },
  iosToggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.12)',
    padding: 3,
    justifyContent: 'center',
  },
  iosToggleCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  iosToggleCircleOn: {
    transform: [{ translateX: 20 }],
  },

  // Error
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  // Success
  successContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
    padding: 40,
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.04)',
    marginTop: 40,
  },
  successIconRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  successBody: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 20,
  },
});
