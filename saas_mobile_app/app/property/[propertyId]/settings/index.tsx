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
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';
import { Colors, DASHBOARD_BACKGROUNDS, type DashboardBgKey } from '@/constants/Colors';
import { createClient } from '@/utils/supabase/client';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  User,
  ChevronRight,
  Shield,
  Building2,
  Palette,
  FileText,
  HelpCircle,
  LogOut,
  MapPin,
  Camera,
  Mic,
  ImageIcon,
  Smartphone,
  Lock,
  Mail,
} from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';

// ─── Permission helpers (lazy so web doesn't crash) ──────────────────────────
let CameraModule: any = null;
let AudioModule: any = null;
let NotificationsModule: any = null;

if (Platform.OS !== 'web') {
  CameraModule = require('expo-camera');
  AudioModule = require('expo-av').Audio;
  NotificationsModule = require('expo-notifications');
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface Property {
  id: string;
  name: string;
  code: string;
  address?: string;
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  user_photo_url?: string | null;
  role?: string;
  designation?: string;
}

export default function SettingsScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { user, membership, signOut } = useAuth();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  const [property, setProperty] = useState<Property | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [dashboardBg, setDashboardBg] = useState<DashboardBgKey>('night');
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  // Permissions state
  const [perms, setPerms] = useState({
    camera: 'undetermined' as string,
    audio: 'undetermined' as string,
    notifications: 'undetermined' as string,
  });

  const supabase = React.useMemo(() => createClient(), []);

  // ─── Fetch data ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!propertyId || !user) return;
    try {
      const { data: propData } = await (supabase as any)
        .from('properties')
        .select('id, name, code, address')
        .eq('id', propertyId)
        .maybeSingle();
      if (propData) setProperty(propData as Property);

      const { data: userData } = await (supabase as any)
        .from('users')
        .select('id, full_name, email, user_photo_url, role, designation')
        .eq('id', user.id)
        .maybeSingle();
      if (userData) setUserProfile(userData as UserProfile);

      const locSetting = await AsyncStorage.getItem('fms_weather_location_enabled');
      setLocationEnabled(locSetting !== 'false');

      const bgSetting = await AsyncStorage.getItem('fms_dashboard_background');
      if (bgSetting && bgSetting in DASHBOARD_BACKGROUNDS) {
        setDashboardBg(bgSetting as DashboardBgKey);
      }
    } catch (error) {
      console.error('Error fetching settings data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [propertyId, user, supabase]);

  // ─── Permissions ───────────────────────────────────────────────────────────
  const refreshPermissions = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const [camStatus, audioStatus, notifStatus] = await Promise.all([
        CameraModule ? CameraModule.getCameraPermissionsAsync() : Promise.resolve({ status: 'undetermined' }),
        AudioModule && AudioModule.getPermissionsAsync ? AudioModule.getPermissionsAsync() : Promise.resolve({ status: 'undetermined' }),
        NotificationsModule ? NotificationsModule.getPermissionsAsync() : Promise.resolve({ status: 'undetermined' }),
      ]);
      setPerms({
        camera: camStatus?.status ?? 'undetermined',
        audio: audioStatus?.status ?? 'undetermined',
        notifications: notifStatus?.status ?? 'undetermined',
      });
    } catch (e) {
      console.log('Permission check error:', e);
    }
  }, []);

  const { refetch } = useDashboardFetch(queryKeys.property.settings(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  const requestCamera = async () => {
    if (Platform.OS === 'web') return;
    try {
      const { status } = await CameraModule.requestCameraPermissionsAsync();
      setPerms(p => ({ ...p, camera: status }));
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed for scanning and photo features. Please enable it in device settings.');
      }
    } catch (e) {
      console.error('Camera permission error:', e);
    }
  };

  const requestAudio = async () => {
    if (Platform.OS === 'web') return;
    try {
      const { status } = await AudioModule.requestPermissionsAsync();
      setPerms(p => ({ ...p, audio: status }));
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is needed for voice features. Please enable it in device settings.');
      }
    } catch (e) {
      console.error('Audio permission error:', e);
    }
  };

  const requestNotifications = async () => {
    if (Platform.OS === 'web') return;
    try {
      const { status } = await NotificationsModule.requestPermissionsAsync();
      setPerms(p => ({ ...p, notifications: status }));
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Push notifications are needed for alerts. Please enable them in device settings.');
      }
    } catch (e) {
      console.error('Notification permission error:', e);
    }
  };

  // ─── Security / Change Password ────────────────────────────────────────────
  const handleChangePassword = async () => {
    const email = userProfile?.email || user?.email;
    if (!email) {
      Alert.alert('Error', 'No email address found for this account.');
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      Alert.alert('Check Your Email', `A password reset link has been sent to ${email}. Follow the instructions in the email to set a new password.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send reset email. Please try again.');
    }
    setShowSecurityModal(false);
  };

  // ─── Background picker ─────────────────────────────────────────────────────
  const handleSelectBg = async (key: DashboardBgKey) => {
    await AsyncStorage.setItem('fms_dashboard_background', key);
    setDashboardBg(key);
    setShowBgPicker(false);
    Alert.alert('Background Updated', 'Your dashboard background will change on next refresh.');
  };

  const clearBgOverride = async () => {
    await AsyncStorage.removeItem('fms_dashboard_background');
    setDashboardBg('night');
    setShowBgPicker(false);
    Alert.alert('Background Reset', 'Dashboard will now use live weather or default background.');
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchData();
    await refreshPermissions();
    setIsRefreshing(false);
  }, [fetchData, refreshPermissions]);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const getRoleDisplay = () => {
    if (!membership || !propertyId) return 'Member';
    const prop = membership.properties.find((p) => p.id === propertyId);
    if (!prop) return 'Member';
    return prop.role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const handleToggleLocation = async () => {
    const newValue = !locationEnabled;
    setLocationEnabled(newValue);
    await AsyncStorage.setItem('fms_weather_location_enabled', newValue ? 'true' : 'false');
  };

  const permLabel = (status: string) => {
    if (status === 'granted') return 'Allowed';
    if (status === 'denied') return 'Denied';
    return 'Not requested';
  };
  const permColor = (status: string) => {
    if (status === 'granted') return '#22C55E';
    if (status === 'denied') return '#EF4444';
    return '#F59E0B';
  };

  // ─── Glass Card Component ──────────────────────────────────────────────────
  const GlassCard = ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <SafeBlurView intensity={isDark ? 50 : 60} tint={isDark ? 'dark' : 'light'} style={[styles.glassCard, style]}>
      <LinearGradient
        colors={isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)', 'rgba(0,0,0,0.15)'] : ['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.3)']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={{ zIndex: 2 }}>{children}</View>
    </SafeBlurView>
  );

  // ─── Menu Row Component ────────────────────────────────────────────────────
  const MenuRow = ({
    icon,
    title,
    subtitle,
    onPress,
    toggle,
    toggleValue,
    right,
  }: {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    onPress: () => void;
    toggle?: boolean;
    toggleValue?: boolean;
    right?: React.ReactNode;
  }) => (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuLeft}>
        <View style={[styles.menuIconWrap, { backgroundColor: isDark ? 'rgba(112,143,150,0.15)' : 'rgba(112,143,150,0.1)' }]}>
          {icon}
        </View>
        <View>
          <Text style={[styles.menuTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        </View>
      </View>
      {toggle ? (
        <View style={[styles.toggleTrack, { backgroundColor: toggleValue ? '#708F96' : isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}>
          <View style={[styles.toggleKnob, { transform: [{ translateX: toggleValue ? 18 : 0 }] }]} />
        </View>
      ) : right ? (
        right
      ) : (
        <ChevronRight size={18} color={colors.textTertiary} />
      )}
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={isDark ? ['#0B1120', '#0f172a', '#1e1b4b'] : ['#eef2f6', '#f8fafc']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#708F96" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={isDark ? ['#0B1120', '#0f172a', '#1e1b4b'] : ['#eef2f6', '#f8fafc']} style={StyleSheet.absoluteFillObject} />
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* ── Header ── */}
      <View style={styles.headerWrap}>
        <LinearGradient colors={['#708F96', '#4A6670', '#2D3F47']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backOrb} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* User card */}
        <TouchableOpacity style={styles.userCard} onPress={() => router.push(`/property/${propertyId}/profile` as any)} activeOpacity={0.8}>
          <View style={styles.avatarRing}>
            {userProfile?.user_photo_url ? (
              <Image source={{ uri: userProfile.user_photo_url }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarLetter}>{userProfile?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}</Text>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.userName} numberOfLines={1}>{userProfile?.full_name || 'User'}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{userProfile?.email || user?.email || ''}</Text>
            <Text style={styles.userRole}>{getRoleDisplay()}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#708F96" />}
      >
        {/* ── Property ── */}
        {property && (
          <GlassCard>
            <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>PROPERTY</Text>
            <View style={styles.propertyRow}>
              <Building2 size={18} color="#708F96" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.propertyName, { color: colors.text }]} numberOfLines={1}>{property.name}</Text>
                <Text style={[styles.propertyCode, { color: colors.textSecondary }]}>{property.code}</Text>
              </View>
            </View>
          </GlassCard>
        )}

        {/* ── Preferences ── */}
        <GlassCard>
          <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>PREFERENCES</Text>

          <MenuRow
            icon={<MapPin size={18} color="#708F96" />}
            title="Weather Location"
            subtitle={locationEnabled ? 'Using location for live weather' : 'Location disabled'}
            onPress={handleToggleLocation}
            toggle
            toggleValue={locationEnabled}
          />

          <MenuRow
            icon={<ImageIcon size={18} color="#708F96" />}
            title="Dashboard Background"
            subtitle={DASHBOARD_BACKGROUNDS[dashboardBg]?.label || 'Night'}
            onPress={() => setShowBgPicker(true)}
          />
        </GlassCard>

        {/* ── Permissions ── */}
        <GlassCard>
          <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>PERMISSIONS</Text>

          <MenuRow
            icon={<Camera size={18} color="#708F96" />}
            title="Camera"
            subtitle={permLabel(perms.camera)}
            onPress={requestCamera}
            right={
              <View style={[styles.permBadge, { backgroundColor: permColor(perms.camera) + '18' }]}>
                <Text style={[styles.permBadgeText, { color: permColor(perms.camera) }]}>
                  {perms.camera === 'granted' ? 'Granted' : 'Enable'}
                </Text>
              </View>
            }
          />

          <MenuRow
            icon={<Mic size={18} color="#708F96" />}
            title="Microphone"
            subtitle={permLabel(perms.audio)}
            onPress={requestAudio}
            right={
              <View style={[styles.permBadge, { backgroundColor: permColor(perms.audio) + '18' }]}>
                <Text style={[styles.permBadgeText, { color: permColor(perms.audio) }]}>
                  {perms.audio === 'granted' ? 'Granted' : 'Enable'}
                </Text>
              </View>
            }
          />

          <MenuRow
            icon={<Smartphone size={18} color="#708F96" />}
            title="Push Notifications"
            subtitle={permLabel(perms.notifications)}
            onPress={requestNotifications}
            right={
              <View style={[styles.permBadge, { backgroundColor: permColor(perms.notifications) + '18' }]}>
                <Text style={[styles.permBadgeText, { color: permColor(perms.notifications) }]}>
                  {perms.notifications === 'granted' ? 'Granted' : 'Enable'}
                </Text>
              </View>
            }
          />
        </GlassCard>

        {/* ── Support ── */}
        <GlassCard>
          <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>SUPPORT</Text>

          <MenuRow icon={<Shield size={18} color="#708F96" />} title="Security" subtitle="Password and authentication" onPress={() => setShowSecurityModal(true)} />
          <MenuRow icon={<FileText size={18} color="#708F96" />} title="Terms & Privacy" subtitle="Legal information" onPress={() => {}} />
          <MenuRow icon={<HelpCircle size={18} color="#708F96" />} title="Help & Support" subtitle="Get assistance" onPress={() => {}} />
        </GlassCard>

        {/* ── Sign Out ── */}
        <TouchableOpacity style={[styles.signOutBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)' }]} onPress={handleSignOut} activeOpacity={0.8}>
          <LogOut size={18} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 40 }}>
          <Text style={[styles.versionText, { color: colors.textTertiary }]}>Autopilot v1.0.0</Text>
        </View>
      </ScrollView>

      {/* ── Background Picker Modal ── */}
      {showBgPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowBgPicker(false)}>
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowBgPicker(false)} activeOpacity={1} />
            <SafeBlurView intensity={70} tint="dark" style={styles.bgPickerSheet}>
              <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.25)']} style={StyleSheet.absoluteFillObject} />

              <View style={styles.bgPickerHeader}>
                <Text style={[styles.bgPickerTitle, { color: colors.text }]}>Dashboard Background</Text>
                <TouchableOpacity onPress={() => setShowBgPicker(false)} activeOpacity={0.7}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.bgGrid}>
                {(Object.keys(DASHBOARD_BACKGROUNDS) as DashboardBgKey[]).map((key) => {
                  const isSelected = dashboardBg === key;
                  return (
                    <TouchableOpacity key={key} style={[styles.bgOption, isSelected && styles.bgOptionActive]} onPress={() => handleSelectBg(key)} activeOpacity={0.8}>
                      <Image source={DASHBOARD_BACKGROUNDS[key].image} style={styles.bgOptionImg} resizeMode="cover" />
                      <Text style={[styles.bgOptionLabel, { color: colors.text }]}>{DASHBOARD_BACKGROUNDS[key].label}</Text>
                      {isSelected && (
                        <View style={styles.bgOptionCheck}>
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.resetBtn} onPress={clearBgOverride} activeOpacity={0.7}>
                <Text style={styles.resetText}>Reset to Default</Text>
              </TouchableOpacity>
            </SafeBlurView>
          </View>
        </Modal>
      )}

      {/* ── Security Modal ── */}
      {showSecurityModal && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowSecurityModal(false)}>
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowSecurityModal(false)} activeOpacity={1} />
            <SafeBlurView intensity={70} tint="dark" style={styles.bgPickerSheet}>
              <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.25)']} style={StyleSheet.absoluteFillObject} />

              <View style={styles.bgPickerHeader}>
                <Text style={[styles.bgPickerTitle, { color: colors.text }]}>Security</Text>
                <TouchableOpacity onPress={() => setShowSecurityModal(false)} activeOpacity={0.7}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.securityCard}>
                <View style={styles.securityIconWrap}>
                  <Lock size={28} color="#708F96" />
                </View>
                <Text style={[styles.securityTitle, { color: colors.text }]}>Change Password</Text>
                <Text style={[styles.securityDesc, { color: colors.textSecondary }]}>
                  We will send a password reset email to{'\n'}
                  <Text style={{ color: colors.text, fontFamily: 'Poppins-Bold' }}>{userProfile?.email || user?.email}</Text>
                </Text>
                <TouchableOpacity style={styles.securityActionBtn} onPress={handleChangePassword} activeOpacity={0.8}>
                  <Mail size={18} color="#fff" />
                  <Text style={styles.securityActionText}>Send Reset Email</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.securityCard, { marginTop: 12 }]}>
                <View style={styles.securityIconWrap}>
                  <Shield size={28} color="#708F96" />
                </View>
                <Text style={[styles.securityTitle, { color: colors.text }]}>Account Protection</Text>
                <Text style={[styles.securityDesc, { color: colors.textSecondary }]}>
                  Your account is secured with Supabase Auth. Password reset links expire after 1 hour for your safety.
                </Text>
              </View>
            </SafeBlurView>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  headerWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
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
    fontFamily: 'Poppins-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 4,
  },
  avatarRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  avatarImg: { width: 56, height: 56, borderRadius: 28 },
  avatarLetter: {
    fontSize: 22,
    fontFamily: 'Poppins-Bold',
    color: '#fff',
  },
  userName: {
    fontSize: 17,
    fontFamily: 'Poppins-Bold',
    color: '#fff',
  },
  userEmail: {
    fontSize: 12,
    fontFamily: 'Urbanist-Regular',
    color: 'rgba(255,255,255,0.65)',
    marginTop: 1,
  },
  userRole: {
    fontSize: 11,
    fontFamily: 'Urbanist-SemiBold',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
    textTransform: 'capitalize',
  },

  // Scroll
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
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
    fontFamily: 'Urbanist-Bold',
    letterSpacing: 1.2,
    marginBottom: 14,
    textTransform: 'uppercase',
  },

  // Property
  propertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  propertyName: {
    fontSize: 15,
    fontFamily: 'Poppins-Bold',
  },
  propertyCode: {
    fontSize: 12,
    fontFamily: 'Urbanist-Regular',
    marginTop: 2,
  },

  // Menu Row
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-Bold',
  },
  menuSubtitle: {
    fontSize: 11,
    fontFamily: 'Urbanist-Regular',
    marginTop: 1,
  },

  // Toggle
  toggleTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },

  // Permission badge
  permBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  permBadgeText: {
    fontSize: 11,
    fontFamily: 'Urbanist-Bold',
  },

  // Sign out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 4,
  },
  signOutText: {
    fontSize: 15,
    fontFamily: 'Poppins-Bold',
    color: '#EF4444',
  },
  versionText: {
    fontSize: 12,
    fontFamily: 'Urbanist-Regular',
  },

  // Modal overlay
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bgPickerSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    overflow: 'hidden',
    minHeight: 400,
  },
  bgPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  bgPickerTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
  },

  // Background grid
  bgGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bgOption: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  bgOptionActive: {
    borderColor: '#708F96',
    borderWidth: 2,
  },
  bgOptionImg: {
    width: '100%',
    height: '75%',
  },
  bgOptionLabel: {
    fontSize: 11,
    fontFamily: 'Urbanist-SemiBold',
    textAlign: 'center',
    paddingVertical: 6,
  },
  bgOptionCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#708F96',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetBtn: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  resetText: {
    fontSize: 14,
    fontFamily: 'Poppins-Bold',
    color: 'rgba(255,255,255,0.6)',
  },

  // Security modal
  securityCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 20,
    alignItems: 'center',
  },
  securityIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(112,143,150,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  securityTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
    marginBottom: 6,
  },
  securityDesc: {
    fontSize: 13,
    fontFamily: 'Urbanist-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  securityActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: '#708F96',
    width: '100%',
  },
  securityActionText: {
    fontSize: 14,
    fontFamily: 'Poppins-Bold',
    color: '#fff',
  },
});
