import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/Colors';
import { createClient } from '@/utils/supabase/client';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  ArrowUpCircle,
  Plus,
  ChevronRight,
  X,
  ArrowUp,
  Clock,
  Users,
  Save,
  Trash2,
  AlertCircle,
  ChevronLeft,
  Shield,
  Zap,
  Timer,
  User,
} from 'lucide-react-native';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EscalationLevel {
  id: string;
  level: number;
  role?: string;
  user_id?: string;
  response_time_minutes: number;
  user_name?: string;
}

interface EscalationHierarchy {
  id: string;
  name: string;
  description?: string;
  property_id: string;
  levels: EscalationLevel[];
  created_at: string;
}

interface UserOption {
  id: string;
  full_name: string;
  email: string;
  role?: string;
}

// ─── Utility ───────────────────────────────────────────────────────────────────

function formatResponseTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

const LEVEL_GRADIENT_COLORS: [string, string][] = [
  ['#6366F1', '#818CF8'],
  ['#0EA5E9', '#38BDF8'],
  ['#F59E0B', '#FCD34D'],
  ['#10B981', '#34D399'],
  ['#F43F5E', '#FB7185'],
];

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function EscalationScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { membership } = useAuth();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';

  const [hierarchies, setHierarchies] = useState<EscalationHierarchy[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedHierarchy, setSelectedHierarchy] = useState<EscalationHierarchy | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formLevels, setFormLevels] = useState<{
    role: string; user_id: string; user_name: string; response_time_minutes: number;
  }[]>([{ role: '', user_id: '', user_name: '', response_time_minutes: 30 }]);

  const isAdmin = useMemo(() => {
    if (!membership || !propertyId) return false;
    const prop = membership.properties.find((p) => p.id === propertyId);
    return prop ? ['property_admin', 'org_admin', 'org_super_admin', 'master_admin'].includes(prop.role.toLowerCase()) : false;
  }, [membership, propertyId]);

  const ROLE_OPTIONS = [
    { label: 'Staff', value: 'staff' },
    { label: 'Manager', value: 'property_manager' },
    { label: 'Admin', value: 'property_admin' },
    { label: 'Org Admin', value: 'org_admin' },
    { label: 'Super Admin', value: 'master_admin' },
    { label: 'Vendor', value: 'vendor' },
  ];

  const fetchAll = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true); else setIsLoading(true);
    try {
      if (!propertyId) return;
      const supabase = createClient();

      const [{ data: hierarchyRows, error: hErr }, { data: memberRows, error: mErr }] = await Promise.all([
        supabase
          .from('escalation_hierarchies')
          .select('*')
          .eq('property_id', propertyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('property_memberships')
          .select('users:user_id(id, full_name, email, role)')
          .eq('property_id', propertyId),
      ]);

      if (hErr) throw new Error(hErr.message);
      if (mErr) throw new Error(mErr.message);

      setHierarchies((hierarchyRows || []) as EscalationHierarchy[]);
      setUsers(
        ((memberRows || [])
          .map((m: any) => m.users)
          .filter(Boolean) as UserOption[])
      );
    } catch (err) {
      console.error('Error fetching data:', err);
    }
    finally { setIsLoading(false); setIsRefreshing(false); }
  }, [propertyId]);

  const { refetch } = useDashboardFetch(queryKeys.property.escalation(propertyId), fetchAll, {
    staleTime: 1000 * 60 * 5,
  });

  const handleHierarchyPress = (hierarchy: EscalationHierarchy) => {
    setSelectedHierarchy(hierarchy);
    setFormName(hierarchy.name);
    setFormDescription(hierarchy.description || '');
    setFormLevels(hierarchy.levels.map((l) => ({
      role: l.role || '', user_id: l.user_id || '', user_name: l.user_name || '', response_time_minutes: l.response_time_minutes,
    })));
    setShowEditModal(true);
  };

  const handleCreateHierarchy = async () => {
    if (!formName.trim() || !propertyId) { Alert.alert('Error', 'Hierarchy name is required'); return; }
    if (formLevels.length === 0 || !formLevels.some((l) => l.role || l.user_id)) { Alert.alert('Error', 'Add at least one escalation level'); return; }
    setIsSaving(true);
    try {
      const supabase = createClient();
      const { error: insertErr } = await supabase
        .from('escalation_hierarchies')
        .insert({
          property_id: propertyId,
          name: formName.trim(),
          description: formDescription.trim() || null,
          levels: formLevels.filter((l) => l.role || l.user_id).map((l, idx) => ({
            level: idx + 1,
            role: l.role || null,
            user_id: l.user_id || null,
            user_name: l.user_name || null,
            response_time_minutes: l.response_time_minutes,
          })),
        });
      if (insertErr) throw new Error(insertErr.message || 'Failed to create hierarchy');
      
      setShowCreateModal(false); resetForm(); await fetchAll();
      Alert.alert('✅ Created', 'Escalation hierarchy created successfully');
    } catch (err: any) { Alert.alert('Error', err.message || 'Failed to create hierarchy'); }
    finally { setIsSaving(false); }
  };

  const handleUpdateHierarchy = async () => {
    if (!selectedHierarchy || !formName.trim()) { Alert.alert('Error', 'Hierarchy name is required'); return; }
    setIsSaving(true);
    try {
      const supabase = createClient();
      const { error: updateErr } = await supabase
        .from('escalation_hierarchies')
        .update({
          name: formName.trim(),
          description: formDescription.trim() || null,
          levels: formLevels.filter((l) => l.role || l.user_id).map((l, idx) => ({
            level: idx + 1,
            role: l.role || null,
            user_id: l.user_id || null,
            user_name: l.user_name || null,
            response_time_minutes: l.response_time_minutes,
          })),
        })
        .eq('id', selectedHierarchy.id)
        .eq('property_id', propertyId);
      if (updateErr) throw new Error(updateErr.message || 'Failed to update hierarchy');
      
      setShowEditModal(false); resetForm(); setSelectedHierarchy(null); await fetchAll();
      Alert.alert('✅ Updated', 'Escalation hierarchy updated');
    } catch (err: any) { Alert.alert('Error', err.message || 'Failed to update hierarchy'); }
    finally { setIsSaving(false); }
  };

  const handleDeleteHierarchy = async (hierarchy: EscalationHierarchy) => {
    Alert.alert('Delete Hierarchy', `Delete "${hierarchy.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const supabase = createClient();
            const { error: delErr } = await supabase
              .from('escalation_hierarchies')
              .delete()
              .eq('id', hierarchy.id)
              .eq('property_id', propertyId);
            if (delErr) throw new Error(delErr.message || 'Failed to delete hierarchy');
            setHierarchies((prev) => prev.filter((h) => h.id !== hierarchy.id));
          } catch (err: any) { Alert.alert('Error', err.message || 'Failed to delete'); }
        },
      },
    ]);
  };

  const resetForm = () => {
    setFormName(''); setFormDescription('');
    setFormLevels([{ role: '', user_id: '', user_name: '', response_time_minutes: 30 }]);
  };

  const addLevel = () => {
    if (formLevels.length >= 5) { Alert.alert('Limit reached', 'Maximum 5 levels allowed'); return; }
    setFormLevels((prev) => [...prev, { role: '', user_id: '', user_name: '', response_time_minutes: 60 }]);
  };

  const removeLevel = (index: number) => {
    if (formLevels.length <= 1) { Alert.alert('Cannot remove', 'At least one level required'); return; }
    setFormLevels((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLevel = (index: number, field: string, value: any) => {
    setFormLevels((prev) => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const selectUserForLevel = (index: number) => {
    if (users.length === 0) { Alert.alert('No users', 'No property members found'); return; }
    Alert.alert('Select User', 'Choose a user for this escalation level', [
      ...users.slice(0, 8).map((u) => ({
        text: u.full_name,
        onPress: () => { updateLevel(index, 'user_id', u.id); updateLevel(index, 'user_name', u.full_name); },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  // ─── Form ─────────────────────────────────────────────────────────────────────

  const renderHierarchyForm = (isEdit: boolean) => {
    const totalResponseTime = formLevels.reduce((sum, l) => sum + (l.response_time_minutes || 0), 0);

    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>

          {/* Name */}
          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>HIERARCHY NAME *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholder="e.g. Critical Ticket Escalation"
            placeholderTextColor={colors.textTertiary}
            value={formName}
            onChangeText={setFormName}
          />

          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholder="Optional — what triggers this escalation?"
            placeholderTextColor={colors.textTertiary}
            value={formDescription}
            onChangeText={setFormDescription}
          />

          {/* Total time banner */}
          <View style={[styles.totalTimeBanner, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30' }]}>
            <Timer size={14} color={colors.primary} />
            <Text style={[styles.totalTimeText, { color: colors.primary }]}>
              Total escalation window: {formatResponseTime(totalResponseTime)}
            </Text>
          </View>

          {/* Levels header */}
          <View style={styles.levelsSectionHeader}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 0 }]}>ESCALATION LEVELS</Text>
            <TouchableOpacity style={[styles.addLevelBtn, { backgroundColor: colors.primary }]} onPress={addLevel}>
              <Plus size={12} color="#FFFFFF" />
              <Text style={styles.addLevelBtnText}>Add Level</Text>
            </TouchableOpacity>
          </View>

          {formLevels.map((level, idx) => {
            const [c1, c2] = LEVEL_GRADIENT_COLORS[idx % LEVEL_GRADIENT_COLORS.length];
            return (
              <View key={idx} style={[styles.levelCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {/* Level header bar */}
                <View style={styles.levelCardHeader}>
                  <LinearGradient colors={[c1, c2]} style={styles.levelNumberBadge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Text style={styles.levelNumberText}>L{idx + 1}</Text>
                  </LinearGradient>
                  <Text style={[styles.levelTitle, { color: colors.text }]}>Level {idx + 1}</Text>
                  <TouchableOpacity onPress={() => removeLevel(idx)} style={styles.removeLevelBtn}>
                    <Trash2 size={14} color={colors.error} />
                  </TouchableOpacity>
                </View>

                {/* Role chips */}
                <Text style={[styles.levelInputLabel, { color: colors.textSecondary }]}>ASSIGN ROLE</Text>
                <View style={styles.roleChipRow}>
                  {ROLE_OPTIONS.map((r) => (
                    <TouchableOpacity
                      key={r.value}
                      style={[styles.roleChip,
                        level.role === r.value
                          ? { backgroundColor: c1 + '22', borderColor: c1 }
                          : { backgroundColor: colors.card, borderColor: colors.border }
                      ]}
                      onPress={() => updateLevel(idx, 'role', r.value)}
                    >
                      <Text style={[styles.roleChipText, { color: level.role === r.value ? c1 : colors.textSecondary }]}>{r.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* User selector */}
                <Text style={[styles.levelInputLabel, { color: colors.textSecondary }]}>SPECIFIC USER (OPTIONAL)</Text>
                <TouchableOpacity
                  style={[styles.userSelectBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => selectUserForLevel(idx)}
                >
                  <User size={14} color={level.user_name ? c1 : colors.textTertiary} />
                  <Text style={[styles.userSelectText, { color: level.user_name ? colors.text : colors.textTertiary }]}>
                    {level.user_name || 'Select user...'}
                  </Text>
                  <ChevronRight size={14} color={colors.textTertiary} />
                </TouchableOpacity>

                {/* Response time */}
                <Text style={[styles.levelInputLabel, { color: colors.textSecondary }]}>RESPONSE TIME</Text>
                <View style={styles.responseTimeRow}>
                  {[15, 30, 60, 120, 240].map((mins) => (
                    <TouchableOpacity
                      key={mins}
                      style={[styles.timeChip,
                        level.response_time_minutes === mins
                          ? { backgroundColor: c1 + '22', borderColor: c1 }
                          : { backgroundColor: colors.card, borderColor: colors.border }
                      ]}
                      onPress={() => updateLevel(idx, 'response_time_minutes', mins)}
                    >
                      <Text style={[styles.timeChipText, { color: level.response_time_minutes === mins ? c1 : colors.textSecondary }]}>
                        {formatResponseTime(mins)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Arrow connector */}
                {idx < formLevels.length - 1 && (
                  <View style={[styles.arrowConnector, { borderTopColor: colors.border }]}>
                    <ArrowUp size={12} color={c1} />
                    <Text style={[styles.arrowConnectorText, { color: colors.textTertiary }]}>
                      Escalates after {formatResponseTime(level.response_time_minutes)}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary }, isSaving && { opacity: 0.6 }]}
          onPress={isEdit ? handleUpdateHierarchy : handleCreateHierarchy}
          disabled={isSaving}
        >
          {isSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
            <>
              <Save size={18} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>{isEdit ? 'Update Hierarchy' : 'Save Hierarchy'}</Text>
            </>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  };

  // ─── Loading ──────────────────────────────────────────────────────────────────

  if (isLoading && hierarchies.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={isDark ? ['#0f172a', '#1e1b4b', '#0f172a'] : ['#eef2f6', '#f8fafc', '#ffffff']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading escalation matrix...</Text>
        </View>
      </View>
    );
  }

  // ─── Main ─────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) + 70 }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={isDark ? ['#0f172a', '#1e1b4b', '#0f172a'] : ['#eef2f6', '#f8fafc', '#ffffff']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Header ── */}
      <SafeBlurView
        intensity={80}
        tint={isDark ? 'dark' : 'light'}
        style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', overflow: 'hidden' }]}
      >
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? 'rgba(22,27,40,0.65)' : 'rgba(255,255,255,0.7)' }]} />
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
            <ChevronLeft size={24} color={isDark ? '#FFFFFF' : '#0f172a'} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: isDark ? '#FFFFFF' : '#0f172a' }]}>Escalation Matrix</Text>
            <Text style={[styles.headerSubtitle, { color: isDark ? 'rgba(255,255,255,0.5)' : '#64748B' }]}>
              {hierarchies.length} {hierarchies.length === 1 ? 'hierarchy' : 'hierarchies'} configured
            </Text>
          </View>
          {isAdmin && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={() => { resetForm(); setShowCreateModal(true); }}
            >
              <Plus size={22} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      </SafeBlurView>

      {/* ── Summary strip ── */}
      {hierarchies.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4, gap: 12 }}
        >
          {[
            { label: 'Total Hierarchies', value: hierarchies.length, icon: Shield, color: '#6366F1' },
            { label: 'Total Levels', value: hierarchies.reduce((s, h) => s + h.levels.length, 0), icon: Zap, color: '#F59E0B' },
            { label: 'Avg. Window', value: hierarchies.length ? formatResponseTime(Math.round(hierarchies.reduce((s, h) => s + h.levels.reduce((ls, l) => ls + l.response_time_minutes, 0), 0) / hierarchies.length)) : '-', icon: Timer, color: '#10B981' },
          ].map((stat, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]}>
              <View style={[styles.statIconWrap, { backgroundColor: stat.color + '20' }]}>
                <stat.icon size={16} color={stat.color} />
              </View>
              <Text style={[styles.statValue, { color: isDark ? '#FFFFFF' : '#0f172a' }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>{stat.label}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── List ── */}
      <FlatList
        data={hierarchies}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => refetch()} tintColor={colors.primary} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
              <ArrowUpCircle size={40} color={colors.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: isDark ? '#FFFFFF' : '#0f172a' }]}>No escalation hierarchies</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
              {isAdmin ? 'Define who gets alerted at each level' : 'No escalation configured yet'}
            </Text>
            {isAdmin && (
              <TouchableOpacity style={[styles.createFirstBtn, { backgroundColor: colors.primary }]} onPress={() => { resetForm(); setShowCreateModal(true); }}>
                <Plus size={16} color="#FFFFFF" />
                <Text style={styles.createFirstBtnText}>Create First Hierarchy</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item: hierarchy }) => {
          const totalTime = hierarchy.levels.reduce((s, l) => s + (l.response_time_minutes || 0), 0);
          const sortedLevels = [...(hierarchy.levels || [])].sort((a, b) => a.level - b.level);

          return (
            <TouchableOpacity
              style={[styles.hierarchyCard, {
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.9)',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              }]}
              onPress={() => handleHierarchyPress(hierarchy)}
              activeOpacity={0.8}
            >
              {/* Card header */}
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconWrap, { backgroundColor: colors.primary + '18' }]}>
                  <Shield size={20} color={colors.primary} />
                </View>
                <View style={styles.cardHeaderContent}>
                  <Text style={[styles.cardName, { color: isDark ? '#FFFFFF' : '#0f172a' }]} numberOfLines={1}>{hierarchy.name}</Text>
                  {hierarchy.description ? (
                    <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={1}>{hierarchy.description}</Text>
                  ) : null}
                </View>
                <View style={styles.cardHeaderRight}>
                  <View style={[styles.levelCountPill, { backgroundColor: colors.primary + '18' }]}>
                    <Text style={[styles.levelCountText, { color: colors.primary }]}>{hierarchy.levels.length}</Text>
                    <Text style={[styles.levelCountLabel, { color: colors.primary }]}>LVL</Text>
                  </View>
                </View>
              </View>

              {/* Visual escalation chain */}
              {sortedLevels.length > 0 && (
                <View style={styles.chainContainer}>
                  {sortedLevels.map((level, idx) => {
                    const [c1] = LEVEL_GRADIENT_COLORS[idx % LEVEL_GRADIENT_COLORS.length];
                    const label = level.role
                      ? level.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                      : level.user_name || 'Unassigned';
                    return (
                      <View key={level.id || idx} style={styles.chainItem}>
                        <View style={styles.chainLeft}>
                          <View style={[styles.chainDot, { backgroundColor: c1 }]}>
                            <Text style={styles.chainDotText}>{idx + 1}</Text>
                          </View>
                          {idx < sortedLevels.length - 1 && (
                            <View style={[styles.chainLine, { backgroundColor: c1 + '40' }]} />
                          )}
                        </View>
                        <View style={[styles.chainCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: c1 + '30' }]}>
                          <Text style={[styles.chainLabel, { color: isDark ? '#FFFFFF' : '#0f172a' }]} numberOfLines={1}>{label}</Text>
                          <View style={[styles.chainTimePill, { backgroundColor: c1 + '20' }]}>
                            <Clock size={10} color={c1} />
                            <Text style={[styles.chainTimeText, { color: c1 }]}>{formatResponseTime(level.response_time_minutes)}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Footer */}
              <View style={[styles.cardFooter, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                <View style={styles.footerLeft}>
                  <Timer size={12} color={colors.textTertiary} />
                  <Text style={[styles.footerText, { color: colors.textTertiary }]}>Window: {formatResponseTime(totalTime)}</Text>
                </View>
                <View style={styles.footerRight}>
                  {isAdmin && (
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteHierarchy(hierarchy)}>
                      <Trash2 size={14} color={colors.error} />
                    </TouchableOpacity>
                  )}
                  <View style={[styles.editBtn, { backgroundColor: colors.primary + '18' }]}>
                    <ChevronRight size={16} color={colors.primary} />
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ── Create Modal ── */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.formSheet, { backgroundColor: colors.card }]}>
            <LinearGradient
              colors={isDark ? ['rgba(99,102,241,0.08)', 'transparent'] : ['rgba(99,102,241,0.04)', 'transparent']}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
            />
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderLeft}>
                <View style={[styles.modalIconWrap, { backgroundColor: colors.primary + '18' }]}>
                  <Plus size={18} color={colors.primary} />
                </View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>New Hierarchy</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowCreateModal(false); resetForm(); }} style={[styles.closeBtn, { backgroundColor: colors.surface }]}>
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {renderHierarchyForm(false)}
          </View>
        </View>
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.formSheet, { backgroundColor: colors.card }]}>
            <LinearGradient
              colors={isDark ? ['rgba(99,102,241,0.08)', 'transparent'] : ['rgba(99,102,241,0.04)', 'transparent']}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
            />
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderLeft}>
                <View style={[styles.modalIconWrap, { backgroundColor: colors.primary + '18' }]}>
                  <Shield size={18} color={colors.primary} />
                </View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Hierarchy</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowEditModal(false); resetForm(); setSelectedHierarchy(null); }} style={[styles.closeBtn, { backgroundColor: colors.surface }]}>
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {renderHierarchyForm(true)}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 14, fontFamily: 'Urbanist-Medium' },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 22, fontFamily: 'Poppins-Bold', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 12, fontFamily: 'Urbanist-Medium', marginTop: 1 },
  addBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },

  // Stat strip
  statCard: {
    alignItems: 'center', borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 18, paddingVertical: 14, gap: 4, minWidth: 110,
  },
  statIconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue: { fontSize: 20, fontFamily: 'Poppins-Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Urbanist-Medium', textAlign: 'center' },

  // List
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontFamily: 'Poppins-Bold' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Urbanist-Regular', textAlign: 'center', maxWidth: 240 },
  createFirstBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  createFirstBtnText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Poppins-Bold' },

  // Hierarchy card
  hierarchyCard: { borderRadius: 20, borderWidth: 1, padding: 16, marginBottom: 14, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  cardIconWrap: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cardHeaderContent: { flex: 1 },
  cardName: { fontSize: 16, fontFamily: 'Poppins-Bold', marginBottom: 2 },
  cardDesc: { fontSize: 11, fontFamily: 'Urbanist-Regular' },
  cardHeaderRight: {},
  levelCountPill: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  levelCountText: { fontSize: 18, fontFamily: 'Poppins-Bold', lineHeight: 22 },
  levelCountLabel: { fontSize: 8, fontFamily: 'Urbanist-Bold', letterSpacing: 0.5 },

  // Chain
  chainContainer: { marginBottom: 14 },
  chainItem: { flexDirection: 'row', gap: 10, marginBottom: 0 },
  chainLeft: { alignItems: 'center', width: 28 },
  chainDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  chainDotText: { fontSize: 11, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  chainLine: { width: 2, flex: 1, marginVertical: 2, minHeight: 12 },
  chainCard: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  chainLabel: { fontSize: 12, fontFamily: 'Urbanist-Bold', flex: 1 },
  chainTimePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  chainTimeText: { fontSize: 10, fontFamily: 'Urbanist-Bold' },

  // Card footer
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTopWidth: 1 },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerText: { fontSize: 11, fontFamily: 'Urbanist-Medium' },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  editBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  formSheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 20, overflow: 'hidden' },
  modalHandle: { width: 40, height: 4, backgroundColor: 'rgba(150,150,150,0.4)', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 18, fontFamily: 'Poppins-Bold' },
  closeBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  formScroll: { flex: 1 },

  // Form
  inputLabel: { fontSize: 11, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Urbanist-Regular' },
  totalTimeBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 16, borderWidth: 1 },
  totalTimeText: { fontSize: 13, fontFamily: 'Poppins-Bold' },
  levelsSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 },
  addLevelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  addLevelBtnText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Urbanist-Bold' },

  levelCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  levelCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  levelNumberBadge: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  levelNumberText: { color: '#FFFFFF', fontSize: 13, fontFamily: 'Poppins-Bold' },
  levelTitle: { flex: 1, fontSize: 15, fontFamily: 'Poppins-Bold' },
  removeLevelBtn: { padding: 4 },
  levelInputLabel: { fontSize: 10, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8, marginTop: 10 },
  roleChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  roleChipText: { fontSize: 11, fontFamily: 'Urbanist-Bold' },
  userSelectBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  userSelectText: { flex: 1, fontSize: 13, fontFamily: 'Urbanist-Regular' },
  responseTimeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  timeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  timeChipText: { fontSize: 11, fontFamily: 'Urbanist-Bold' },
  arrowConnector: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 10, borderTopWidth: 1 },
  arrowConnectorText: { fontSize: 11, fontFamily: 'Urbanist-Regular' },

  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, paddingVertical: 15, marginTop: 10 },
  submitBtnText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Poppins-Bold' },
});
