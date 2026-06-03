import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname, useLocalSearchParams } from 'expo-router';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import SignOutModal from '../ui/SignOutModal';
import ThemeToggle from '../ui/ThemeToggle';

interface NavItem {
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

export default function DashboardSidebar(props: DrawerContentComponentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams();
  const orgId = params.orgId as string;
  const { signOut, user } = useAuth();
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const insets = useSafeAreaInsets();

  const NAV_SECTIONS: NavSection[] = [
    {
      title: 'Management',
      items: [
        { label: 'Overview', route: `/(dashboard)/${orgId}/dashboard`, icon: 'grid-outline' },
        { label: 'Tickets', route: `/(dashboard)/${orgId}/tickets`, icon: 'ticket-outline' },
        { label: 'Flow Map', route: `/(dashboard)/${orgId}/flow-map`, icon: 'git-merge-outline' },
      ],
    },
    {
      title: 'Property Ops',
      items: [
        { label: 'Rooms', route: `/(dashboard)/${orgId}/rooms`, icon: 'calendar-outline' },
        { label: 'Checklists', route: `/(dashboard)/${orgId}/sop/runner`, icon: 'checkmark-outline' },
        { label: 'Diesel', route: `/(dashboard)/${orgId}/diesel`, icon: 'flame-outline' },
        { label: 'Electricity', route: `/(dashboard)/${orgId}/electricity`, icon: 'flash-outline' },
        { label: 'Utilities', route: `/(dashboard)/${orgId}/utilities/meters`, icon: 'speedometer-outline' },
      ],
    },
    {
      title: 'Procurement',
      items: [
        { label: 'Stock', route: `/(dashboard)/${orgId}/stock/movement`, icon: 'cube-outline' },
        { label: 'Vendors', route: `/(dashboard)/${orgId}/vendors`, icon: 'business-outline' },
      ],
    },
    {
      title: 'People',
      items: [
        { label: 'Staff', route: `/(dashboard)/${orgId}/users`, icon: 'people-outline' },
        { label: 'Tenants', route: `/(dashboard)/${orgId}/tenants`, icon: 'home-outline' },
      ],
    },
  ];

  const getUserInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';
  };

  const isActive = (route: string) => pathname?.includes(route.split('/').pop() || '');

  const handleNavPress = (route: string) => {
    props.navigation.closeDrawer();
    router.push(route as any);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Logo Section */}
      <View style={styles.logoSection}>
        <View style={styles.logoRow}>
          <Image 
            source={require('../../assets/images/autopilot-logo-new.png')} 
            style={{ height: 56, width: 240, resizeMode: 'stretch', marginLeft: -8 }} 
          />
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>STAFF DASHBOARD</Text>
        </View>
      </View>

      {/* Navigation */}
      <ScrollView style={styles.navSection} showsVerticalScrollIndicator={false}>
        {NAV_SECTIONS.map((section) => (
          <View key={section.title}>
            {section.title && (
              <Text style={styles.sectionLabel}>{section.title}</Text>
            )}
            {section.items.map((item) => {
              const active = isActive(item.route);
              return (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => handleNavPress(item.route)}
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
          </View>
        ))}
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
              {user?.user_metadata?.role || 'User'}
            </Text>
          </View>
        </View>

        {/* Action Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              props.navigation.closeDrawer();
              router.push(`/(dashboard)/${orgId}/settings` as any);
            }}
          >
            <Ionicons name="settings-outline" size={18} color="#64748B" />
            <Text style={styles.actionText}>Settings</Text>
          </TouchableOpacity>
          <ThemeToggle />
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={() => setShowSignOutModal(true)}
        >
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={styles.signOutText}>Logout</Text>
        </TouchableOpacity>

        <SignOutModal
          visible={showSignOutModal}
          onClose={() => setShowSignOutModal(false)}
          onSignOut={signOut}
        />
      </View>
    </View>
  );
}

/**
 * Mobile Header — shown at the top of dashboard screens
 * with a hamburger menu to open the drawer.
 */
export function MobileHeader({ onMenuToggle }: { onMenuToggle: () => void }) {
  return (
    <View style={headerStyles.container}>
      <TouchableOpacity
        style={headerStyles.menuButton}
        onPress={onMenuToggle}
        accessibilityLabel="Open menu"
      >
        <Ionicons name="menu" size={22} color="#475569" />
      </TouchableOpacity>

      <View style={headerStyles.logoRow}>
        <Image 
          source={require('../../assets/images/autopilot-logo-new.png')} 
          style={{ height: 48, width: 200, resizeMode: 'stretch' }} 
        />
      </View>

      <View style={{ width: 44 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  logoSection: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
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
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(112,143,150,0.05)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(112,143,150,0.1)',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#708F96',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  navSection: {
    flex: 1,
    paddingHorizontal: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    marginBottom: 4,
    marginTop: 16,
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
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
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

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  logoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A2332',
  },
});
