import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Modal,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors, DesignTokens } from '@/constants/Colors';
import { toast } from '@/lib/toast';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { vmsService, DateFilter, VisitorLog } from '@/services/vmsService';

import { formatDateTime } from '@/lib/utils';
import {
  Users,
  LogIn,
  LogOut,
  Search,
  User,
  Truck,
  Building2,
  X,
  Camera,
  ChevronRight,
  Clock,
  MapPin,
  Phone,
  Mail,
  UserCheck,
  Monitor,
  ClipboardList,
  Calendar,
  ChevronDown,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------


interface StaffMember {
  id: string;
  name: string;
  full_name?: string;
  email: string;
  designation?: string;
}

type TabKey = 'all' | 'checkin' | 'kiosk';
type StatusFilter = 'all' | 'checked_in' | 'checked_out';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  checked_in: 'On Premise',
  checked_out: 'Checked Out',
};

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This Week',
  month: 'This Month',
  custom: 'Custom',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  visitor: <User size={12} color={Colors.light.primary} />,
  vendor: <Truck size={12} color={Colors.light.warning} />,
  delivery: <Building2 size={12} color={Colors.light.textSecondary} />,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  visitor: { bg: Colors.light.primaryLight, text: Colors.light.primary },
  vendor: { bg: Colors.light.secondaryLight, text: Colors.light.secondary },
  delivery: { bg: Colors.light.surface, text: Colors.light.textSecondary },
};

function getDuration(checkin: string, checkout: string | null): string {
  const start = new Date(checkin);
  const end = checkout ? new Date(checkout) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function getTodayRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ---------------------------------------------------------------------------
// Date Filter Dropdown
// ---------------------------------------------------------------------------

function DateFilterDropdown({
  value,
  onChange,
  colors,
}: {
  value: DateFilter;
  onChange: (v: DateFilter) => void;
  colors: typeof Colors.light;
}) {
  const [open, setOpen] = useState(false);
  const options: DateFilter[] = ['today', 'yesterday', 'week', 'month'];

  return (
    <View style={{ position: 'relative', zIndex: 10 }}>
      <TouchableOpacity
        style={[
          styles.dateFilterBtn,
          {
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderColor: 'rgba(255,255,255,0.15)',
          },
        ]}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Calendar size={14} color={colors.textSecondary} />
        <Text style={[styles.dateFilterText, { color: '#fff' }]}>
          {DATE_FILTER_LABELS[value]}
        </Text>
        <ChevronDown size={14} color={colors.textSecondary} />
      </TouchableOpacity>

      {open && (
        <>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOpen(false)} />
          <SafeBlurView
            intensity={60}
            tint="dark"
            style={[
              styles.dateFilterMenu,
              { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(30,30,35,0.95)', overflow: 'hidden' },
            ]}
          >
            <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.1)']} style={StyleSheet.absoluteFillObject} />
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.dateFilterOption,
                  value === opt && { backgroundColor: colors.primary + '22' },
                ]}
                onPress={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.dateFilterOptionText,
                    { color: value === opt ? colors.primary : colors.text },
                  ]}
                >
                  {DATE_FILTER_LABELS[opt]}
                </Text>
                {value === opt && (
                  <Ionicons name="checkmark" size={16} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </SafeBlurView>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Status Filter Dropdown
// ---------------------------------------------------------------------------

function StatusFilterDropdown({
  value,
  onChange,
  colors,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  colors: typeof Colors.light;
}) {
  const [open, setOpen] = useState(false);
  const options: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'checked_in', label: 'In-Premise' },
    { key: 'checked_out', label: 'Checked Out' },
  ];

  const currentLabel = options.find((o) => o.key === value)?.label || 'All';

  return (
    <View style={{ position: 'relative', zIndex: 10 }}>
      <TouchableOpacity
        style={[
          styles.statusFilterBtn,
          {
            backgroundColor: value !== 'all' ? colors.primary : 'rgba(255,255,255,0.08)',
            borderColor: value !== 'all' ? colors.primary : 'rgba(255,255,255,0.15)',
          },
        ]}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text style={[styles.statusFilterText, { color: '#fff' }]}>{currentLabel}</Text>
        <ChevronDown size={14} color="#fff" />
      </TouchableOpacity>

      {open && (
        <>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOpen(false)} />
          <SafeBlurView
            intensity={60}
            tint="dark"
            style={[
              styles.statusFilterMenu,
              { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(30,30,35,0.95)', overflow: 'hidden' },
            ]}
          >
            <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.1)']} style={StyleSheet.absoluteFillObject} />
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.statusFilterOption,
                  value === opt.key && { backgroundColor: colors.primary + '22' },
                ]}
                onPress={() => {
                  onChange(opt.key);
                  setOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.statusFilterOptionText,
                    { color: value === opt.key ? colors.primary : colors.text },
                  ]}
                >
                  {opt.label}
                </Text>
                {value === opt.key && (
                  <Ionicons name="checkmark" size={16} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </SafeBlurView>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stats Card Component
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  color,
  bgColor,
  onPress,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  return (
    <TouchableOpacity
      style={[styles.statCard]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <SafeBlurView
        intensity={40}
        tint="dark"
        style={[StyleSheet.absoluteFillObject, { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' }]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.1)']}
          style={StyleSheet.absoluteFillObject}
        />
      </SafeBlurView>
      <View style={[styles.statIcon, { backgroundColor: bgColor }]}>{icon}</View>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Visitor Card Component
// ---------------------------------------------------------------------------

function VisitorCard({
  visitor,
  onPress,
}: {
  visitor: VisitorLog;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const catColor = CATEGORY_COLORS[visitor.category] ?? CATEGORY_COLORS.delivery;

  return (
    <TouchableOpacity
      style={[styles.visitorCard]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <SafeBlurView
        intensity={40}
        tint="dark"
        style={[StyleSheet.absoluteFillObject, { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' }]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.1)']}
          style={StyleSheet.absoluteFillObject}
        />
      </SafeBlurView>

      <View style={styles.visitorCardRow}>
        {/* Photo */}
        <SafeBlurView intensity={30} tint="dark" style={[styles.visitorAvatar, { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' }]}>
          <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.05)']} style={StyleSheet.absoluteFillObject} />
          {visitor.photo_url ? (
            <Image source={{ uri: visitor.photo_url }} style={styles.visitorAvatarImg} />
          ) : (
            <User size={22} color={colors.textTertiary} />
          )}
        </SafeBlurView>

        {/* Info */}
        <View style={styles.visitorInfo}>
          <View style={styles.visitorNameRow}>
            <Text style={[styles.visitorName, { color: colors.text }]} numberOfLines={1}>
              {visitor.name}
            </Text>
            <View style={[styles.categoryBadge, { backgroundColor: catColor.bg }]}>
              <View style={{ marginRight: 4 }}>{CATEGORY_ICONS[visitor.category]}</View>
              <Text style={[styles.categoryText, { color: catColor.text }]}>
                {visitor.category || 'Visitor'}
              </Text>
            </View>
          </View>
          <Text style={[styles.visitorMeta, { color: colors.textSecondary }]}>
            {visitor.mobile || 'No mobile'} · {visitor.whom_to_meet}
          </Text>
          <Text style={[styles.visitorTime, { color: colors.textTertiary }]}>
            In: {new Date(visitor.checkin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {visitor.checkout_time
              ? ` · Out: ${new Date(visitor.checkout_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : ` · (${getDuration(visitor.checkin_time, null)})`}
          </Text>
        </View>

        {/* Status */}
        <View style={styles.visitorStatusCol}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  visitor.status === 'checked_in'
                    ? colors.success
                    : colors.textTertiary,
              },
            ]}
          />
          <Text
            style={[
              styles.statusLabel,
              {
                color:
                  visitor.status === 'checked_in'
                    ? colors.success
                    : colors.textTertiary,
              },
            ]}
          >
            {STATUS_LABELS[visitor.status] ?? visitor.status}
          </Text>
          <ChevronRight size={14} color={colors.textTertiary} style={{ marginTop: 4 }} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Visitor Detail Bottom Sheet Content
// ---------------------------------------------------------------------------

function VisitorDetailSheet({
  visitor,
  onClose,
  onCheckout,
  loading,
}: {
  visitor: VisitorLog;
  onClose: () => void;
  onCheckout: () => void;
  loading: boolean;
}) {
  const { theme } = useTheme();
  const colors = Colors[theme];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.detailHeader, { backgroundColor: colors.primary }]}>
        <TouchableOpacity style={styles.detailCloseBtn} onPress={onClose}>
          <X size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.detailAvatarRow}>
          <View style={[styles.detailAvatar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            {visitor.photo_url ? (
              <Image source={{ uri: visitor.photo_url }} style={styles.detailAvatarImg} />
            ) : (
              <User size={36} color="#fff" />
            )}
          </View>
          <View style={styles.detailNameCol}>
            <Text style={styles.detailName}>{visitor.name}</Text>
            <Text style={styles.detailVisitorId}>{visitor.visitor_id}</Text>
          </View>
        </View>
      </View>

      {/* Info Grid */}
      <View style={styles.detailInfoGrid}>
        <DetailRow label="Category" value={visitor.category} icon={<Building2 size={14} />} />
        <DetailRow label="Mobile" value={visitor.mobile || '-'} icon={<Phone size={14} />} />
        <DetailRow label="Coming From" value={visitor.coming_from || '-'} icon={<MapPin size={14} />} />
        <DetailRow label="Host" value={visitor.whom_to_meet} icon={<UserCheck size={14} />} />
        <DetailRow label="Purpose" value={visitor.purpose || '-'} icon={<ClipboardList size={14} />} />
        <DetailRow
          label="Check-in"
          value={formatDateTime(visitor.checkin_time)}
          icon={<LogIn size={14} />}
        />
        <DetailRow
          label="Check-out"
          value={visitor.checkout_time ? formatDateTime(visitor.checkout_time) : '-'}
          icon={<LogOut size={14} />}
        />
        <DetailRow
          label="Duration"
          value={
            visitor.checkout_time || visitor.status === 'checked_in'
              ? getDuration(visitor.checkin_time, visitor.checkout_time || null)
              : '-'
          }
          icon={<Clock size={14} />}
        />
      </View>

      {/* Action Button */}
      {visitor.status === 'checked_in' && (
        <TouchableOpacity
          style={[styles.checkoutBtn, { backgroundColor: colors.error }]}
          onPress={onCheckout}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <LogOut size={18} color="#fff" />
              <Text style={styles.checkoutBtnText}>Check Out Visitor</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function DetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailRowIcon}>{icon}</View>
      <View>
        <Text style={[styles.detailRowLabel, { color: colors.textTertiary }]}>{label}</Text>
        <Text style={[styles.detailRowValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Check-in Form Component
// ---------------------------------------------------------------------------

function CheckInForm({
  propertyId,
  onSuccess,
}: {
  propertyId: string;
  onSuccess: () => void;
}) {
  const { theme } = useTheme();
  const colors = Colors[theme];

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [hostName, setHostName] = useState('');
  const [hostUid, setHostUid] = useState<string | null>(null);
  const [hostSuggestions, setHostSuggestions] = useState<StaffMember[]>([]);
  const [purpose, setPurpose] = useState('meeting');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [takingPhoto, setTakingPhoto] = useState(false);

  const purposes = [
    { label: 'Meeting', value: 'meeting' },
    { label: 'Delivery', value: 'delivery' },
    { label: 'Vendor / Maintenance', value: 'vendor' },
    { label: 'Interview', value: 'interview' },
    { label: 'Personal', value: 'personal' },
    { label: 'Other', value: 'other' },
  ];

  // Fetch host suggestions via API
  useEffect(() => {
    const fetchHosts = async () => {
      if (hostName.length < 2) {
        setHostSuggestions([]);
        return;
      }
      const res = await vmsService.searchHosts(propertyId, hostName);
      if (res.success && res.data) {
        setHostSuggestions(
          res.data.map((h) => ({
            id: h.id,
            name: h.name,
            full_name: h.name,
            email: h.email || '',
            designation: h.role || '',
          }))
        );
      }
    };
    const debounce = setTimeout(fetchHosts, 300);
    return () => clearTimeout(debounce);
  }, [hostName, propertyId]);

  const handleTakePhoto = async () => {
    setTakingPhoto(true);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      toast.error('Camera permission required');
      setTakingPhoto(false);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    setTakingPhoto(false);
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Visitor name is required');
      return;
    }
    if (!hostName.trim()) {
      toast.error('Host name is required');
      return;
    }
    setLoading(true);
    try {
      const res = await vmsService.checkIn({
        propertyId,
        name: name.trim(),
        mobile: mobile.trim() || undefined,
        category: purpose === 'delivery' || purpose === 'vendor' ? purpose : 'visitor',
        whom_to_meet: hostName.trim(),
        whom_to_meet_uid: hostUid || undefined,
        purpose: purpose,
      });

      if (res.success && res.data) {
        // Upload photo after check-in so we have the visitorId
        if (photoUri) {
          const uploadRes = await vmsService.uploadPhoto(photoUri, res.data.visitorId, propertyId);
          if (!uploadRes.success) {
            console.warn('Photo upload failed:', uploadRes.error);
          }
        }
        toast.success(`Welcome ${name.trim()}! Visit logged.`);
        setName('');
        setMobile('');
        setHostName('');
        setHostUid(null);
        setPurpose('meeting');
        setPhotoUri(null);
        onSuccess();
      } else {
        toast.error(String(res.error || 'Check-in failed'));
      }
    } catch (err: any) {
      toast.error(err.message || 'Check-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Visitor Name */}
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Visitor Name *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: colors.text }]}
          placeholder="Full name"
          placeholderTextColor={colors.textTertiary}
          value={name}
          onChangeText={setName}
        />

        {/* Mobile */}
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Phone (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: colors.text }]}
          placeholder="Mobile number"
          placeholderTextColor={colors.textTertiary}
          value={mobile}
          onChangeText={setMobile}
          keyboardType="phone-pad"
        />

        {/* Host */}
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Host / Whom to Meet *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: colors.text }]}
          placeholder="Host name"
          placeholderTextColor={colors.textTertiary}
          value={hostName}
          onChangeText={(val) => {
            setHostName(val);
            setHostUid(null);
          }}
        />
        {hostSuggestions.length > 0 && (
          <SafeBlurView intensity={45} tint="dark" style={[styles.suggestionsList, { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }]}>
            <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)', 'rgba(0,0,0,0.15)']} style={StyleSheet.absoluteFillObject} />
            {hostSuggestions.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.suggestionItem}
                onPress={() => {
                  setHostName(s.full_name || s.name || '');
                  setHostUid(s.id);
                  setHostSuggestions([]);
                }}
              >
                <User size={14} color={colors.textSecondary} />
                <Text style={[styles.suggestionText, { color: colors.text }]}>
                  {s.full_name || s.name}
                </Text>
                {s.designation && (
                  <Text style={[styles.suggestionSub, { color: colors.textTertiary }]}>
                    {s.designation}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </SafeBlurView>
        )}

        {/* Purpose */}
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Purpose</Text>
        <View style={styles.purposeGrid}>
          {purposes.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[
                styles.purposeChip,
                {
                  backgroundColor: purpose === p.value ? colors.primary : 'rgba(255,255,255,0.06)',
                  borderColor: purpose === p.value ? colors.primary : colors.glassBorder,
                },
              ]}
              onPress={() => setPurpose(p.value)}
            >
              <Text
                style={[
                  styles.purposeChipText,
                  { color: purpose === p.value ? '#fff' : colors.textSecondary },
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Photo */}
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Visitor Photo</Text>
        <TouchableOpacity
          style={[styles.photoBtn, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)' }]}
          onPress={handleTakePhoto}
          disabled={takingPhoto}
        >
          {takingPhoto ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          ) : (
            <>
              <Camera size={28} color={colors.primary} />
              <Text style={[styles.photoBtnText, { color: colors.textSecondary }]}>
                Take Photo
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary }, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <LogIn size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Check In Visitor</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Kiosk Mode Component
// ---------------------------------------------------------------------------

function KioskMode({ propertyId, onExit }: { propertyId: string; onExit: () => void }) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [hostName, setHostName] = useState('');
  const [hostUid, setHostUid] = useState<string | null>(null);
  const [hostSuggestions, setHostSuggestions] = useState<StaffMember[]>([]);
  const [purpose, setPurpose] = useState('meeting');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [confirmedName, setConfirmedName] = useState('');

  useEffect(() => {
    const fetchHosts = async () => {
      if (hostName.length < 2) { setHostSuggestions([]); return; }
      const res = await vmsService.searchHosts(propertyId, hostName);
      if (res.success && res.data) {
        setHostSuggestions(
          res.data.map((h) => ({
            id: h.id,
            name: h.name,
            full_name: h.name,
            email: h.email || '',
            designation: h.role || '',
          }))
        );
      }
    };
    const debounce = setTimeout(fetchHosts, 300);
    return () => clearTimeout(debounce);
  }, [hostName, propertyId]);

  const handleCheckIn = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Please enter your name'); return; }
    if (!hostName.trim()) { Alert.alert('Required', 'Please enter the host name'); return; }
    setLoading(true);
    try {
      const res = await vmsService.checkIn({
        propertyId,
        name: name.trim(),
        mobile: mobile.trim() || undefined,
        category: purpose === 'delivery' || purpose === 'vendor' ? purpose : 'visitor',
        whom_to_meet: hostName.trim(),
        whom_to_meet_uid: hostUid || undefined,
        purpose,
      });

      if (res.success && res.data) {
        setConfirmedName(name.trim());
        setStep('success');
      } else {
        Alert.alert('Error', String(res.error || 'Check-in failed'));
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Check-in failed');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName(''); setMobile(''); setHostName(''); setHostUid(null); setPurpose('meeting');
    setHostSuggestions([]); setStep('form');
  };

  if (step === 'success') {
    return (
      <View style={[styles.kioskSuccess, { backgroundColor: colors.primary }]}>
        <View style={styles.kioskSuccessContent}>
          <View style={styles.kioskCheckCircle}>
            <LogIn size={48} color="#fff" />
          </View>
          <Text style={styles.kioskWelcomeText}>Welcome!</Text>
          <Text style={styles.kioskSuccessName}>{confirmedName}</Text>
          <Text style={styles.kioskSuccessSub}>
            Your host has been notified.{'\n'}Please wait in the reception area.
          </Text>
          <TouchableOpacity
            style={styles.kioskNewVisitorBtn}
            onPress={resetForm}
            activeOpacity={0.8}
          >
            <Text style={styles.kioskNewVisitorText}>New Visitor</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.kioskExitBtn} onPress={onExit}>
            <Text style={styles.kioskExitText}>Exit Kiosk</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <View style={[styles.kioskContainer]}>
        <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={StyleSheet.absoluteFillObject} />
        {/* Header */}
        <View style={[styles.kioskHeader, { backgroundColor: colors.primary }]}>
          <Text style={styles.kioskTitle}>Visitor Check-In</Text>
          <TouchableOpacity style={styles.kioskCloseBtn} onPress={onExit}>
            <X size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.kioskFormContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.kioskFieldLabel, { color: colors.textSecondary }]}>Your Name *</Text>
          <TextInput
            style={[styles.kioskInput, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: colors.text }]}
            placeholder="Enter your full name"
            placeholderTextColor={colors.textTertiary}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={[styles.kioskFieldLabel, { color: colors.textSecondary }]}>Phone (optional)</Text>
          <TextInput
            style={[styles.kioskInput, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: colors.text }]}
            placeholder="Mobile number"
            placeholderTextColor={colors.textTertiary}
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
          />

          <Text style={[styles.kioskFieldLabel, { color: colors.textSecondary }]}>Whom to Meet *</Text>
          <TextInput
            style={[styles.kioskInput, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: colors.text }]}
            placeholder="Host name"
            placeholderTextColor={colors.textTertiary}
            value={hostName}
            onChangeText={(val) => {
              setHostName(val);
              setHostUid(null);
            }}
          />
          {hostSuggestions.length > 0 && (
            <SafeBlurView intensity={45} tint="dark" style={[styles.suggestionsList, { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }]}>
              <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)', 'rgba(0,0,0,0.15)']} style={StyleSheet.absoluteFillObject} />
              {hostSuggestions.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.suggestionItem}
                  onPress={() => { setHostName(s.full_name || s.name || ''); setHostUid(s.id); setHostSuggestions([]); }}
                >
                  <User size={14} color={colors.textSecondary} />
                  <Text style={[styles.suggestionText, { color: colors.text }]}>{s.full_name || s.name}</Text>
                </TouchableOpacity>
              ))}
            </SafeBlurView>
          )}

          <Text style={[styles.kioskFieldLabel, { color: colors.textSecondary }]}>Purpose of Visit</Text>
          <View style={styles.purposeGrid}>
            {[
              { label: 'Meeting', value: 'meeting' },
              { label: 'Delivery', value: 'delivery' },
              { label: 'Vendor', value: 'vendor' },
              { label: 'Interview', value: 'interview' },
            ].map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[
                  styles.purposeChip,
                  { backgroundColor: purpose === p.value ? colors.primary : 'rgba(255,255,255,0.06)',
                    borderColor: purpose === p.value ? colors.primary : colors.glassBorder },
                ]}
                onPress={() => setPurpose(p.value)}
              >
                <Text style={[styles.purposeChipText, { color: purpose === p.value ? '#fff' : colors.textSecondary }]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.kioskSubmitBtn, { backgroundColor: colors.primary }, loading && styles.submitBtnDisabled]}
            onPress={handleCheckIn}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <LogIn size={22} color="#fff" />
                <Text style={styles.kioskSubmitText}>Check In</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function VisitorsScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [visitors, setVisitors] = useState<VisitorLog[]>([]);
  const [stats, setStats] = useState({ total: 0, checked_in: 0, checked_out: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedVisitor, setSelectedVisitor] = useState<VisitorLog | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<boolean>(false);
  const [isVisitorDetailVisible, setIsVisitorDetailVisible] = useState(false);

  // Kiosk mode
  const [kioskMode, setKioskMode] = useState(false);

  // Fetch visitors via API layer
  const fetchVisitors = useCallback(async () => {
    if (!propertyId) return;
    setIsLoading(true);
    try {
      const res = await vmsService.fetchVisitors(propertyId, {
        dateFilter,
        status: statusFilter,
        search: searchQuery,
      });

      if (res.success && res.data) {
        setVisitors(res.data.visitors);
        setStats({
          total: res.data.stats.total_today,
          checked_in: res.data.stats.checked_in,
          checked_out: res.data.stats.checked_out,
        });
      }
    } catch (err) {
      console.error('Error fetching visitors:', err);
    } finally {
      setIsLoading(false);
    }
  }, [propertyId, statusFilter, searchQuery, dateFilter]);

  const { refetch } = useDashboardFetch(queryKeys.property.visitors(propertyId), fetchVisitors, {
    staleTime: 1000 * 60 * 5,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handleCheckout = async () => {
    if (!selectedVisitor) return;
    setCheckoutLoading(true);
    try {
      const res = await vmsService.checkOut(selectedVisitor.visitor_id, propertyId);
      if (res.success) {
        toast.success(`${selectedVisitor.name} checked out`);
        setIsVisitorDetailVisible(false);
        setSelectedVisitor(null);
        fetchVisitors();
      } else {
        toast.error(String(res.error || 'Checkout failed'));
      }
    } catch (err: any) {
      toast.error(err.message || 'Checkout failed');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleVisitorPress = (visitor: VisitorLog) => {
    setSelectedVisitor(visitor);
    setIsVisitorDetailVisible(true);
  };

  // Kiosk mode renders full screen
  if (kioskMode) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.primary, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <KioskMode propertyId={propertyId!} onExit={() => setKioskMode(false)} />
      </View>
    );
  }

  const renderVisitorItem = ({ item }: { item: VisitorLog }) => (
    <VisitorCard visitor={item} onPress={() => handleVisitorPress(item)} />
  );

  const filteredAll = visitors;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) + 90 }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient 
        colors={isDark ? ['#0F1521', '#121824', '#090d16'] : ['#F5F0E8', '#EAE0D5', '#DFD3C3']} 
        style={StyleSheet.absoluteFillObject} 
      />
      
      {/* Top Navigation — Scanner REMOVED */}
      <SafeBlurView
        intensity={80}
        tint="dark"
        style={[styles.topNav, {
          backgroundColor: 'transparent',
          borderBottomColor: 'rgba(255,255,255,0.12)',
          paddingTop: insets.top + 10,
          paddingBottom: 16
        }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 18, fontFamily: 'Poppins-Bold', color: '#FFFFFF' }} numberOfLines={1} adjustsFontSizeToFit>
              Visitors
            </Text>
            <Text style={{ fontSize: 11, fontFamily: 'Urbanist-Medium', color: '#94A3B8' }}>
              Visitor Management System
            </Text>
          </View>
          {/* Scanner button removed */}
          <View style={{ width: 40 }} />
        </View>
      </SafeBlurView>


      {/* Hero Header */}
      <SafeBlurView intensity={40} tint="dark" style={[styles.heroHeader, { borderColor: 'rgba(255,255,255,0.15)', borderBottomWidth: 1, overflow: 'hidden' }]}>
        <LinearGradient colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.08)']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.heroContent}>
          <View>
            <Text style={[styles.heroTitle, { color: colors.text }]}>Visitors</Text>
            <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
              {stats.checked_in} currently on premise
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.kioskBtnHero, { backgroundColor: colors.primary }]}
            onPress={() => setKioskMode(true)}
            activeOpacity={0.8}
          >
            <Monitor size={18} color="#fff" />
            <Text style={[styles.kioskBtnTextHero, { color: '#fff' }]}>Kiosk Mode</Text>
          </TouchableOpacity>
        </View>
      </SafeBlurView>


      {/* Stats Row — Pending replaced with Checked Out */}
      <View style={styles.statsRow}>
        <StatCard
          label="Today's Visitors"
          value={stats.total}
          icon={<Users size={20} color={colors.primary} />}
          color={colors.primary}
          bgColor={colors.primaryLight}
        />
        <StatCard
          label="Checked In"
          value={stats.checked_in}
          icon={<LogIn size={20} color={colors.success} />}
          color={colors.success}
          bgColor={colors.successBg}
          onPress={() => { setStatusFilter('checked_in'); setActiveTab('all'); }}
        />
        <StatCard
          label="Checked Out"
          value={stats.checked_out}
          icon={<LogOut size={20} color={colors.textSecondary} />}
          color={colors.textSecondary}
          bgColor={'rgba(255,255,255,0.08)'}
          onPress={() => { setStatusFilter('checked_out'); setActiveTab('all'); }}
        />
      </View>

      {/* Tabs */}
      <SafeBlurView intensity={45} tint="dark" style={[styles.tabBar, { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }]}>
        <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.08)']} style={StyleSheet.absoluteFillObject} />
        {([
          { key: 'all', label: 'All Visitors', icon: <ClipboardList size={14} /> },
          { key: 'checkin', label: 'Check In', icon: <LogIn size={14} /> },
        ] as const).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && { backgroundColor: colors.primary },
            ]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
          >
            <View style={{ marginRight: 4 }}>
              {React.cloneElement(tab.icon, { color: activeTab === tab.key ? '#fff' : colors.textSecondary })}
            </View>
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab.key ? '#fff' : colors.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </SafeBlurView>


      {/* Content */}
      {activeTab === 'all' ? (
        <>
          {/* Search + Filters Row */}
          <View style={styles.filterRow}>
            <SafeBlurView intensity={45} tint="dark" style={[styles.searchWrap, { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }]}>
              <LinearGradient colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.08)']} style={StyleSheet.absoluteFillObject} />
              <Search size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search by name, phone, host..."
                placeholderTextColor={colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </SafeBlurView>
            <StatusFilterDropdown value={statusFilter} onChange={setStatusFilter} colors={colors} />
          </View>

          {/* Date Filter */}
          <View style={{ paddingHorizontal: 12, marginBottom: 12 }}>
            <DateFilterDropdown value={dateFilter} onChange={setDateFilter} colors={colors} />
          </View>

          {/* Visitor List */}
          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : filteredAll.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primaryLight }]}>
                <Users size={32} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No visitors found</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                {searchQuery ? 'Try a different search term' : `No visitors for ${DATE_FILTER_LABELS[dateFilter].toLowerCase()}`}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredAll}
              renderItem={renderVisitorItem}
              keyExtractor={(item) => item.visitor_id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
              }
            />
          )}
        </>
      ) : (
        <CheckInForm propertyId={propertyId!} onSuccess={fetchVisitors} />
      )}

      {/* Visitor Detail Modal */}
      <Modal
        visible={isVisitorDetailVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsVisitorDetailVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setIsVisitorDetailVisible(false)}
        >
          <SafeBlurView intensity={50} tint="dark" style={[styles.detailModalContainer, { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }]}>
            <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)', 'rgba(0,0,0,0.15)']} style={StyleSheet.absoluteFillObject} />
            {selectedVisitor && (
              <VisitorDetailSheet
                visitor={selectedVisitor}
                onClose={() => setIsVisitorDetailVisible(false)}
                onCheckout={handleCheckout}
                loading={checkoutLoading}
              />
            )}
          </SafeBlurView>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  topNavTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
    flex: 1,
    textAlign: 'center',
  },
  bellButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroHeader: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 20,
  },
  heroContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTitle: {
    color: '#FFF',
    fontSize: 28,
    fontFamily: 'Poppins-Bold',
  },
  heroSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontFamily: 'Urbanist-Medium',
    marginTop: 2,
  },
  kioskBtnHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  kioskBtnTextHero: {
    fontSize: 13,
    fontFamily: 'Urbanist-Bold',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statLabel: { fontSize: 9, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase', letterSpacing: 0.8 },
  statValue: { fontSize: 22, fontFamily: 'Poppins-Bold', marginTop: 2 },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  tabText: { fontSize: 12, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Urbanist-Regular', padding: 0 },
  statusFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 100,
    justifyContent: 'center',
  },
  statusFilterText: { fontSize: 12, fontFamily: 'Urbanist-Bold' },
  statusFilterMenu: {
    position: 'absolute',
    top: 44,
    right: 0,
    width: 140,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 20,
  },
  statusFilterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusFilterOptionText: { fontSize: 13, fontFamily: 'Urbanist-Medium' },
  dateFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dateFilterText: { fontSize: 12, fontFamily: 'Urbanist-Bold' },
  dateFilterMenu: {
    position: 'absolute',
    top: 40,
    left: 0,
    width: 150,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 20,
  },
  dateFilterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateFilterOptionText: { fontSize: 13, fontFamily: 'Urbanist-Medium' },
  listContent: { paddingHorizontal: 12, paddingBottom: 100 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontFamily: 'Poppins-Bold', marginBottom: 6 },
  emptySub: { fontSize: 14, fontFamily: 'Urbanist-Regular', textAlign: 'center', paddingHorizontal: 40 },
  visitorCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  visitorCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  visitorAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  visitorAvatarImg: { width: 46, height: 46 },
  visitorInfo: { flex: 1 },
  visitorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  visitorName: { fontSize: 15, fontFamily: 'Poppins-Bold', flex: 1 },
  categoryBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  categoryText: { fontSize: 9, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase' },
  visitorMeta: { fontSize: 12, fontFamily: 'Urbanist-Regular', marginBottom: 2 },
  visitorTime: { fontSize: 11, fontFamily: 'Urbanist-Regular' },
  visitorStatusCol: { alignItems: 'center', gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 10, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase' },
  // Detail sheet
  detailHeader: { padding: 20, paddingTop: 12, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  detailCloseBtn: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  detailAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  detailAvatar: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  detailAvatarImg: { width: 64, height: 64 },
  detailNameCol: { flex: 1 },
  detailName: { fontSize: 22, fontFamily: 'Poppins-Bold', color: '#fff' },
  detailVisitorId: { fontSize: 12, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  detailInfoGrid: { padding: 16, gap: 14 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailRowIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.light.card, alignItems: 'center', justifyContent: 'center' },
  detailRowLabel: { fontSize: 10, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  detailRowValue: { fontSize: 14, fontFamily: 'Urbanist-Medium' },
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, paddingVertical: 14, borderRadius: 12, marginTop: 8 },
  checkoutBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Poppins-Bold' },
  // Check-in form
  fieldLabel: { fontSize: 12, fontFamily: 'Urbanist-Bold', marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Urbanist-Regular' },
  suggestionsList: { borderWidth: 1, borderRadius: 10, marginTop: 4, overflow: 'hidden' },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.06)' },
  suggestionText: { fontSize: 14, fontFamily: 'Urbanist-Medium' },
  suggestionSub: { fontSize: 11, fontFamily: 'Urbanist-Regular', marginLeft: 'auto' },
  purposeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  purposeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  purposeChipText: { fontSize: 13, fontFamily: 'Urbanist-Medium' },
  photoBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 24, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', gap: 8 },
  photoBtnText: { fontSize: 13, fontFamily: 'Urbanist-Regular', marginTop: 4 },
  photoPreview: { width: 80, height: 80, borderRadius: 8 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 12, marginTop: 24 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Poppins-Bold' },
  // Kiosk
  kioskContainer: { flex: 1 },
  kioskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  kioskTitle: { fontSize: 20, fontFamily: 'Poppins-Bold', color: '#fff' },
  kioskCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  kioskFormContent: { padding: 24 },
  kioskFieldLabel: { fontSize: 14, fontFamily: 'Urbanist-Bold', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  kioskInput: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16, fontSize: 18, fontFamily: 'Urbanist-Regular' },
  kioskSubmitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 20, borderRadius: 16, marginTop: 28 },
  kioskSubmitText: { color: '#fff', fontSize: 20, fontFamily: 'Poppins-Bold' },
  kioskSuccess: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  kioskSuccessContent: { alignItems: 'center', paddingHorizontal: 32 },
  kioskCheckCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  kioskWelcomeText: { fontSize: 28, fontFamily: 'Poppins-Bold', color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
  kioskSuccessName: { fontSize: 36, fontFamily: 'Poppins-Bold', color: '#fff', marginBottom: 16, textAlign: 'center' },
  kioskSuccessSub: { fontSize: 16, fontFamily: 'Urbanist-Regular', color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 24, marginBottom: 40 },
  kioskNewVisitorBtn: { paddingHorizontal: 40, paddingVertical: 16, borderRadius: 30, borderWidth: 2, borderColor: '#fff', marginBottom: 16 },
  kioskNewVisitorText: { color: '#fff', fontSize: 16, fontFamily: 'Poppins-Bold' },
  kioskExitBtn: { paddingHorizontal: 24, paddingVertical: 12 },
  kioskExitText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: 'Urbanist-Regular' },
  // Modal / Loggers Menu
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  detailModalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    height: '80%',
  },
  loggersMenu: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  loggersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  loggersTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
  },
  loggerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 16,
  },
  loggerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loggerInfo: {
    flex: 1,
  },
  loggerName: {
    fontSize: 15,
    fontFamily: 'Poppins-Bold',
  },
  loggerSub: {
    fontSize: 12,
    fontFamily: 'Urbanist-Medium',
  },
});
