import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, usePathname } from 'expo-router';
import SafeBlurView from '@/components/ui/SafeBlurView';
import SidekickFace from '@/components/dashboard/SidekickFace';

const fontSans = Platform.OS === 'ios' ? 'System' : 'sans-serif';

type NavId = 'home' | 'tickets' | 'cassandra' | 'rooms' | 'communities';

interface NavItemDef {
  id: NavId;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const leftItems: NavItemDef[] = [
  { id: 'home', icon: 'grid', label: 'Dashboard' },
  { id: 'tickets', icon: 'ticket', label: 'Tickets' },
];

const rightItems: NavItemDef[] = [
  { id: 'rooms', icon: 'business', label: 'Rooms' },
  { id: 'communities', icon: 'people', label: 'Communities' },
];

export default function TenantBottomNav() {
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const activeId: NavId = (() => {
    const parts = pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] ?? '';
    const secondLast = parts[parts.length - 2] ?? '';

    if (last === 'requests') return 'tickets';
    if (last === 'rooms' || last === 'visitors') return 'rooms';
    if (last === 'communities') return 'communities';
    if (last === 'cassandra') return 'cassandra';
    if (last === 'tenant' || (secondLast === 'tenant' && last === propertyId)) return 'home';
    return 'home';
  })();

  const handlePress = (id: NavId) => {
    if (!propertyId) return;
    switch (id) {
      case 'home':
        router.navigate(`/property/${propertyId}/tenant` as any);
        break;
      case 'tickets':
        router.navigate(`/property/${propertyId}/tenant/requests` as any);
        break;
      case 'cassandra':
        router.navigate(`/cassandra?propertyId=${propertyId}` as any);
        break;
      case 'rooms':
        router.navigate(`/property/${propertyId}/rooms` as any);
        break;
      case 'communities':
        router.navigate(`/property/${propertyId}/tenant/communities` as any);
        break;
    }
  };

  const NavItem = ({ item }: { item: NavItemDef }) => {
    const isActive = activeId === item.id;
    return (
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => handlePress(item.id)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={item.icon as any}
          size={22}
          color={isActive ? '#FFFFFF' : 'rgba(255,255,255,0.45)'}
        />
        <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeBlurView intensity={60} tint="dark" style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.navBar}>
        {leftItems.map((item) => (
          <NavItem key={item.id} item={item} />
        ))}

        {/* Center Cassandra Orb — SidekickFace */}
        <TouchableOpacity
          style={[styles.navItem, styles.centerItem]}
          onPress={() => handlePress('cassandra')}
          activeOpacity={0.85}
        >
          <SidekickFace compact size={44} state="idle" />
          <Text style={[styles.navLabel, activeId === 'cassandra' && styles.navLabelActive]}>
            AI Assistant
          </Text>
        </TouchableOpacity>

        {rightItems.map((item) => (
          <NavItem key={item.id} item={item} />
        ))}
      </View>
    </SafeBlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(14, 14, 22, 0.92)',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 12,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    gap: 3,
    paddingVertical: 6,
    paddingBottom: 4,
  },
  navLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    fontFamily: fontSans,
  },
  navLabelActive: {
    color: '#FFFFFF',
  },
  centerItem: {
    position: 'relative',
  },
});
