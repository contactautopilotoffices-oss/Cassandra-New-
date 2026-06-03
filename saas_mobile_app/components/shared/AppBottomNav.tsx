import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';

export type TabKey = 'overview' | 'requests' | 'loggers' | 'profile' | 'stock' | 'checklist';

interface AppBottomNavProps {
  activeTab: TabKey;
  propertyId: string;
  onLoggersPress: () => void;
  onCreateRequestPress?: () => void;
  /** Base route prefix for navigation (default: '/mst') */
  baseRoute?: string;
  /** Show Loggers button (MST/Electricity/Diesel) or Stock button (Staff). Default: true (Loggers) */
  showLoggers?: boolean;
  /** Show Checklist button instead of Loggers/Stock. Default: false */
  showChecklist?: boolean;
}

export function AppBottomNav({
  activeTab,
  propertyId,
  onLoggersPress,
  onCreateRequestPress,
  baseRoute = '/mst',
  showLoggers = true,
  showChecklist = false,
}: AppBottomNavProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';

  const navigate = (tab: TabKey) => {
    switch (tab) {
      case 'overview':
        router.push(`/property/${propertyId}${baseRoute}` as any);
        break;
      case 'requests':
        router.push(`/property/${propertyId}${baseRoute}?tab=requests` as any);
        break;
      case 'profile':
        router.push(`/property/${propertyId}/profile` as any);
        break;
      case 'stock':
        router.push(`/property/${propertyId}/stock` as any);
        break;
      case 'checklist':
        router.push(`/property/${propertyId}/checklist` as any);
        break;
    }
  };

  const activeColor = colors.primary;
  const inactiveColor = isDark ? colors.textTertiary : colors.textSecondary;

  const NavItem = ({ tab, icon, label }: { tab: TabKey; icon: keyof typeof Ionicons.glyphMap; label: string }) => {
    const isActive = activeTab === tab;
    return (
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => tab === 'loggers' ? onLoggersPress() : navigate(tab)}
        activeOpacity={0.7}
      >
        <View style={[styles.navIconWrapper, isActive && { backgroundColor: colors.primary + '1A' }]}>
          <Ionicons
            name={isActive ? (icon.replace('-outline', '') as any) : icon}
            size={24}
            color={isActive ? activeColor : inactiveColor}
          />
        </View>
        <Text style={[styles.navText, { color: isActive ? activeColor : inactiveColor }]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  // Determine the 4th nav item: Checklist, Loggers (MST), or Stock (Staff)
  const FourthNav = () => {
    if (showChecklist) {
      const isChecklistActive = activeTab === 'checklist';
      return (
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigate('checklist')}
          activeOpacity={0.7}
        >
          <View style={[styles.navIconWrapper, isChecklistActive && { backgroundColor: colors.primary + '1A' }]}>
            <Ionicons
              name={isChecklistActive ? 'clipboard' : 'clipboard-outline'}
              size={24}
              color={isChecklistActive ? activeColor : inactiveColor}
            />
          </View>
          <Text style={[styles.navText, { color: isChecklistActive ? activeColor : inactiveColor }]}>CHECKLIST</Text>
        </TouchableOpacity>
      );
    }
    if (showLoggers) {
      return (
        <TouchableOpacity
          style={styles.navItem}
          onPress={onLoggersPress}
          activeOpacity={0.7}
        >
          <View style={[styles.navIconWrapper]}>
            <Ionicons name="options-outline" size={24} color={inactiveColor} />
          </View>
          <Text style={[styles.navText, { color: inactiveColor }]}>LOGGERS</Text>
        </TouchableOpacity>
      );
    }
    // Stock button for Staff/SoftService roles
    const isStockActive = activeTab === 'stock';
    return (
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => navigate('stock')}
        activeOpacity={0.7}
      >
        <View style={[styles.navIconWrapper, isStockActive && { backgroundColor: colors.primary + '1A' }]}>
          <Ionicons
            name={isStockActive ? 'cube' : 'cube-outline'}
            size={24}
            color={isStockActive ? activeColor : inactiveColor}
          />
        </View>
        <Text style={[styles.navText, { color: isStockActive ? activeColor : inactiveColor }]}>STOCK</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[
      styles.bottomNav,
      {
        backgroundColor: colors.surface,
        borderTopColor: colors.border,
        paddingBottom: Math.max(insets.bottom, 16)
      }
    ]}>
      <NavItem tab="overview" icon="grid-outline" label="OVERVIEW" />
      <NavItem tab="requests" icon="ticket-outline" label="REQUESTS" />

      <TouchableOpacity
        style={styles.navItemCenter}
        onPress={() => {
          if (onCreateRequestPress) {
            onCreateRequestPress();
          } else {
            Alert.alert('New Request', 'Use the "+" button on the dashboard.');
          }
        }}
        activeOpacity={0.8}
      >
        <View style={[styles.centerFab, { backgroundColor: colors.primary, shadowColor: colors.primary, borderColor: colors.surface }]}>
          <Ionicons name="add" size={32} color={colors.surface} />
        </View>
      </TouchableOpacity>

      <FourthNav />
      <NavItem tab="profile" icon="person-outline" label="PROFILE" />
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
  },
  navIconWrapper: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  navText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  navItemCenter: {
    alignItems: 'center',
    flex: 1,
    height: 60,
    justifyContent: 'center',
  },
  centerFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -30,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 4,
  },
});
