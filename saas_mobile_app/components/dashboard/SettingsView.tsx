import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/utils/supabase/client';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { readFileAsArrayBuffer } from '@/utils/mediaUtils';
import * as ImagePicker from 'expo-image-picker';
import Toast from '../ui/Toast';

interface RoleInfo {
  role: string;
  entityName: string;
  type: 'organization' | 'property';
}

interface SettingsViewProps {
  onUpdate?: () => void;
}

export default function SettingsView({ onUpdate }: SettingsViewProps) {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [userRoles, setUserRoles] = useState<RoleInfo[]>([]);
  const [vendorInfo, setVendorInfo] = useState<{ id: string; shop_name: string } | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const { data: userData, error } = await (supabase as any)
        .from('users').select('*').eq('id', user?.id ?? '').single();
      if (error) throw error;

      // Org memberships
      const { data: orgMembers } = await (supabase as any)
        .from('organization_memberships')
        .select('role, organization:organizations(name)')
        .eq('user_id', user?.id ?? '').eq('is_active', true);

      // Property memberships
      const { data: propMembers } = await (supabase as any)
        .from('property_memberships')
        .select('role, property:properties(name)')
        .eq('user_id', user?.id ?? '').eq('is_active', true);

      setProfile(userData);
      if (userData.user_photo_url) setAvatarPreview(userData.user_photo_url);

      const roles: RoleInfo[] = [];
      orgMembers?.forEach((m: any) => roles.push({ role: m.role, entityName: m.organization?.name || 'Unknown Org', type: 'organization' }));
      propMembers?.forEach((m: any) => roles.push({ role: m.role, entityName: m.property?.name || 'Unknown Property', type: 'property' }));
      setUserRoles(roles);

      // Vendor check
      const { data: vendorData } = await (supabase as any)
        .from('vendors').select('id, shop_name').eq('user_id', user?.id ?? '').maybeSingle();
      if (vendorData) setVendorInfo(vendorData);
    } catch (err) {
      if (user) {
        setProfile({ full_name: user.user_metadata?.full_name || '', email: user.email, phone: user.user_metadata?.phone || '' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase]);

  const { refetch } = useDashboardFetch(queryKeys.user.settingsView(user?.id ?? 'none'), fetchProfile, {
    staleTime: 1000 * 60 * 5,
    enabled: !!user,
  });

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
      setAvatarPreview(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!user || !profile) return;
    setIsSaving(true);

    try {
      let avatarUrl = profile.user_photo_url;

      if (avatarUri) {
        const ext = avatarUri.split('.').pop() || 'jpg';
        const filePath = `${user.id}/profile.${ext}`;
        const arrayBuffer = await readFileAsArrayBuffer(avatarUri);

        const { error: uploadError } = await supabase.storage
          .from('user-photos').upload(filePath, arrayBuffer, { upsert: true, contentType: `image/${ext}` });
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('user-photos').getPublicUrl(filePath);
        avatarUrl = data.publicUrl;
      }

      const { error: dbError } = await (supabase as any)
        .from('users')
        .update({
          full_name: profile.full_name,
          phone: profile.phone,
          user_photo_url: avatarUrl,
        })
        .eq('id', user.id);
      if (dbError) throw dbError;

      if (vendorInfo) {
        await (supabase as any)
          .from('vendors')
          .update({ shop_name: vendorInfo.shop_name })
          .eq('id', vendorInfo.id);
      }

      await supabase.auth.updateUser({
        data: { full_name: profile.full_name, user_photo_url: avatarUrl, phone: profile.phone },
      });

      setToast({ message: 'Profile updated!', type: 'success' });
      onUpdate?.();
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to save.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const formatRole = (role: string) => {
    let r = role === 'tenant' ? 'client' : role;
    return r.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (isLoading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#708F96" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <Text style={styles.pageTitle}>Account Settings</Text>
      <Text style={styles.pageSubtitle}>Manage your personal information and profile details.</Text>

      {/* Profile Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="person-outline" size={18} color="#708F96" />
          <Text style={styles.sectionTitle}>Profile Information</Text>
        </View>

        {/* Avatar */}
        <TouchableOpacity style={styles.avatarContainer} onPress={handlePickAvatar}>
          {avatarPreview ? (
            <Image source={{ uri: avatarPreview }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={40} color="#CBD5E1" />
            </View>
          )}
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={14} color="#FFF" />
          </View>
        </TouchableOpacity>

        {/* Fields */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput style={styles.input} value={profile?.full_name || ''} onChangeText={v => setProfile({ ...profile, full_name: v })} placeholder="John Doe" placeholderTextColor="#94A3B8" />
        </View>

        {vendorInfo && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Shop Name</Text>
            <TextInput style={styles.input} value={vendorInfo.shop_name} onChangeText={v => setVendorInfo({ ...vendorInfo, shop_name: v })} placeholder="My Shop" placeholderTextColor="#94A3B8" />
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Phone</Text>
          <TextInput style={styles.input} value={profile?.phone || ''} onChangeText={v => setProfile({ ...profile, phone: v })} placeholder="+1 (555) 000-0000" placeholderTextColor="#94A3B8" keyboardType="phone-pad" />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email Address</Text>
          <View style={{ position: 'relative' }}>
            <TextInput style={[styles.input, { backgroundColor: '#F8FAFC', color: '#94A3B8' }]} value={profile?.email || ''} editable={false} />
            <View style={styles.readOnlyBadge}><Text style={styles.readOnlyText}>Read Only</Text></View>
          </View>
        </View>
      </View>

      {/* Roles Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="shield-outline" size={18} color="#708F96" />
          <Text style={styles.sectionTitle}>Account Roles</Text>
        </View>

        {userRoles.length > 0 ? (
          userRoles.map((role, idx) => (
            <View key={idx} style={styles.roleCard}>
              <View style={[styles.roleIcon, { backgroundColor: role.type === 'organization' ? 'rgba(99,102,241,0.08)' : 'rgba(16,185,129,0.08)' }]}>
                <Ionicons name={role.type === 'organization' ? 'business-outline' : 'home-outline'} size={18} color={role.type === 'organization' ? '#6366F1' : '#10B981'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleType}>{role.type}</Text>
                <Text style={styles.roleEntity}>{role.entityName}</Text>
              </View>
              <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{formatRole(role.role)}</Text></View>
            </View>
          ))
        ) : (
          <Text style={{ textAlign: 'center', color: '#94A3B8', fontSize: 13, padding: 16 }}>No active memberships found.</Text>
        )}
      </View>

      {/* Save */}
      <TouchableOpacity style={[styles.saveBtn, isSaving && { opacity: 0.6 }]} onPress={handleSave} disabled={isSaving}>
        {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="save-outline" size={20} color="#FFF" />
            <Text style={styles.saveBtnText}>Save Changes</Text>
          </View>
        )}
      </TouchableOpacity>

      {toast && <Toast message={toast.message} type={toast.type} visible={true} onClose={() => setToast(null)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: 24, fontWeight: '700', color: '#1A2332', marginBottom: 4 },
  pageSubtitle: { fontSize: 14, color: '#94A3B8', marginBottom: 20 },
  section: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 20, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1A2332' },
  avatarContainer: { alignSelf: 'center', marginBottom: 20, position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 4, borderColor: '#F1F5F9' },
  avatarPlaceholder: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#F1F5F9' },
  cameraBadge: { position: 'absolute', bottom: 0, right: -4, width: 28, height: 28, borderRadius: 14, backgroundColor: '#708F96', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
  input: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 14, fontSize: 14, fontWeight: '500', color: '#1A2332' },
  readOnlyBadge: { position: 'absolute', right: 12, top: 12, backgroundColor: 'rgba(245,158,11,0.08)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' },
  readOnlyText: { fontSize: 10, fontWeight: '700', color: '#D97706' },
  roleCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 8 },
  roleIcon: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  roleType: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },
  roleEntity: { fontSize: 13, fontWeight: '700', color: '#1A2332' },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#E2E8F0', borderRadius: 999 },
  roleBadgeText: { fontSize: 10, fontWeight: '700', color: '#475569', textTransform: 'uppercase' },
  saveBtn: { backgroundColor: '#708F96', borderRadius: 12, height: 48, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
});
