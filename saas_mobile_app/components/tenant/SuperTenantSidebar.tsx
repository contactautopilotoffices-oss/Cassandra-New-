'use client';
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import SignOutModal from '@/components/ui/SignOutModal';

interface NavItem {
  label: string;
  route?: string;
  icon: keyof typeof Ionicons.glyphMap;
  action?: () => void;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', route: 'home', icon: 'grid-outline' },
  { label: 'Tickets', route: 'tickets', icon: 'ticket-outline' },
  { label: 'Rooms', route: 'rooms', icon: 'bed-outline' },
  { label: 'Profile', route: 'profile', icon: 'person-outline' },
];

interface SuperTenantSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function SuperTenantSidebar({
  activeTab,
  onTabChange,
}: SuperTenantSidebarProps) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [visible, setVisible] = useState(false);

  const getUserInitials = (name: string) => {
    return name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';
  };

  const handleTabPress = (tab: string) => {
    setVisible(false);
    onTabChange(tab);
  };

  return (
    <>
      {/* Hamburger trigger — used by MobileHeader */}
      <TouchableOpacity
        style={hamburgerStyles.trigger}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="menu" size={22} color="#475569" />
      </TouchableOpacity>

      {/* Overlay + Drawer */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        {/* Backdrop */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        />

        {/* Drawer panel */}
        <View style={[styles.drawer, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <View style={styles.logoIcon}>
                <Text style={styles.logoIconText}>A</Text>
              </View>
              <Text style={styles.logoText}>AUTOPILOT</Text>
            </View>
            <TouchableOpacity
              style={hamburgerStyles.closeBtn}
              onPress={() => setVisible(false)}
            >
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={[styles.badge, { backgroundColor: 'rgba(112,143,150,0.06)', borderColor: 'rgba(112,143,150,0.1)' }]}>
            <Text style={styles.badgeText}>SUPER TENANT</Text>
          </View>

          {/* Navigation */}
          <ScrollView style={styles.navSection} showsVerticalScrollIndicator={false}>
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.route;
              return (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => handleTabPress(item.route!)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={active ? '#FFFFFF' : '#64748B'}
                  />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Bottom Section */}
          <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}>
            {/* User Profile */}
            <View style={styles.profileCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {getUserInitials(
                    user?.user_metadata?.full_name || user?.email || 'User'
                  )}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
                </Text>
                <Text style={styles.profileRole} numberOfLines={1}>
                  Super Tenant
                </Text>
              </View>
            </View>

            {/* Sign Out */}
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={() => setShowSignOutModal(true)}
            >
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              <Text style={styles.signOutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        <SignOutModal
          visible={showSignOutModal}
          onClose={() => setShowSignOutModal(false)}
          onSignOut={signOut}
        />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 280,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#708F96',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoIconText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  logoText: {
    fontSize: 18,
    fontWeight: '300',
    color: '#1A2332',
    letterSpacing: 3,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#708F96',
    letterSpacing: 2,
  },
  navSection: {
    flex: 1,
    marginTop: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  navItemActive: {
    backgroundColor: '#708F96',
    shadowColor: '#708F96',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  navLabelActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bottomSection: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 16,
    gap: 8,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(112,143,150,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#708F96',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A2332',
  },
  profileRole: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  signOutText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
});

const hamburgerStyles = StyleSheet.create({
  trigger: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
