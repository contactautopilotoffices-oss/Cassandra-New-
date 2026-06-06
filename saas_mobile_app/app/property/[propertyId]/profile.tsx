import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Image,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context';
import { useAuth } from '@/hooks/useAuth';
import { useServerQuery } from '@/hooks/useServerQuery';
import { queryKeys } from '@/utils/queryKeys';
import { Colors } from '@/constants/Colors';
import { apiFetch } from '@/utils/api/mobileApi';
import { createClient } from '@/utils/supabase/client';
import { readFileAsArrayBuffer, compressImage } from '@/utils/mediaUtils';

import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  ArrowLeft,
  Camera,
  Save,
  X,
  Mail,
  Phone,
  Shield,
  Building2,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

// ─── Types ───────────────────────────────────────────────────────────────────
interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  user_photo_url?: string | null;
  role?: string;
  designation?: string;
}

export default function ProfileScreen() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { user, membership } = useAuth();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  const [isSaving, setIsSaving] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  // Edit form state — only full_name and phone are editable
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // ─── Fetch profile ─────────────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    if (!user) return null;
    try {
      // Use Supabase directly for mobile - more reliable than web API
      const supabase = createClient();
      const { data: profileData, error } = await supabase
        .from('users')
        .select('id, full_name, email, phone, user_photo_url, role, designation')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile from Supabase:', error);
        return null;
      }
      return profileData as UserProfile | null;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  }, [user]);

  const { data: profile, isLoading, isFetching, refetch } = useServerQuery<UserProfile | null>(
    queryKeys.user.profile(user?.id ?? 'none'),
    fetchProfile,
    { staleTime: 1000 * 60 * 5 }
  );

  // Update form when profile loads
  useEffect(() => {
    if (profile) {
      setEditName(profile.full_name || '');
      setEditPhone(profile.phone || '');
    }
  }, [profile]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // ─── Save profile ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!profile) return;
    if (!editName.trim()) {
      Alert.alert('Error', 'Full name is required');
      return;
    }
    setIsSaving(true);
    try {
      const response = await apiFetch(`/api/users/${profile.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: editName.trim(),
          phone: editPhone.trim() || null,
        }),
      });
      if (!response.success) throw new Error(response.error);

      Alert.alert('Success', 'Profile updated successfully');
      refetch();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Photo upload ──────────────────────────────────────────────────────────
  const handlePhotoCapture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to capture photos');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
    setShowPhotoModal(false);
  };

  const handlePhotoPick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
    setShowPhotoModal(false);
  };

  const uploadPhoto = async (uri: string) => {
    try {
      if (!user?.id || !profile) {
        Alert.alert('Error', 'Not authenticated');
        return;
      }

      const compressedUri = await compressImage(uri);
      const formData = new FormData();
      formData.append('file', {
        uri: compressedUri,
        name: 'photo.jpg',
        type: 'image/jpeg',
      } as any);

      // Upload via server API
      const response = await apiFetch(`/api/users/${profile.id}/photo`, {
        method: 'POST',
        body: formData as any,
      });

      if (!response.success) throw new Error(response.error);

      refetch();
    } catch (error) {
      console.error('Error uploading photo:', error);
      Alert.alert('Error', 'Failed to upload photo');
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const getRoleDisplay = () => {
    if (!membership || !propertyId) return 'Member';
    const prop = membership.properties.find((p) => p.id === propertyId);
    if (!prop) return 'Member';
    return prop.role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getPropertyName = () => {
    if (!membership || !propertyId) return 'Unknown Property';
    const prop = membership.properties.find((p) => p.id === propertyId);
    return prop?.name || 'Unknown Property';
  };

  const getInitials = () => {
    return profile?.full_name?.[0]?.toUpperCase() ||
           profile?.email?.[0]?.toUpperCase() ||
           user?.email?.[0]?.toUpperCase() ||
           'U';
  };

  // ─── Glass Card Component ──────────────────────────────────────────────────
  const GlassCard = ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <SafeBlurView intensity={isDark ? 50 : 60} tint={isDark ? 'dark' : 'light'} style={[s.glassCard, style]}>
      <LinearGradient
        colors={isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)', 'rgba(0,0,0,0.15)'] : ['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.3)']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={{ zIndex: 2 }}>{children}</View>
    </SafeBlurView>
  );

  // ─── Info Row (read-only) ──────────────────────────────────────────────────
  const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <View style={s.infoRow}>
      <View style={s.infoIconWrap}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[s.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[s.infoValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={isDark ? ['#0B1120', '#0f172a', '#1e1b4b'] : ['#eef2f6', '#f8fafc']} style={StyleSheet.absoluteFillObject} />
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color="#708F96" />
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={isDark ? ['#0B1120', '#0f172a', '#1e1b4b'] : ['#eef2f6', '#f8fafc']} style={StyleSheet.absoluteFillObject} />
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* ── Header ── */}
      <View style={s.headerWrap}>
        <LinearGradient colors={['#708F96', '#4A6670', '#2D3F47']} style={StyleSheet.absoluteFillObject} />
        <View style={s.headerTop}>
          <TouchableOpacity style={s.backOrb} onPress={() => router.back()} activeOpacity={0.7}>
            <ArrowLeft size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} tintColor="#708F96" />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* ── Avatar Section ── */}
        <View style={s.avatarSection}>
          <View style={s.avatarWrap}>
            {profile?.user_photo_url ? (
              <Image source={{ uri: profile.user_photo_url }} style={s.avatarImg} />
            ) : (
              <View style={s.avatarPlaceholder}>
                <Text style={s.avatarPlaceholderText}>{getInitials()}</Text>
              </View>
            )}
            <TouchableOpacity style={s.cameraBtn} onPress={() => setShowPhotoModal(true)} activeOpacity={0.8}>
              <Camera size={16} color="#fff" />
            </TouchableOpacity>
          </View>

          <Text style={[s.nameText, { color: colors.text }]}>{profile?.full_name || 'User'}</Text>
          <Text style={[s.emailText, { color: colors.textSecondary }]}>{profile?.email || user?.email}</Text>
          <View style={s.roleBadge}>
            <Text style={s.roleBadgeText}>{getRoleDisplay()}</Text>
          </View>
        </View>

        {/* ── Editable Info ── */}
        <GlassCard>
          <Text style={[s.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>EDITABLE INFORMATION</Text>

          {/* Full Name */}
          <View style={s.fieldGroup}>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>FULL NAME</Text>
            <TextInput
              style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', color: colors.text }]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Enter your full name"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          {/* Phone */}
          <View style={[s.fieldGroup, { marginTop: 14 }]}>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>PHONE NUMBER</Text>
            <TextInput
              style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', color: colors.text }]}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="Enter phone number"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity style={s.saveBtn} onPress={handleSave} activeOpacity={0.8} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Save size={18} color="#fff" />
                <Text style={s.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </GlassCard>

        {/* ── Read-Only Info ── */}
        <GlassCard>
          <Text style={[s.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>ACCOUNT DETAILS</Text>

          <InfoRow icon={<Mail size={18} color="#708F96" />} label="Email Address" value={profile?.email || user?.email || 'Not set'} />
          <InfoRow icon={<Shield size={18} color="#708F96" />} label="Role" value={getRoleDisplay()} />
          <InfoRow icon={<Building2 size={18} color="#708F96" />} label="Property" value={getPropertyName()} />
        </GlassCard>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Photo Modal ── */}
      <Modal visible={showPhotoModal} transparent animationType="fade" onRequestClose={() => setShowPhotoModal(false)}>
        <View style={s.modalOverlay}>
          <SafeBlurView intensity={60} tint="dark" style={s.modalContent}>
            <LinearGradient colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)', 'rgba(0,0,0,0.2)']} style={StyleSheet.absoluteFillObject} />
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.text }]}>Update Photo</Text>
              <TouchableOpacity onPress={() => setShowPhotoModal(false)}>
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.modalOption} onPress={handlePhotoCapture} activeOpacity={0.7}>
              <Camera size={22} color="#708F96" />
              <Text style={[s.modalOptionText, { color: colors.text }]}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.modalOption} onPress={handlePhotoPick} activeOpacity={0.7}>
              <Phone size={22} color="#708F96" />
              <Text style={[s.modalOptionText, { color: colors.text }]}>Choose from Library</Text>
            </TouchableOpacity>
          </SafeBlurView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  headerWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backOrb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
        color: '#fff',
    letterSpacing: 0.3,
  },

  // Scroll
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },

  // Glass Card
  glassCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionLabel: {
    fontSize: 10,
        letterSpacing: 1.2,
    marginBottom: 16,
    textTransform: 'uppercase',
  },

  // Avatar section
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: 'rgba(112,143,150,0.4)',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(112,143,150,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(112,143,150,0.4)',
  },
  avatarPlaceholderText: {
    fontSize: 36,
        color: '#708F96',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#708F96',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0f172a',
  },
  nameText: {
    fontSize: 20,
        textAlign: 'center',
  },
  emailText: {
    fontSize: 13,
        textAlign: 'center',
    marginTop: 2,
  },
  roleBadge: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(112,143,150,0.15)',
  },
  roleBadgeText: {
    fontSize: 11,
        color: '#708F96',
    textTransform: 'capitalize',
  },

  // Fields
  fieldGroup: {},
  fieldLabel: {
    fontSize: 10,
        letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
      },

  // Save button
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#708F96',
  },
  saveBtnText: {
    fontSize: 14,
        color: '#fff',
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  infoIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(112,143,150,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoLabel: {
    fontSize: 11,
        letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
      },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '80%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
      },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  modalOptionText: {
    fontSize: 15,
      },
});
