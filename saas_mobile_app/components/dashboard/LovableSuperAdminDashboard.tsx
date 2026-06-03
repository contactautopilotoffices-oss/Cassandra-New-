import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { serverApi } from '@/lib/serverApi';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWeather } from '@/hooks/useWeather';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { useAsyncStorageCache } from '@/hooks/useAsyncStorageCache';

// Modular Lovable Components
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import SignOutModal from '@/components/ui/SignOutModal';
import DetailModal, { type TileDetail } from '@/components/dashboard/DetailModal';
import CassandraSessionModal from '@/components/cassandra/CassandraSessionModal';

import { 
  BG, 
  LOVABLE_EMAIL, 
  fontSans, 
  fontDisplay 
} from './lovable/constants';
import { 
  Property, 
  Screen, 
  Tab, 
  Org, 
  SystemUser 
} from './lovable/types';

import PropertyCard from './lovable/PropertyCard';
import BottomNav from './lovable/BottomNav';
import PropertyDetailScreen from './lovable/PropertyDetailScreen';
import AnalyticsScreen from './lovable/AnalyticsScreen';
import SkeletonLoader from './lovable/SkeletonLoader';
import {
  SPACING,
  CARD_SURFACES,
} from '@/constants/designSystem';
import { 
  OverviewTab, 
  OrganizationsTab
} from './lovable/ConsoleScreen';

// ─── Main dashboard ────────────────────────────────────────────────────────────
export default function LovableSuperAdminDashboard() {
  const router = useRouter();
  const { user, signOut, membership, isMembershipLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const { weather } = useWeather();

  // Access control — Lovable super admin is email-gated
  const hasAccess = user?.email?.toLowerCase() === LOVABLE_EMAIL?.toLowerCase();

  // orgId — use membership from AuthContext (already fetched), fall back to org_memberships query
  const orgId = membership?.org_id ?? '';

  // ── AsyncStorage cache — must be declared BEFORE useState that uses its values ──
  const { cachedData: saCache, hasCache: hasSaCache, saveCache: saveSaCache } = useAsyncStorageCache<{
    properties: Property[];
    organizations: Org[];
    users: SystemUser[];
  }>({ key: 'super-admin-dashboard', propertyId: user?.id ?? 'super', staleTime: 10 * 60 * 1000 });

  // Screen state
  const [screen, setScreen] = useState<Screen>('properties');
  const [activeProperty, setActiveProperty] = useState<Property | null>(null);
  const [consoleTab, setConsoleTab] = useState<Tab>('overview');
  const [showChat, setShowChat] = useState(false);
  const [showTileDetail, setShowTileDetail] = useState<TileDetail | null>(null);
  const [showSignOut, setShowSignOut] = useState(false);

  // Data state — pre-seeded from AsyncStorage cache for instant paint
  const [properties, setProperties] = useState<Property[]>(saCache?.properties ?? []);
  const [organizations, setOrganizations] = useState<Org[]>(saCache?.organizations ?? []);
  const [users, setUsers] = useState<SystemUser[]>(saCache?.users ?? []);
  const [isLoading, setIsLoading] = useState(!hasSaCache);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Issue #9: Search Debounce
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [consoleSearchQuery, setConsoleSearchQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Derived stats
  const consoleStats = useMemo(
    () => ({
      orgs: organizations.length,
      properties: properties.length,
      users: users.length,
      tickets: properties.reduce((sum, p) => sum + (p.openTickets ?? 0), 0),
    }),
    [organizations, properties, users]
  );

  // Fetch
  const fetchAll = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    setFetchError(null);

    try {
      // Determine orgId: use membership from AuthContext first, then fall back
      let resolvedOrgId = membership?.org_id ?? '';
      if (!resolvedOrgId) {
        const { data: orgMembership } = await supabase
          .from('organization_memberships')
          .select('organization_id, role')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .in('role', ['org_super_admin', 'org_admin', 'owner', 'super_tenant'] as any)
          .limit(1)
          .maybeSingle();
        resolvedOrgId = (orgMembership as { organization_id: string } | null)?.organization_id ?? '';
      }

      if (!resolvedOrgId) {
        // No org membership found
        setFetchError('No organization found. Please ensure your account has org access.');
        setProperties([]);
        setOrganizations([]);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      // Fetch all orgs for console (system-wide for super admin)
      const { data: allOrgs, error: orgsError } = await supabase
        .from('organizations')
        .select('*, properties(count)')
        .order('created_at', { ascending: false });
      if (orgsError) {/* orgs fetch failed */}
      else if (allOrgs) setOrganizations(allOrgs as Org[]);

      // Fetch properties for this org
      const { data: propData, error: propError } = await supabase
        .from('properties')
        .select('id, name, code, address, image_url, organization_id')
        .eq('organization_id', resolvedOrgId);
      if (propError) {/* properties fetch failed */}

      if (!propData || propData.length === 0) {
        {/* no properties */}
        setProperties([]);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const propIds = propData.map((p: any) => p.id);

      // Set properties immediately to load them instantly
      const initialMapped: Property[] = propData.map((p: any) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        address: p.address,
        image_url: p.image_url,
        openTickets: 0,
        resolvedTickets: 0,
        totalTickets: 0,
        healthScore: 100,
        healthStatus: 'good',
        checklist: { completed: 0, total: 1, percent: 100 },
        energy: { diesel: 0, electricity: 0, trend: 0 },
        tickets: [],
        status: 'optimal',
      }));
      
      setProperties(initialMapped);
      setIsLoading(false);

      // Parallel fetch: tickets (all time), SOPs, diesel, electricity, 30-day for trend
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [
        { data: ticketData, error: ticketError },
        { data: sopData, error: sopError },
        { data: dieselData, error: dieselError },
        { data: electricData, error: electricError },
        { data: historicalElectricData, error: histError }
      ] = await Promise.all([
        serverApi.query({ table: 'tickets', action: 'select', select: 'property_id, status, created_at, priority', filters: [{ op: 'in', column: 'property_id', values: propIds }] }),
        serverApi.query({ table: 'sop_completions', action: 'select', select: 'property_id, status', filters: [{ op: 'in', column: 'property_id', values: propIds }] }),
        serverApi.query({ table: 'diesel_readings', action: 'select', select: 'property_id, computed_consumed_litres', filters: [{ op: 'in', column: 'property_id', values: propIds }] }),
        serverApi.query({ table: 'electricity_readings', action: 'select', select: 'property_id, final_units', filters: [{ op: 'in', column: 'property_id', values: propIds }] }),
        serverApi.query({ table: 'electricity_readings', action: 'select', select: 'property_id, final_units, created_at', filters: [{ op: 'in', column: 'property_id', values: propIds }, { op: 'gte', column: 'created_at', value: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }] })
      ]);

      if (ticketError) {/* tickets fetch failed */}
      if (sopError) {/* sop fetch failed */}
      if (dieselError) {/* diesel fetch failed */}
      if (electricError) {/* electricity fetch failed */}
      if (histError) {/* historical electricity fetch failed */}

      const ticketMap = new Map<string, {
        open: number;
        resolved: number;
        total: number;
        urgent: number;
        history: Map<string, number>
      }>();
      const sopMap = new Map<string, { completed: number; total: number }>();
      const energyMap = new Map<string, { diesel: number; electricity: number }>();

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      propIds.forEach((id: string) => {
        ticketMap.set(id, { open: 0, resolved: 0, total: 0, urgent: 0, history: new Map() });
        sopMap.set(id, { completed: 0, total: 0 });
        energyMap.set(id, { diesel: 0, electricity: 0 });
      });

      // TICKET AGGREGATION
      (ticketData as any[])?.forEach((t: any) => {
        const c = ticketMap.get(t.property_id);
        if (!c) return;
        c.total++;
        if (['open', 'blocked', 'client_raised'].includes(t.status)) c.open++;
        else if (['resolved', 'closed'].includes(t.status)) c.resolved++;
        if (t.priority === 'urgent' || t.priority === 'high') c.urgent++;
        const date = new Date(t.created_at);
        if (date >= sevenDaysAgo) {
          const dayKey = dayNames[date.getDay()];
          c.history.set(dayKey, (c.history.get(dayKey) || 0) + 1);
        }
      });

      // SOP AGGREGATION
      (sopData as any[])?.forEach((s: any) => {
        const c = sopMap.get(s.property_id);
        if (!c) return;
        c.total++;
        if (s.status === 'completed') c.completed++;
      });

      // ENERGY AGGREGATION
      (dieselData as any[])?.forEach((d: any) => {
        const c = energyMap.get(d.property_id);
        if (c) c.diesel += (d.computed_consumed_litres || 0);
      });
      (electricData as any[])?.forEach((e: any) => {
        const c = energyMap.get(e.property_id);
        if (c) c.electricity += (e.final_units || 0);
      });

      // REAL ENERGY TREND: calculate % change vs 30-day average
      const energyTrendMap = new Map<string, number>();
      propIds.forEach((id: string) => {
        const propReadings = ((historicalElectricData as any[]) ?? [])
          .filter((r: any) => r.property_id === id)
          .map((r: any) => r.final_units || 0);
        const avg = propReadings.length > 0
          ? propReadings.reduce((a: number, b: number) => a + b, 0) / propReadings.length
          : 0;
        const latest = propReadings.length > 0 ? propReadings[propReadings.length - 1] : 0;
        const trend = avg > 0 ? Math.round(((latest - avg) / avg) * 100) : 0;
        energyTrendMap.set(id, trend);
      });

      const mapped: Property[] = propData.map((p: any) => {
        const t = ticketMap.get(p.id)!;
        const s = sopMap.get(p.id)!;
        const e = energyMap.get(p.id)!;

        // Health score: 40pts tickets + 30pts SOP + 30pts energy
        const ticketScore = Math.max(0, 40 - (t.urgent * 5) - (t.open * 2));
        const sopScore = s.total > 0 ? (s.completed / s.total) * 30 : 30;
        // Energy score: penalise if diesel consumption is abnormally high (>500L)
        const energyScore = e.diesel > 500 ? 20 : 30;

        const totalScore = Math.min(100, ticketScore + sopScore + energyScore);
        const healthStatus = totalScore > 80 ? 'good' : totalScore > 40 ? 'warning' : 'critical';

        return {
          id: p.id,
          name: p.name,
          code: p.code,
          address: p.address,
          image_url: p.image_url,
          openTickets: t.open,
          resolvedTickets: t.resolved,
          totalTickets: t.total,
          healthScore: Math.round(totalScore),
          healthStatus,
          checklist: {
            completed: s.completed,
            total: Math.max(s.total, 1),
            percent: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 100,
          },
          energy: {
            diesel: Math.round(e.diesel),
            electricity: Math.round(e.electricity),
            trend: energyTrendMap.get(p.id) ?? 0,
          },
          tickets: dayNames.map(d => ({
            day: d,
            count: t.history.get(d) || 0,
          })),
          status: totalScore > 80 ? 'optimal' : totalScore > 40 ? 'warning' : 'critical',
        };
      });

      setProperties(mapped);

      // Sync activeProperty if we're on the detail screen — the array was rebuilt
      // so activeProperty points to the old stale object; look it up by id
      setActiveProperty((prev) => {
        if (!prev) return null;
        return mapped.find((p) => p.id === prev.id) || null;
      });

      {/* loaded properties */}
      setFetchError(null);

      // Fetch users
      const { data: userData } = await supabase
        .from('users')
        .select('id, full_name, email, phone')
        .limit(100);
      if (userData) {
        setUsers(userData as SystemUser[]);
        // Save to AsyncStorage cache for next app open
        saveSaCache({
          properties: mapped ?? [],
          organizations: allOrgs as Org[] ?? [],
          users: userData as SystemUser[],
        });
      }

    } catch (error) {
      {/* fetch error handled by setFetchError */}
      setFetchError('Failed to load dashboard. Pull to refresh.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, membership, saveSaCache]);

  const { refetch } = useDashboardFetch(queryKeys.admin.superAdmin(user?.id ?? 'none'), fetchAll, {
    staleTime: 1000 * 60 * 5,
    enabled: !isMembershipLoading,
  });

  const onRefresh = () => {
    setIsRefreshing(true);
    refetch();
  };

  const filteredProperties = useMemo(() => {
    let result = properties;
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      result = properties.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q)
      );
    }
    // Sort logically by code (so PROP-002 comes before PROP-0010)
    return [...result].sort((a, b) => {
      const codeA = (a.code || '').toUpperCase();
      const codeB = (b.code || '').toUpperCase();
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [properties, debouncedQuery]);

  // Access denied
  if (!hasAccess) {
    return (
      <View
        style={[
          styles.accessDenied,
          { backgroundColor: BG, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Ionicons name="shield-checkmark" size={64} color="rgba(112,143,150,0.5)" />
        <Text style={styles.accessTitle}>Access Restricted</Text>
        <Text style={styles.accessSubtitle}>
          This dashboard is reserved for authorized personnel.
        </Text>
        <Text style={styles.accessEmail}>{user?.email}</Text>
        <TouchableOpacity style={styles.accessSignOut} onPress={signOut}>
          <Text style={styles.accessSignOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Loading
  if (isLoading || isMembershipLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: BG, paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <SkeletonLoader />
      </View>
    );
  }

  // Console tab content
  const renderConsoleTab = () => {
    switch (consoleTab) {
      case 'overview':
        return (
          <OverviewTab
            stats={consoleStats}
            organizations={organizations}
            onSeeAllOrgs={() => setConsoleTab('organizations')}
          />
        );
      case 'organizations':
        return (
          <OrganizationsTab
            organizations={organizations}
            searchQuery={consoleSearchQuery}
            setSearchQuery={setConsoleSearchQuery}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#1c2135', '#0f121e', '#07090e']}
        style={StyleSheet.absoluteFillObject}
      />
      {weather && <WeatherBackground condition={weather.condition} />}

      {/* Main Content Area */}
      <View style={{ flex: 1 }}>
        {screen === 'property-detail' && activeProperty ? (
          <PropertyDetailScreen
            property={activeProperty}
            onBack={() => {
              setScreen('properties');
              setActiveProperty(null);
            }}
            onShowChat={() => setShowChat(true)}
            onShowTileDetail={(detail) => setShowTileDetail(detail)}
          />
        ) : screen === 'properties' ? (
          <Animated.ScrollView
            style={styles.mainScroll}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor="rgba(255,255,255,0.6)"
              />
            }
            contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
          >
            {/* Header */}
            <View style={[styles.mainHeader, { paddingTop: insets.top + 12 }]}>
              <View>
                <Text style={styles.mainTitle}>Properties</Text>
                <Text style={styles.mainSubtitle}>Super Admin Dashboard</Text>
              </View>
              <TouchableOpacity
                style={styles.signOutIconBtn}
                onPress={() => setShowSignOut(true)}
              >
                <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.60)" />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="rgba(255,255,255,0.45)" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search properties..."
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.45)" />
                </TouchableOpacity>
              )}
            </View>

            {/* Error banner */}
            {fetchError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color="#FF9500" />
                <Text style={styles.errorBannerText}>{fetchError}</Text>
                <TouchableOpacity onPress={onRefresh}>
                  <Text style={styles.errorBannerRetry}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Properties list */}
            <View style={styles.propertiesList}>
              {filteredProperties.map((p, i) => (
                <PropertyCard
                  key={p.id}
                  property={p}
                  index={i}
                  onPress={() => {
                    router.push(`/property/${p.id}` as any);
                  }}
                />
              ))}
              {filteredProperties.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="grid-outline" size={40} color="rgba(255,255,255,0.30)" />
                  <Text style={styles.emptyText}>No properties found</Text>
                </View>
              )}
            </View>
          </Animated.ScrollView>
        ) : screen === 'console' ? (
          <View style={{ flex: 1 }}>
            <View style={[styles.consoleTabs, { marginTop: insets.top + 12 }]}>
              {(['overview', 'organizations'] as Tab[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.consoleTab, consoleTab === tab && styles.consoleTabActive]}
                  onPress={() => setConsoleTab(tab)}
                >
                  <Text
                    style={[
                      styles.consoleTabText,
                      consoleTab === tab && styles.consoleTabTextActive,
                    ]}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {renderConsoleTab()}
          </View>
        ) : screen === 'analytics' ? (
          <AnalyticsScreen />
        ) : null}
      </View>



      {/* Modals */}
      <CassandraSessionModal visible={showChat} onClose={() => setShowChat(false)} orgId={orgId} propertyId={membership?.properties?.[0]?.id} initialMode="voice" />
      <SignOutModal
        visible={showSignOut}
        onClose={() => setShowSignOut(false)}
        onSignOut={signOut}
      />
      <DetailModal
        detail={showTileDetail}
        onClose={() => setShowTileDetail(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingContainer: { flex: 1 },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  accessTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 20,
      },
  accessSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 8,
    textAlign: 'center',
      },
  accessEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.30)',
    marginTop: 12,
      },
  accessSignOut: {
    marginTop: 32,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  accessSignOutText: { color: '#FFFFFF', fontWeight: '600' },
  consoleTabs: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: 6,
    zIndex: 10,
  },
  consoleTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  consoleTabActive: { backgroundColor: 'rgba(112,143,150,0.25)' },
  consoleTabText: {
        fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  consoleTabTextActive: { color: '#708F96' },
  mainScroll: { flex: 1, zIndex: 10 },
  mainHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.sm,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -1.2,
        lineHeight: 36,
  },
  mainSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
      },
  signOutIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_SURFACES.cardBg,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 11,
    borderRadius: 14,
    borderColor: CARD_SURFACES.cardBorder,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
        paddingVertical: 0,
  },
  propertiesList: { paddingHorizontal: SPACING.xl, gap: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.md },
  emptyState: { alignItems: 'center', paddingVertical: 80 },
  emptyText: {
        fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,149,0,0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.30)',
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
        fontSize: 13,
    color: '#FF9500',
  },
  errorBannerRetry: {
        fontSize: 13,
    fontWeight: '700',
    color: '#FF9500',
    textDecorationLine: 'underline',
  },
});
