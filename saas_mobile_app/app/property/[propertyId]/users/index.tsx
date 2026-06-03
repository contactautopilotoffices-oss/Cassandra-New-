import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Keyboard,
  ScrollView,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/utils/supabase/client';
import { fetchUsersList, createMemberUser, updateMemberRole } from '@/utils/api/mobileApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/hooks/useAuth';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { Ionicons } from '@expo/vector-icons';


import {
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import {
  Search,
  UserPlus,
  Mail,
  Phone,
  Shield,
  User,
  Building2,
  Calendar,
  Key,
  RefreshCw,
  Trash2,
  Edit2,
  X,
  ChevronRight,
  MoreVertical,
  Wrench,
  Star,
} from 'lucide-react-native';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserWithMembership {
  id: string;
  full_name: string;
  email: string;
  user_photo_url?: string;
  phone?: string;
  propertyRole?: string;
  is_active: boolean;
  joined_at: string;
  role: string;
  is_accepted: boolean;
}

interface UserSkills {
  skill_code: string;
}

// ─── Role Helpers ─────────────────────────────────────────────────────────────

const PROPERTY_ROLE_OPTIONS = ['property_admin', 'staff', 'mst', 'security'];

function formatRole(role: string): string {
  if (!role) return 'Member';
  if (role === 'tenant') return 'Client';
  if (role === 'super_tenant') return 'Super Client';
  if (role === 'property_admin') return 'Admin';
  if (role === 'mst') return 'MST';
  if (role === 'staff') return 'Staff';
  if (role === 'security') return 'Security';
  if (role === 'soft_service_manager') return 'SSM';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function getRoleBadgeColor(role: string): {
  bg: string;
  text: string;
  border: string;
} {
  switch (role) {
    case 'property_admin':
      return { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' };
    case 'staff':
      return { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' };
    case 'mst':
      return { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' };
    case 'security':
      return { bg: '#F3E8FF', text: '#6B21A8', border: '#C4B5FD' };
    default:
      return { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' };
  }
}

// ─── Segmented Control ────────────────────────────────────────────────────────

function SegmentedControl({
  selected,
  onSelect,
  colors,
  tabs,
}: {
  selected: string;
  onSelect: (key: string) => void;
  colors: typeof Colors.light;
  tabs: Array<{ key: string; label: string }>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.segmentScroll}
      contentContainerStyle={styles.segmentScrollContent} showsVerticalScrollIndicator={false}>
      <SafeBlurView
        intensity={60}
        tint="dark"
        style={[
          styles.segmentContainer,
          { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(15,23,42,0.65)', overflow: 'hidden' },
        ]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.04)', 'rgba(0,0,0,0.05)']}
          style={StyleSheet.absoluteFillObject}
        />
        {tabs.map((tab) => {
          const isSelected = selected === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.segmentItemScroll,
                isSelected && { backgroundColor: 'rgba(255,255,255,0.15)' },
              ]}
              onPress={() => onSelect(tab.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: isSelected ? '#FFFFFF' : '#94A3B8' },
                  isSelected && styles.segmentTextSelected,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </SafeBlurView>
    </ScrollView>
  );
}

// ─── User Card ────────────────────────────────────────────────────────────────

function UserCard({
  user,
  onPress,
  colors,
}: {
  user: UserWithMembership;
  onPress: () => void;
  colors: typeof Colors.light;
}) {
  const roleBadge = getRoleBadgeColor(user.propertyRole || user.role || 'staff');
  const initials = user.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  return (
    <TouchableOpacity
      style={[styles.userCardWrapper]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <SafeBlurView
        intensity={60}
        tint="dark"
        style={styles.userCard}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.04)', 'rgba(0,0,0,0.05)']}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Avatar */}
        <View
          style={[
            styles.avatarCircle,
            { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' },
          ]}
        >
          {user.user_photo_url ? (
            <Image
              source={{ uri: user.user_photo_url }}
              style={styles.avatarImage}
            />
          ) : (
            <Text style={[styles.avatarInitials, { color: '#FFFFFF' }]}>
              {initials}
            </Text>
          )}
        </View>

        {/* User Info */}
        <View style={styles.userCardInfo}>
          <View style={styles.userCardNameRow}>
            <Text
              style={[styles.userCardName, { color: '#FFFFFF' }]}
              numberOfLines={1}
            >
              {user.full_name || 'Unknown'}
            </Text>
            <View
              style={[
                styles.roleBadge,
                { backgroundColor: roleBadge.bg, borderColor: roleBadge.border },
              ]}
            >
              <Text style={[styles.roleBadgeText, { color: roleBadge.text }]}>
                {formatRole(user.propertyRole || user.role)}
              </Text>
            </View>
          </View>

          <Text
            style={[styles.userCardEmail, { color: '#94A3B8' }]}
            numberOfLines={1}
          >
            {user.email}
          </Text>

          <View style={styles.userCardMeta}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: user.is_active ? '#10B981' : '#94A3B8',
                },
              ]}
            />
            <Text style={[styles.statusText, { color: '#94A3B8' }]}>
              {user.is_active ? 'Active' : 'Inactive'}
            </Text>
            {user.joined_at && (
              <>
                <Text style={[styles.metaDivider, { color: 'rgba(255,255,255,0.3)' }]}>
                  {' '}
                  ·{' '}
                </Text>
                <Text style={[styles.statusText, { color: '#94A3B8' }]}>
                  Joined {formatJoinDate(user.joined_at)}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Chevron */}
        <ChevronRight
          size={18}
          color="rgba(255,255,255,0.4)"
          style={styles.chevron}
        />
      </SafeBlurView>
    </TouchableOpacity>
  );
}

function formatJoinDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  } catch {
    return '';
  }
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ colors }: { colors: typeof Colors.light }) {
  return (
    <View style={styles.emptyState}>
      <SafeBlurView
        intensity={40}
        tint="dark"
        style={[
          styles.emptyIconWrap,
          { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
        ]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.05)']}
          style={StyleSheet.absoluteFillObject}
        />
        <Search size={32} color={colors.primary} />
      </SafeBlurView>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        No team members found
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        Try adjusting your search or filter, or add a new member.
      </Text>
    </View>
  );
}

// ─── Loading State ───────────────────────────────────────────────────────────

function LoadingState({ colors }: { colors: typeof Colors.light }) {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
        Loading team members...
      </Text>
    </View>
  );
}

// ─── User Detail Bottom Sheet ─────────────────────────────────────────────────

function UserDetailSheet({
  user,
  propertyId,
  bottomSheetRef,
  colors,
  onUpdate,
}: {
  user: UserWithMembership;
  propertyId: string;
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  colors: typeof Colors.light;
  onUpdate: () => void;
}) {
  const snapPoints = useMemo(() => ['55%', '80%'], []);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [selectedRole, setSelectedRole] = useState(user.propertyRole || user.role);
  const [skills, setSkills] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const { user: authUser } = useAuth();

  useEffect(() => {
    loadSkills();
  }, []);

  async function loadSkills() {
    if (user.propertyRole === 'mst' || user.propertyRole === 'staff') {
      const { data } = await (supabase
        .from('mst_skills') as any)
        .select('skill_code')
        .eq('user_id', user.id)
        .eq('property_id', propertyId);
      if (data) setSkills(data.map((s: UserSkills) => s.skill_code));
    }
  }

  async function handleUpdateRole() {
    setIsLoading(true);
    try {
      const response = await updateMemberRole({
        userId: user.id,
        newRole: selectedRole,
        propertyId,
        skills,
        oldRole: user.propertyRole || user.role,
      });
      if (response.error) {
        throw new Error(response.error);
      }
      setShowRolePicker(false);
      onUpdate();
      bottomSheetRef.current?.dismiss();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update role');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleActive() {
    setIsLoading(true);
    try {
      const { error } = await (supabase
        .from('property_memberships') as any)
        .update({ is_active: !user.is_active })
        .eq('user_id', user.id)
        .eq('property_id', propertyId);
      if (error) throw error;
      onUpdate();
      bottomSheetRef.current?.dismiss();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update status');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetPassword() {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: 'autopilot://reset-password',
      });
      if (error) throw error;
      Alert.alert('Success', `Password reset email sent to ${user.email}`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send reset email');
    }
  }

  async function handleRemoveUser() {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('property_memberships')
        .delete()
        .eq('user_id', user.id)
        .eq('property_id', propertyId);
      if (error) throw error;
      onUpdate();
      bottomSheetRef.current?.dismiss();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to remove member');
    } finally {
      setIsLoading(false);
    }
  }

  const initials = user.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  const roleBadge = getRoleBadgeColor(user.propertyRole || user.role || 'staff');

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: '#0a0f1e' }}
      handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.25)', width: 40 }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient colors={['rgba(112,143,150,0.18)', 'rgba(0,0,0,0)']} style={styles.sheetHeaderGrad}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetAvatarGlow}>
              <View style={styles.sheetAvatar}>
                {user.user_photo_url ? (
                  <Image source={{ uri: user.user_photo_url }} style={styles.sheetAvatarImage} />
                ) : (
                  <Text style={styles.sheetAvatarText}>{initials}</Text>
                )}
              </View>
            </View>
            <Text style={styles.sheetName}>{user.full_name || 'Unknown'}</Text>
            <View style={[styles.sheetRoleBadge, { backgroundColor: roleBadge.bg + '22', borderColor: roleBadge.border + '88' }]}>
              <Text style={[styles.sheetRoleBadgeText, { color: roleBadge.border }]}>{formatRole(user.propertyRole || user.role)}</Text>
            </View>
            <View style={[styles.sheetStatusBadge, { backgroundColor: user.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }]}>
              <View style={[styles.sheetStatusDot, { backgroundColor: user.is_active ? '#10B981' : '#EF4444', shadowColor: user.is_active ? '#10B981' : '#EF4444', shadowOpacity: 0.8, shadowRadius: 4 }]} />
              <Text style={[styles.sheetStatusText, { color: user.is_active ? '#10B981' : '#EF4444' }]}>{user.is_active ? 'Active' : 'Inactive'}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* User Details */}
        <View style={styles.sheetSection}>
          <DetailRow icon={<Mail size={14} color="#708F96" />} label="Email" value={user.email} colors={colors} />
          {user.phone && <DetailRow icon={<Phone size={14} color="#708F96" />} label="Phone" value={user.phone} colors={colors} />}
          <DetailRow icon={<Building2 size={14} color="#708F96" />} label="Role" value={formatRole(user.propertyRole || user.role)} colors={colors} />
          {user.joined_at && <DetailRow icon={<Calendar size={14} color="#708F96" />} label="Joined" value={new Date(user.joined_at).toLocaleDateString()} colors={colors} />}
          {skills.length > 0 && <DetailRow icon={<Wrench size={14} color="#708F96" />} label="Skills" value={skills.join(', ')} colors={colors} />}
        </View>

        {/* Actions */}
        <View style={styles.sheetActions}>
          {/* Change Role */}
          <TouchableOpacity style={styles.actionButton} onPress={() => setShowRolePicker(!showRolePicker)} activeOpacity={0.75}>
            <View style={styles.actionLeft}>
              <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(112,143,150,0.18)' }]}><Shield size={16} color="#708F96" /></View>
              <Text style={styles.actionText}>Change Role</Text>
            </View>
            <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
          </TouchableOpacity>

          {showRolePicker && (
            <View
              style={[
                styles.rolePickerContainer,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              {PROPERTY_ROLE_OPTIONS.map((role) => {
                const isSelected = selectedRole === role;
                return (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.roleOption,
                      isSelected && { backgroundColor: colors.primaryLight },
                    ]}
                    onPress={() => setSelectedRole(role)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.roleOptionText,
                        { color: isSelected ? colors.primary : colors.text },
                      ]}
                    >
                      {formatRole(role)}
                    </Text>
                    {isSelected && (
                      <View
                        style={[
                          styles.roleOptionDot,
                          { backgroundColor: colors.primary },
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
              <Button
                title="Save Role"
                variant="primary"
                size="md"
                onPress={handleUpdateRole}
                loading={isLoading}
                style={{ marginTop: 12 }}
              />
            </View>
          )}

          {/* Reset Password */}
          <TouchableOpacity style={styles.actionButton} onPress={handleResetPassword} activeOpacity={0.75}>
            <View style={styles.actionLeft}>
              <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(59,130,246,0.15)' }]}><Key size={16} color="#3B82F6" /></View>
              <Text style={styles.actionText}>Reset Password</Text>
            </View>
            <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
          </TouchableOpacity>

          {/* Deactivate / Activate */}
          <TouchableOpacity style={styles.actionButton} onPress={handleToggleActive} activeOpacity={0.75} disabled={isLoading}>
            <View style={styles.actionLeft}>
              <View style={[styles.actionIconWrap, { backgroundColor: user.is_active ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)' }]}><RefreshCw size={16} color={user.is_active ? '#EF4444' : '#10B981'} /></View>
              <Text style={[styles.actionText, { color: user.is_active ? '#EF4444' : '#10B981' }]}>{user.is_active ? 'Deactivate' : 'Activate'}</Text>
            </View>
            <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
          </TouchableOpacity>

          {/* Remove */}
          {showConfirmDelete ? (
            <View style={styles.confirmDeleteContainer}>
              <Text style={styles.confirmDeleteText}>Remove {user.full_name} from this property?</Text>
              <View style={styles.confirmDeleteButtons}>
                <Button title="Cancel" variant="ghost" size="sm" onPress={() => setShowConfirmDelete(false)} />
                <Button title="Remove" variant="danger" size="sm" onPress={handleRemoveUser} loading={isLoading} />
              </View>
            </View>
          ) : (
            <TouchableOpacity style={[styles.actionButton, { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)' }]} onPress={() => setShowConfirmDelete(true)} activeOpacity={0.75}>
              <View style={styles.actionLeft}>
                <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(239,68,68,0.15)' }]}><Trash2 size={16} color="#EF4444" /></View>
                <Text style={[styles.actionText, { color: '#EF4444' }]}>Remove from Property</Text>
              </View>
              <ChevronRight size={16} color="rgba(239,68,68,0.5)" />
            </TouchableOpacity>
          )}
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

function DetailRow({
  icon,
  label,
  value,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  colors: typeof Colors.light;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>{icon}</View>
      <View style={styles.detailContent}>
        <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>
          {label}
        </Text>
        <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Invite Member Bottom Sheet ───────────────────────────────────────────────

// ─── Invite Member Bottom Sheet ───────────────────────────────────────────────

function InviteMemberSheet({
  bottomSheetRef,
  propertyId,
  organizationId,
  colors,
  onSuccess,
}: {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  propertyId: string;
  organizationId: string;
  colors: typeof Colors.light;
  onSuccess: () => void;
}) {
  const snapPoints = useMemo(() => ['92%'], []);
  const [mode, setMode] = useState<'invite' | 'create'>('create');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('staff');
  const [specialization, setSpecialization] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const SPEC_OPTIONS = [
    { code: '', label: 'General' },
    { code: 'soft_service', label: 'Soft Services' },
    { code: 'technical', label: 'Technical' },
    { code: 'plumbing', label: 'Plumbing' },
    { code: 'electrical', label: 'Electrical' },
  ];

  const SKILL_OPTIONS = useMemo(() => {
    if (role === 'mst') {
      return [
        { code: 'technical', label: 'Technical' },
        { code: 'plumbing', label: 'Plumbing' },
        { code: 'vendor', label: 'Vendor Coordination' },
      ];
    }
    if (role === 'staff') {
      return [
        { code: 'technical', label: 'Technical' },
        { code: 'soft_services', label: 'Soft Services' },
      ];
    }
    return [];
  }, [role]);

  function resetForm() {
    setFullName('');
    setEmail('');
    setPassword('');
    setPhone('');
    setRole('staff');
    setSpecialization('');
    setSelectedSkills([]);
    setError('');
    setSuccess('');
  }

  async function handleSubmit() {
    setError('');
    setSuccess('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }
    if (mode === 'create' && !fullName.trim()) {
      setError('Full Name is required');
      return;
    }
    if (!organizationId) {
      setError('Organization not resolved. Please reload.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await createMemberUser({
        email: email.trim().toLowerCase(),
        password: password.trim() || undefined,
        full_name: fullName.trim() || email.trim().split('@')[0] || 'User',
        phone: phone.trim() || undefined,
        organization_id: organizationId!,
        role: role,
        property_id: propertyId ?? '',
        specialization: role === 'staff' ? (specialization || undefined) : undefined,
        skills: (role === 'staff' || role === 'mst') ? selectedSkills : undefined,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      setSuccess(mode === 'invite'
        ? 'Invitation sent successfully'
        : `Account created${(response as any).temp_password ? `. Temp password: ${(response as any).temp_password}` : ''}`
      );

      setTimeout(() => {
        bottomSheetRef.current?.dismiss();
        resetForm();
        onSuccess();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to create member');
    } finally {
      setIsLoading(false);
    }
  }

  const inputGlass = {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.08)',
  };

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: '#0B0F1A' }}
      handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.2)', width: 40 }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.inviteHeader}>
          <LinearGradient colors={['rgba(112,143,150,0.15)', 'rgba(0,0,0,0)']} style={styles.inviteHeaderGrad}>
            <View style={styles.inviteIconWrap}>
              <UserPlus size={24} color="#708F96" />
            </View>
            <Text style={styles.inviteTitle}>Add Team Member</Text>
            <Text style={styles.inviteSubtitle}>
              {mode === 'invite' ? 'Send an email invitation to join.' : 'Create a direct account for this property.'}
            </Text>
          </LinearGradient>
        </View>

        {/* Mode Toggle */}
        <View style={styles.modeToggleContainer}>
          <TouchableOpacity
            style={[styles.modeToggleBtn, mode === 'create' && styles.modeToggleActive]}
            onPress={() => setMode('create')}
            activeOpacity={0.8}
          >
            <Text style={[styles.modeToggleText, mode === 'create' && styles.modeToggleTextActive]}>
              Create Directly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeToggleBtn, mode === 'invite' && styles.modeToggleActive]}
            onPress={() => setMode('invite')}
            activeOpacity={0.8}
          >
            <Text style={[styles.modeToggleText, mode === 'invite' && styles.modeToggleTextActive]}>
              Invite via Email
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.inviteForm}>
          {error ? (
            <View style={styles.alertCard}>
              <Ionicons name="alert-circle" size={16} color="#EF4444" />
              <Text style={styles.alertText}>{error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={[styles.alertCard, { borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.08)' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={[styles.alertText, { color: '#10B981' }]}>{success}</Text>
            </View>
          ) : null}

          {/* Email */}
          <View style={styles.glassInputGroup}>
            <View style={styles.glassInputIcon}>
              <Mail size={16} color="rgba(255,255,255,0.4)" />
            </View>
            <TextInput
              style={styles.glassInput}
              placeholder="Email Address"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={email}
              onChangeText={(text) => { setEmail(text); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Full Name — create mode only */}
          {mode === 'create' && (
            <View style={styles.glassInputGroup}>
              <View style={styles.glassInputIcon}>
                <User size={16} color="rgba(255,255,255,0.4)" />
              </View>
              <TextInput
                style={styles.glassInput}
                placeholder="Full Name"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>
          )}

          {/* Password — create mode only */}
          {mode === 'create' && (
            <View style={styles.glassInputGroup}>
              <View style={styles.glassInputIcon}>
                <Key size={16} color="rgba(255,255,255,0.4)" />
              </View>
              <TextInput
                style={[styles.glassInput, { flex: 1, paddingRight: 40 }]}
                placeholder="Password (auto-generated if blank)"
                placeholderTextColor="rgba(255,255,255,0.3)"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={{ position: 'absolute', right: 14 }}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color="rgba(255,255,255,0.4)"
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Phone */}
          <View style={styles.glassInputGroup}>
            <View style={styles.glassInputIcon}>
              <Phone size={16} color="rgba(255,255,255,0.4)" />
            </View>
            <TextInput
              style={styles.glassInput}
              placeholder="Phone Number (optional)"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          {/* Role */}
          <View style={styles.inputGroup}>
            <Text style={styles.sectionLabel}>Role</Text>
            <View style={styles.roleSelectorContainer}>
              {PROPERTY_ROLE_OPTIONS.map((r) => {
                const isSelected = role === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.roleChip,
                      isSelected && styles.roleChipActive,
                    ]}
                    onPress={() => {
                      setRole(r);
                      setSelectedSkills([]);
                      setSpecialization('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.roleChipText, isSelected && styles.roleChipTextActive]}>
                      {formatRole(r)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Specialization */}
          {role === 'staff' && (
            <View style={styles.inputGroup}>
              <Text style={styles.sectionLabel}>Specialization</Text>
              <View style={styles.roleSelectorContainer}>
                {SPEC_OPTIONS.map((spec) => {
                  const isSelected = specialization === spec.code;
                  return (
                    <TouchableOpacity
                      key={spec.code}
                      style={[styles.roleChip, isSelected && styles.roleChipActive]}
                      onPress={() => setSpecialization(spec.code)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.roleChipText, isSelected && styles.roleChipTextActive]}>
                        {spec.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Skills */}
          {(role === 'mst' || role === 'staff') && (
            <View style={styles.inputGroup}>
              <Text style={styles.sectionLabel}>Member Skills</Text>
              <View style={styles.skillListContainer}>
                {SKILL_OPTIONS.map((skill) => {
                  const isSelected = selectedSkills.includes(skill.code);
                  return (
                    <TouchableOpacity
                      key={skill.code}
                      style={[styles.skillItem, isSelected && styles.skillItemActive]}
                      onPress={() => {
                        setSelectedSkills((prev) =>
                          isSelected ? prev.filter((s) => s !== skill.code) : [...prev, skill.code]
                        );
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.skillItemText, isSelected && styles.skillItemTextActive]}>
                        {skill.label}
                      </Text>
                      <View style={[styles.skillCheckbox, isSelected && styles.skillCheckboxActive]}>
                        {isSelected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.inviteActions}>
          <TouchableOpacity
            style={[styles.submitBtn, isLoading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#708F96', '#4A6B73']}
              style={StyleSheet.absoluteFill}
            />
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <UserPlus size={16} color="#fff" />
                <Text style={styles.submitBtnText}>
                  {mode === 'invite' ? 'Send Invitation' : 'Create Member'}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              bottomSheetRef.current?.dismiss();
              resetForm();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function UsersScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  const [users, setUsers] = useState<UserWithMembership[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState('all');
  const [selectedUser, setSelectedUser] = useState<UserWithMembership | null>(null);

  // Dynamically extract all unique roles present in the team
  const availableRoles = useMemo(() => {
    const unique = new Set<string>();
    users.forEach((u) => {
      const r = u.propertyRole || u.role;
      if (r) unique.add(r);
    });

    const activeRoles = Array.from(unique);

    return [
      { key: 'all', label: 'All' },
      ...activeRoles.map((r) => {
        let label = formatRole(r);
        if (r === 'property_admin') label = 'Admins';
        else if (r === 'staff') label = 'Staff';
        else if (r === 'mst') label = 'MST';
        else if (r === 'security') label = 'Security';
        else if (r === 'tenant') label = 'Clients';
        else if (r === 'super_tenant') label = 'Super Clients';
        else {
          if (!label.endsWith('s')) {
            label = label + 's';
          }
        }
        return { key: r, label };
      }),
    ];
  }, [users]);

  // If the selected tab is no longer available in the roles list, reset it to 'all'
  useEffect(() => {
    if (selectedTab !== 'all' && !availableRoles.some((r) => r.key === selectedTab)) {
      setSelectedTab('all');
    }
  }, [availableRoles, selectedTab]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  // Bottom sheet refs
  const userDetailSheetRef = useRef<BottomSheetModal>(null);
  const inviteSheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (propertyId) {
      supabase
        .from('properties')
        .select('organization_id')
        .eq('id', propertyId)
        .single()
        .then(({ data }: any) => {
          if (data?.organization_id) {
            setOrganizationId(data.organization_id);
          }
        });
    }
  }, [propertyId]);

  const { refetch } = useDashboardFetch(queryKeys.property.users(propertyId), fetchUsers, {
    staleTime: 1000 * 60 * 5,
  });

  async function fetchUsers() {
    if (!propertyId) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('property_memberships')
        .select(
          `
          role,
          is_active,
          created_at,
          user:users(id, email, full_name, phone, user_photo_url)
        `
        )
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: UserWithMembership[] = (data || []).map((m: any) => ({
        id: m.user?.id || '',
        full_name: m.user?.full_name || 'Unknown',
        email: m.user?.email || '',
        user_photo_url: m.user?.user_photo_url,
        phone: m.user?.phone,
        propertyRole: m.role,
        role: m.role,
        is_active: m.is_active ?? true,
        is_accepted: true,
        joined_at: m.created_at || new Date().toISOString(),
      }));

      setUsers(mapped);
    } catch (err) {
      console.error('[Users] fetchUsers error:', err);
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function handleUserPress(user: UserWithMembership) {
    setSelectedUser(user);
    userDetailSheetRef.current?.present();
  }

  function handleAddMember() {
    inviteSheetRef.current?.present();
  }

  // Filter logic
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !searchQuery.trim() ||
      u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTab =
      selectedTab === 'all' ||
      (u.propertyRole || u.role) === selectedTab ||
      u.role === selectedTab;

    return matchesSearch && matchesTab;
  });

  const totalCount = users.length;
  const activeCount = users.filter((u) => u.is_active).length;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <LinearGradient
        colors={isDark ? ['#0F1521', '#121824', '#090d16'] : ['#F5F0E8', '#EAE0D5', '#DFD3C3']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Modern Header */}
      <SafeBlurView
        intensity={80}
        tint="dark"
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitleMain, { color: '#FFFFFF' }]}>Team</Text>
            <Text style={[styles.headerSubtitleMain, { color: '#94A3B8' }]}>
              {totalCount} members · {activeCount} active
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.headerAddBtn, { backgroundColor: colors.primary }]}
            onPress={handleAddMember}
            activeOpacity={0.8}
          >
            <UserPlus size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </SafeBlurView>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <SafeBlurView
          intensity={60}
          tint="dark"
          style={[
            styles.searchBar,
            { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(15,23,42,0.65)', overflow: 'hidden' },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.04)', 'rgba(0,0,0,0.05)']}
            style={StyleSheet.absoluteFillObject}
          />
          <TouchableOpacity
            onPress={() => Keyboard.dismiss()}
            activeOpacity={0.7}
            style={styles.searchIconBtn}
          >
            <Search size={16} color="#94A3B8" />
          </TouchableOpacity>
          <TextInput
            style={[styles.searchInput, { color: '#FFFFFF' }]}
            placeholder="Search members..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </SafeBlurView>
      </View>

      {/* Segmented Control */}
      <View style={styles.segmentWrapper}>
        <SegmentedControl
          selected={selectedTab}
          onSelect={setSelectedTab}
          colors={colors}
          tabs={availableRoles}
        />
      </View>

      {/* User List */}
      {isLoading ? (
        <LoadingState colors={colors} />
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <UserCard
              user={item}
              onPress={() => handleUserPress(item)}
              colors={colors}
            />
          )}
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<EmptyState colors={colors} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#7CB9A8"
              colors={['#7CB9A8']}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* User Detail Bottom Sheet */}
      {selectedUser && (
        <UserDetailSheet
          user={selectedUser}
          propertyId={propertyId || ''}
          bottomSheetRef={userDetailSheetRef}
          colors={colors}
          onUpdate={fetchUsers}
        />
      )}

      {/* Invite Member Bottom Sheet */}
      {propertyId && (
        <InviteMemberSheet
          bottomSheetRef={inviteSheetRef}
          propertyId={propertyId}
          organizationId={organizationId || ''}
          colors={colors}
          onSuccess={fetchUsers}
        />
      )}

      {/* Mobile Footer */}



    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  headerTitleWrap: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitleMain: {
    fontSize: 20,
        letterSpacing: -0.5,
    textAlign: 'center',
  },
  headerSubtitleMain: {
    fontSize: 12,
        marginTop: 1,
    textAlign: 'center',
  },
  headerAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
        paddingVertical: 0,
  },
  segmentWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  segmentScroll: {
    flexGrow: 0,
  },
  segmentScrollContent: {
    paddingRight: 16,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    overflow: 'hidden',
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  segmentItemScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
    justifyContent: 'center',
    minWidth: 80,
  },
  segmentText: {
    fontSize: 13,
      },
  searchIconBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTextSelected: {
      },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 160,
  },
  separator: {
    height: 10,
  },
  userCardWrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontSize: 16,
      },
  userCardInfo: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  userCardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  userCardName: {
    fontSize: 15,
        flexShrink: 1,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 9,
        textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userCardEmail: {
    fontSize: 13,
        marginBottom: 4,
  },
  userCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    fontSize: 11,
      },
  metaDivider: {
    fontSize: 11,
  },
  chevron: {
    marginLeft: 8,
    flexShrink: 0,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  emptyTitle: {
    fontSize: 18,
        textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
        textAlign: 'center',
    lineHeight: 20,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  loadingText: {
    fontSize: 14,
        marginTop: 16,
  },
  // Bottom Sheet styles — Glassmorphic Dark
  sheetContent: { paddingHorizontal: 20, paddingBottom: 40 },
  sheetHeaderGrad: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 8 },
  sheetHeader: { alignItems: 'center', paddingTop: 24, paddingBottom: 16 },
  sheetAvatarGlow: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 1.5, borderColor: 'rgba(112,143,150,0.5)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    shadowColor: '#708F96', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
  },
  sheetAvatar: {
    width: 82, height: 82, borderRadius: 41,
    backgroundColor: 'rgba(112,143,150,0.2)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  sheetAvatarImage: { width: '100%', height: '100%' },
  sheetAvatarText: { fontSize: 30,  color: '#FFFFFF' },
  sheetName: { fontSize: 22,  color: '#FFFFFF', marginBottom: 8, letterSpacing: -0.3 },
  sheetRoleBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginBottom: 8 },
  sheetRoleBadgeText: { fontSize: 10,  textTransform: 'uppercase', letterSpacing: 1 },
  sheetStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  sheetStatusDot: { width: 7, height: 7, borderRadius: 4 },
  sheetStatusText: { fontSize: 12, },
  sheetSection: {
    borderRadius: 18, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden', marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  detailIcon: { width: 28, alignItems: 'center' },
  detailContent: { flex: 1, marginLeft: 10 },
  detailLabel: { fontSize: 9,  textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.4)', marginBottom: 2 },
  detailValue: { fontSize: 14,  color: '#FFFFFF' },
  sheetActions: { gap: 10 },
  actionButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  actionButtonDanger: { borderWidth: 1 },
  actionIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  actionText: { fontSize: 15,  color: '#FFFFFF' },
  rolePickerContainer: {
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 10, marginBottom: 4,
  },
  roleOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
  },
  roleOptionText: { fontSize: 14,  color: '#FFFFFF' },
  roleOptionDot: { width: 8, height: 8, borderRadius: 4 },
  confirmDeleteContainer: {
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    padding: 18,
  },
  confirmDeleteText: { fontSize: 14,  color: '#FCA5A5', textAlign: 'center', marginBottom: 14 },
  confirmDeleteButtons: { flexDirection: 'row', gap: 10, justifyContent: 'center' },


  // Invite Sheet styles — Rebuilt glassmorphism
  inviteHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    overflow: 'hidden',
    borderRadius: 20,
  },
  inviteHeaderGrad: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 20,
    borderRadius: 20,
  },
  inviteIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(112,143,150,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(112,143,150,0.3)',
  },
  inviteTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  inviteSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  modeToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modeToggleActive: {
    backgroundColor: '#708F96',
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  modeToggleTextActive: {
    color: '#FFFFFF',
  },
  inviteForm: {
    gap: 14,
    marginBottom: 20,
  },
  glassInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    height: 52,
    overflow: 'hidden',
  },
  glassInputIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassInput: {
    flex: 1,
    height: 52,
    fontSize: 15,
    color: '#FFFFFF',
    marginLeft: 8,
  },
  inputGroup: {},
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  alertText: {
    fontSize: 13,
    color: '#FCA5A5',
    flex: 1,
  },
  roleSelectorContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  roleChipActive: {
    backgroundColor: '#708F96',
    borderColor: '#708F96',
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  roleChipTextActive: {
    color: '#FFFFFF',
  },
  inviteActions: {
    gap: 10,
    marginTop: 8,
  },
  submitBtn: {
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelBtn: {
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  skillListContainer: {
    gap: 8,
    marginTop: 4,
  },
  skillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  skillItemActive: {
    backgroundColor: 'rgba(112,143,150,0.12)',
    borderColor: 'rgba(112,143,150,0.35)',
  },
  skillItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  skillItemTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  skillCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skillCheckboxActive: {
    backgroundColor: '#708F96',
    borderColor: '#708F96',
  },
});
