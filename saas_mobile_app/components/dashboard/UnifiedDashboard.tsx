import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  LayoutDashboard,
  Ticket,
  Users,
  UserCheck,
  DoorOpen,
  Fuel,
  Zap,
  Package,
  FileText,
  Shield,
  ClipboardList,
  ArrowRight,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react-native';
import { GlassCard } from '@/constants/designSystem';
import PendingApprovals from '@/components/procurement/PendingApprovals';
import PermissionOnboarding, {
  hasRequestedPermissions,
} from '@/components/onboarding/PermissionOnboarding';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context';
import { CapabilityDomain } from '@/types/rbac';

const { width: SCREEN_W } = Dimensions.get('window');

const isMobile = SCREEN_W < 768;
const TILE_GAP = 12;
const containerPadding = 24 * 2; // Left + Right scrollContent padding
const contentWidth = isMobile ? (SCREEN_W - containerPadding) : (SCREEN_W - 288 - containerPadding);
const TILE_WIDTH = (contentWidth - TILE_GAP) / 2;

interface ModuleTile {
  domain: CapabilityDomain;
  label: string;
  route: string;
  icon: LucideIcon;
  color: string;
}

const MODULE_TILES: ModuleTile[] = [
  { domain: 'tickets', label: 'Requests', route: 'tickets', icon: Ticket, color: '#2997FF' },
  { domain: 'users', label: 'User Management', route: 'users', icon: Users, color: '#AF52DE' },
  { domain: 'visitors', label: 'Visitors', route: 'visitors', icon: UserCheck, color: '#34C759' },
  { domain: 'properties', label: 'Rooms', route: 'rooms', icon: DoorOpen, color: '#FF9F0A' },
  { domain: 'assets', label: 'Diesel', route: 'diesel', icon: Fuel, color: '#FF3B30' },
  { domain: 'assets', label: 'Electricity', route: 'electricity', icon: Zap, color: '#FFD60A' },
  { domain: 'stock', label: 'Stock', route: 'stock', icon: Package, color: '#64D2FF' },
  { domain: 'procurement', label: 'Procurement', route: 'procurement', icon: ShoppingCart, color: '#007AFF' },
  { domain: 'sop', label: 'Checklists', route: 'checklist', icon: ClipboardList, color: '#34C759' },
  { domain: 'reports', label: 'Reports', route: 'reports', icon: FileText, color: '#A2845E' },
  { domain: 'security', label: 'Security', route: 'security', icon: Shield, color: '#FF453A' },
];

export default function UnifiedDashboard() {
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const { membership } = useAuth();
  const { theme } = useTheme();
  const { capabilities, roleKey } = useCapabilities(propertyId);

  const isDark = theme === 'dark';
  const bgGradient = isDark ? ['#0F1419', '#1A1F2E'] as const : ['#F8FAFC', '#EEF2F6'] as const;

  const [showPermissionOnboarding, setShowPermissionOnboarding] = useState(false);

  useEffect(() => {
    const check = async () => {
      const requested = await hasRequestedPermissions();
      if (!requested) {
        setShowPermissionOnboarding(true);
      }
    };
    check();
  }, []);

  const propertyName = useMemo(() => {
    const prop = membership?.properties?.find(
      (p) => p.id.toLowerCase() === (propertyId ?? '').toLowerCase()
    );
    return prop?.name ?? 'Property';
  }, [membership, propertyId]);

  // Filter tiles by capabilities (need 'view' action on the domain)
  const visibleTiles = useMemo(() => {
    const tiles: ModuleTile[] = [];
    const seen = new Set<string>();

    // Always show Requests if tickets capability exists
    if (capabilities.tickets?.includes('view')) {
      tiles.push(MODULE_TILES[0]);
      seen.add('tickets');
    }

    for (const tile of MODULE_TILES.slice(1)) {
      if (seen.has(tile.route)) continue;
      if (capabilities[tile.domain]?.includes('view')) {
        tiles.push(tile);
        seen.add(tile.route);
      }
    }
    return tiles;
  }, [capabilities]);

  const handleNavigate = (route: string) => {
    router.push(`/property/${propertyId}/${route}` as never);
  };

  return (
    <LinearGradient colors={bgGradient} style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.greeting, { color: isDark ? '#E6EBEE' : '#1D1D1F' }]}>
            Welcome back
          </Text>
          <Text style={[styles.propertyName, { color: isDark ? '#FFFFFF' : '#1D1D1F' }]}>
            {propertyName}
          </Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              {roleKey.replace(/_/g, ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Dashboard overview card */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => handleNavigate('dashboard')}
        >
          <GlassCard style={styles.overviewCard}>
            <LinearGradient
              colors={['rgba(112,143,150,0.15)', 'rgba(112,143,150,0.05)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.overviewRow}>
              <LayoutDashboard size={28} color="#708F96" strokeWidth={1.5} />
              <View style={styles.overviewText}>
                <Text style={[styles.overviewTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
                  Overview
                </Text>
                <Text style={[styles.overviewSubtitle, { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' }]}>
                  Your central command
                </Text>
              </View>
              <ArrowRight size={18} color="#708F96" strokeWidth={1.5} />
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* Needs Attention — Pending Material Approvals */}
        <PendingApprovals />

        {/* Section label */}
        <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(230,235,238,0.4)' : 'rgba(26,35,50,0.4)' }]}>
          MODULES
        </Text>

        {/* Module tiles grid */}
        <View style={styles.grid}>
          {visibleTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <TouchableOpacity
                key={tile.route + tile.label}
                activeOpacity={0.75}
                onPress={() => handleNavigate(tile.route)}
              >
                <GlassCard style={styles.tile}>
                  <View style={[styles.tileIconCircle, { backgroundColor: `${tile.color}18` }]}>
                    <Icon size={22} color={tile.color} strokeWidth={1.8} />
                  </View>
                  <Text
                    style={[styles.tileLabel, { color: isDark ? '#E6EBEE' : '#1D1D1F' }]}
                    numberOfLines={2}
                  >
                    {tile.label}
                  </Text>
                </GlassCard>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Empty state */}
        {visibleTiles.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: isDark ? 'rgba(230,235,238,0.4)' : 'rgba(26,35,50,0.4)' }]}>
              No modules available for your role.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* First-time permission onboarding */}
      <PermissionOnboarding
        visible={showPermissionOnboarding}
        onComplete={() => setShowPermissionOnboarding(false)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
        fontSize: 15,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  propertyName: {
        fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(112,143,150,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(112,143,150,0.18)',
  },
  roleText: {
        fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#708F96',
  },
  overviewCard: {
    marginBottom: 24,
    padding: 20,
    overflow: 'hidden',
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  overviewText: {
    flex: 1,
  },
  overviewTitle: {
        fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  overviewSubtitle: {
        fontSize: 13,
  },
  sectionLabel: {
        fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 14,
    marginLeft: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tile: {
    width: TILE_WIDTH,
    padding: 16,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 120,
    marginBottom: TILE_GAP,
  },
  tileIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  tileLabel: {
        fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
        fontSize: 14,
    textAlign: 'center',
  },
});
