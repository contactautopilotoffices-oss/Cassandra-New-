'use client';
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import { useAuth } from '@/hooks/useAuth';

interface ProfileTabProps {
  onSignOut?: () => void;
}

const fontSans = Platform.select({ web: 'system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });
const fontDisplay = Platform.select({ web: '"SF Pro Display", system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });

function SettingRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLeft}>
        {icon && <View style={styles.infoIcon}>{icon}</View>}
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function ProfileTab({ onSignOut }: ProfileTabProps) {
  const { user, signOut } = useAuth();

  const userName = user?.full_name ?? user?.user_metadata?.full_name ?? 'User';
  const email = user?.email ?? '';
  const phone = user?.user_metadata?.phone ?? '';
  const initials = userName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          onSignOut?.();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      {/* Avatar card */}
      <Animated.View entering={FadeInDown.delay(50).springify()} style={styles.avatarCard}>
        <View style={styles.avatarGlow} />
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.userName}>{userName}</Text>
        <Text style={styles.userEmail}>{email}</Text>
        <View style={styles.roleBadge}>
          <View style={styles.roleDot} />
          <Text style={styles.roleText}>Client</Text>
        </View>
      </Animated.View>

      {/* Account info card */}
      <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.card}>
        <Text style={styles.cardTitle}>Account Information</Text>

        <SettingRow
          label="Full Name"
          value={userName}
          icon={
            <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#708F96" strokeWidth="2" strokeLinecap="round">
              <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <Circle cx="12" cy="7" r="4" />
            </Svg>
          }
        />
        <View style={styles.divider} />

        <SettingRow
          label="Email"
          value={email}
          icon={
            <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#708F96" strokeWidth="2" strokeLinecap="round">
              <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <Path d="m22 6-10 7L2 6" />
            </Svg>
          }
        />
        <View style={styles.divider} />

        <SettingRow
          label="Phone"
          value={phone || 'Not set'}
          icon={
            <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#708F96" strokeWidth="2" strokeLinecap="round">
              <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.45 2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </Svg>
          }
        />
      </Animated.View>

      {/* Settings card */}
      <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.card}>
        <Text style={styles.cardTitle}>Settings</Text>

        <SettingRow
          label="Push Notifications"
          value="Enabled"
          icon={
            <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#708F96" strokeWidth="2" strokeLinecap="round">
              <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </Svg>
          }
        />
        <View style={styles.divider} />

        <SettingRow
          label="Camera Access"
          value="Enabled"
          icon={
            <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#708F96" strokeWidth="2" strokeLinecap="round">
              <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <Circle cx="12" cy="13" r="4" />
            </Svg>
          }
        />
        <View style={styles.divider} />

        <SettingRow
          label="Biometric Login"
          value="Off"
          icon={
            <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#708F96" strokeWidth="2" strokeLinecap="round">
              <Path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 0 0 8 11a4 4 0 1 1 8 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0 0 15.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 0 0 8 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
            </Svg>
          }
        />
      </Animated.View>

      {/* Sign out */}
      <Animated.View entering={FadeInDown.delay(200).springify()}>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
            <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <Path d="m16 17 5-5-5-5" />
            <Path d="M21 12H9" />
          </Svg>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </Animated.View>

      <Text style={styles.version}>Autopilot v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060912',
  },
  content: {
    paddingBottom: 200,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
      },
  avatarCard: {
    alignItems: 'center',
    paddingVertical: 28,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
  },
  avatarGlow: {
    position: 'absolute',
    top: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(112,143,150,0.15)',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(112,143,150,0.30)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#708F96',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
      },
  userEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 3,
      },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(112,143,150,0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 10,
    gap: 5,
  },
  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#708F96',
      },
  card: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
      },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(112,143,150,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
      },
  infoValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    maxWidth: '50%',
    textAlign: 'right',
      },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 2,
  },
  signOutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 14,
    marginHorizontal: 16,
    paddingVertical: 15,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
      },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 24,
    fontWeight: '500',
      },
});
