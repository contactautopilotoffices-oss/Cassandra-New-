import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
  ShoppingCart,
  ArrowLeft,
  Clock,
  CheckCircle,
  AlertTriangle,
  Package,
  Search,
  X,
  RefreshCw,
} from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useTheme } from '@/context';
import {
  listPendingApprovals,
  listMaterialRequests,
  getProcurementCatalogItems,
  type MaterialRequest,
} from '@/utils/api/mobileApi';
import MobileRequestList from '@/components/procurement/MobileRequestList';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: ['#080E1A', '#0D1728', '#111F35'] as const,
  accent: '#007AFF',
  glass: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.09)',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.55)',
  textTertiary: 'rgba(255,255,255,0.30)',
};

// ─── Tabs ──────────────────────────────────────────────────────────────────────
type TabKey = 'approvals' | 'all' | 'catalog';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
  requireApprove?: boolean;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({
  label,
  value,
  color,
  icon,
  delay = 0,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: React.ReactNode;
  delay?: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(450)} style={{ flex: 1 }}>
      <View style={[sKPI.card, { borderColor: `${color}22` }]}>
        <LinearGradient
          colors={[`${color}18`, 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[sKPI.iconWrap, { backgroundColor: `${color}18` }]}>{icon}</View>
        <Text style={sKPI.value}>{value}</Text>
        <Text style={sKPI.label}>{label}</Text>
      </View>
    </Animated.View>
  );
}

const sKPI = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'flex-start',
    gap: 6,
  },
  iconWrap: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  value: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  label: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function ProcurementScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, membership } = useAuth();
  const { capabilities } = useCapabilities(propertyId);

  // ── Permission flags ─────────────────────────────────────────────────────────
  const canApprove = !!(capabilities.procurement?.includes('approve'));
  const canView    = !!(capabilities.procurement?.includes('view') || canApprove);

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  const tabs: TabDef[] = useMemo(() => {
    const list: TabDef[] = [];
    if (canApprove) {
      list.push({
        key: 'approvals',
        label: 'Approvals',
        icon: <AlertTriangle size={14} color="#F59E0B" strokeWidth={2} />,
        requireApprove: true,
      });
    }
    list.push(
      { key: 'all',     label: 'All Orders',  icon: <Package size={14} color={T.textSecondary} strokeWidth={1.8} /> },
      { key: 'catalog', label: 'Catalog',     icon: <ShoppingCart size={14} color={T.textSecondary} strokeWidth={1.8} /> }
    );
    return list;
  }, [canApprove]);

  const [activeTab, setActiveTab] = useState<TabKey>(canApprove ? 'approvals' : 'all');

  // ── Data ─────────────────────────────────────────────────────────────────────
  const [pendingRequests, setPendingRequests] = useState<MaterialRequest[]>([]);
  const [allRequests, setAllRequests]         = useState<MaterialRequest[]>([]);
  const [catalogItems, setCatalogItems]       = useState<any[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [searchQuery, setSearchQuery]         = useState('');

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const pending  = allRequests.filter(r => ['pending', 'pending_approval', 'pending_quotation'].includes(r.status)).length;
    const approved = allRequests.filter(r => r.status === 'approved').length;
    const total    = allRequests.length;
    return { pending, approved, total };
  }, [allRequests]);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchApprovals = useCallback(async () => {
    if (!user?.id || !canApprove) return;
    const orgId = membership?.org_id ?? undefined;
    try {
      const data = await listPendingApprovals(user.id, propertyId, orgId);
      setPendingRequests(
        data.filter(r => ['pending_approval', 'pending', 'pending_quotation'].includes(r.status))
      );
    } catch (err) {
      console.error('[Procurement] approvals fetch:', err);
    }
  }, [user?.id, propertyId, membership?.org_id, canApprove]);

  const fetchAllRequests = useCallback(async () => {
    if (!propertyId) return;
    try {
      const data = await listMaterialRequests({
        propertyId,
        organizationId: membership?.org_id ?? undefined,
      });
      setAllRequests(data);
    } catch (err) {
      console.error('[Procurement] all requests fetch:', err);
    }
  }, [propertyId, membership?.org_id]);

  const fetchCatalog = useCallback(async () => {
    if (!propertyId) return;
    try {
      const data = await getProcurementCatalogItems({
        propertyId,
        organizationId: membership?.org_id ?? undefined,
      });
      setCatalogItems(data);
    } catch (err) {
      console.error('[Procurement] catalog fetch:', err);
    }
  }, [propertyId, membership?.org_id]);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    await Promise.all([fetchApprovals(), fetchAllRequests(), fetchCatalog()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchApprovals, fetchAllRequests, fetchCatalog]);

  const { refetch } = useDashboardFetch(queryKeys.property.procurement(propertyId), fetchAll, {
    staleTime: 1000 * 60 * 5,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // ── Handle request updated (remove from pending) ──────────────────────────
  const handleRequestUpdated = useCallback((id: string) => {
    setPendingRequests(prev => prev.filter(r => r.id !== id));
    setAllRequests(prev =>
      prev.map(r => r.id === id ? { ...r, status: 'processing' } : r)
    );
  }, []);

  // ── Filtered data ─────────────────────────────────────────────────────────
  const filteredAll = useMemo(() => {
    if (!searchQuery.trim()) return allRequests;
    const q = searchQuery.toLowerCase();
    return allRequests.filter(r =>
      r.ticket?.ticket_number?.toLowerCase().includes(q) ||
      r.ticket?.title?.toLowerCase().includes(q) ||
      r.requester?.full_name?.toLowerCase().includes(q) ||
      r.status?.toLowerCase().includes(q)
    );
  }, [allRequests, searchQuery]);

  const filteredCatalog = useMemo(() => {
    if (!searchQuery.trim()) return catalogItems;
    const q = searchQuery.toLowerCase();
    return catalogItems.filter((c: any) =>
      c.name?.toLowerCase().includes(q) ||
      c.category?.toLowerCase().includes(q) ||
      c.item_code?.toLowerCase().includes(q)
    );
  }, [catalogItems, searchQuery]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (!canView) {
    return (
      <View style={[sMain.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={[...T.bg]} style={StyleSheet.absoluteFillObject} />
        <View style={sMain.noAccess}>
          <ShoppingCart size={52} color="rgba(255,255,255,0.15)" />
          <Text style={sMain.noAccessTitle}>No Access</Text>
          <Text style={sMain.noAccessSub}>You don't have access to the Procurement module.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[sMain.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={[...T.bg]} style={StyleSheet.absoluteFillObject} />

      {/* ── Header ── */}
      <Animated.View entering={FadeInDown.duration(400)} style={sMain.header}>
        <TouchableOpacity style={sMain.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={sMain.headerCenter}>
          <Text style={sMain.headerTitle}>Procurement</Text>
          <Text style={sMain.headerSub}>Material Requests & Orders</Text>
        </View>
        <TouchableOpacity style={sMain.backBtn} onPress={handleRefresh} activeOpacity={0.75}>
          <RefreshCw size={16} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </Animated.View>

      {/* ── KPI Row ── */}
      {!loading && (
        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={sMain.kpiRow}>
          <KPICard
            label="Pending"
            value={stats.pending}
            color="#F59E0B"
            icon={<Clock size={16} color="#F59E0B" />}
            delay={0}
          />
          <KPICard
            label="Approved"
            value={stats.approved}
            color="#10B981"
            icon={<CheckCircle size={16} color="#10B981" />}
            delay={60}
          />
          <KPICard
            label="Total"
            value={stats.total}
            color="#007AFF"
            icon={<Package size={16} color="#007AFF" />}
            delay={120}
          />
        </Animated.View>
      )}

      {/* ── Tabs ── */}
      <Animated.View entering={FadeInDown.delay(140).duration(400)} style={sMain.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sMain.tabScroll} showsVerticalScrollIndicator={false}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tab.key === 'approvals' ? pendingRequests.length : undefined;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[sMain.tab, isActive && sMain.tabActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.75}
              >
                {tab.icon}
                <Text style={[sMain.tabLabel, isActive && sMain.tabLabelActive]}>
                  {tab.label}
                </Text>
                {count !== undefined && count > 0 && (
                  <View style={sMain.tabBadge}>
                    <Text style={sMain.tabBadgeText}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>

      {/* ── Search ── */}
      {(activeTab === 'all' || activeTab === 'catalog') && (
        <Animated.View entering={FadeInDown.delay(180).duration(400)} style={sMain.searchRow}>
          <View style={sMain.searchInput}>
            <Search size={15} color="rgba(255,255,255,0.35)" />
            <TextInput
              style={sMain.searchText}
              placeholder={activeTab === 'catalog' ? 'Search catalog...' : 'Search orders...'}
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={14} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      )}

      {/* ── Content ── */}
      {loading && !refreshing ? (
        <View style={sMain.loadingWrap}>
          <ActivityIndicator size="large" color={T.accent} />
          <Text style={sMain.loadingText}>Loading procurement data…</Text>
        </View>
      ) : (
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={{ flex: 1 }}>
          {/* APPROVALS TAB */}
          {activeTab === 'approvals' && (
            <ScrollView
              contentContainerStyle={sMain.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.accent} />
              }
            >
              {pendingRequests.length === 0 ? (
                <View style={sMain.emptyWrap}>
                  <CheckCircle size={52} color="rgba(16,185,129,0.3)" />
                  <Text style={sMain.emptyTitle}>All caught up!</Text>
                  <Text style={sMain.emptySub}>No pending approvals at the moment.</Text>
                </View>
              ) : (
                <MobileRequestList
                  requests={pendingRequests}
                  canApprove={canApprove}
                  canEscalate
                  onRequestUpdated={handleRequestUpdated}
                  emptyMessage="No pending approvals."
                />
              )}
            </ScrollView>
          )}

          {/* ALL ORDERS TAB */}
          {activeTab === 'all' && (
            <ScrollView
              contentContainerStyle={sMain.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.accent} />
              }
            >
              <MobileRequestList
                requests={filteredAll}
                canApprove={canApprove}
                canEscalate
                onRequestUpdated={handleRequestUpdated}
                emptyMessage={searchQuery ? 'No results found.' : 'No orders yet.'}
              />
            </ScrollView>
          )}

          {/* CATALOG TAB */}
          {activeTab === 'catalog' && (
            <ScrollView
              contentContainerStyle={sMain.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.accent} />
              }
            >
              {filteredCatalog.length === 0 ? (
                <View style={sMain.emptyWrap}>
                  <Package size={52} color="rgba(255,255,255,0.10)" />
                  <Text style={sMain.emptyTitle}>No items found</Text>
                  <Text style={sMain.emptySub}>
                    {searchQuery ? 'Try a different search.' : 'No catalog items linked to this property.'}
                  </Text>
                </View>
              ) : (
                filteredCatalog.map((item: any, i: number) => (
                  <Animated.View
                    key={item.id}
                    entering={FadeInUp.delay(i * 35).duration(400)}
                    style={sCatalog.card}
                  >
                    <LinearGradient
                      colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <View style={sCatalog.row}>
                      <View style={sCatalog.iconWrap}>
                        <Package size={16} color="#007AFF" strokeWidth={1.8} />
                      </View>
                      <View style={sCatalog.mid}>
                        <Text style={sCatalog.name} numberOfLines={1}>{item.name}</Text>
                        <Text style={sCatalog.meta}>
                          {item.item_code ? `${item.item_code} · ` : ''}{item.category || 'Uncategorized'}
                        </Text>
                      </View>
                      <View style={sCatalog.right}>
                        {item.unit_price > 0 && (
                          <Text style={sCatalog.price}>
                            ₹{item.unit_price.toLocaleString('en-IN')}
                            <Text style={sCatalog.unit}>/{item.unit || 'unit'}</Text>
                          </Text>
                        )}
                        <View style={[
                          sCatalog.stockBadge,
                          { backgroundColor: item.quantity <= 0 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)' }
                        ]}>
                          <Text style={[
                            sCatalog.stockText,
                            { color: item.quantity <= 0 ? '#EF4444' : '#10B981' }
                          ]}>
                            {item.quantity <= 0 ? 'Out of stock' : `${item.quantity} ${item.unit || 'units'}`}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Animated.View>
                ))
              )}
            </ScrollView>
          )}
        </Animated.View>
      )}
    </View>
  );
}

// ─── Catalog Item Styles ───────────────────────────────────────────────────────
const sCatalog = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.glassBorder,
    overflow: 'hidden',
    marginBottom: 8,
    padding: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(0,122,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { flex: 1 },
  name: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' },
  meta: { color: 'rgba(255,255,255,0.40)', fontSize: 11, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  price: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  unit: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '400' },
  stockBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  stockText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
});

// ─── Main Styles ───────────────────────────────────────────────────────────────
const sMain = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: T.glass,
    borderWidth: 1,
    borderColor: T.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1 },
  headerTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  headerSub: { color: 'rgba(255,255,255,0.40)', fontSize: 12, marginTop: 1 },

  // KPI
  kpiRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 16 },

  // Tabs
  tabBar: { marginBottom: 12 },
  tabScroll: { paddingHorizontal: 16, gap: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: T.glass,
    borderWidth: 1,
    borderColor: T.glassBorder,
  },
  tabActive: {
    backgroundColor: 'rgba(0,122,255,0.15)',
    borderColor: 'rgba(0,122,255,0.35)',
  },
  tabLabel: { color: 'rgba(255,255,255,0.50)', fontSize: 13, fontWeight: '500' },
  tabLabelActive: { color: '#007AFF', fontWeight: '700' },
  tabBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },

  // Search
  searchRow: { paddingHorizontal: 16, marginBottom: 12 },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.glass,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.glassBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchText: { flex: 1, color: '#FFFFFF', fontSize: 14 },

  // Content
  listContent: { paddingHorizontal: 16, paddingBottom: 120 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  emptySub: { color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center' },

  // No access
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40 },
  noAccessTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  noAccessSub: { color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center' },
});
