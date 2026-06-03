'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Alert,
  Dimensions,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { createClient } from '@/utils/supabase/client';
import { serverApi } from '@/lib/serverApi';
import { useAuth } from '@/hooks/useAuth';
import SafeBlurView from '@/components/ui/SafeBlurView';
import SignOutModal from '@/components/ui/SignOutModal';
import NotificationModal from '@/components/notifications/NotificationModal';
import PermissionOnboarding, { hasRequestedPermissions } from '@/components/onboarding/PermissionOnboarding';
import ChecklistProgressCard from '@/components/dashboard/ChecklistProgressCard';
import PPMProgressCard from '@/components/dashboard/PPMProgressCard';
import PPMActivityTile from '@/components/dashboard/PPMActivityTile';
import { ppmService } from '@/services/ppmService';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import { useWeather } from '@/hooks/useWeather';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';

const { width: SW } = Dimensions.get('window');

// ─── Design tokens (matches lovable style) ─────────────────────────────────────
const BG = ['#080E1A', '#0D1728', '#111F35'] as const;
const SSM_ACCENT = '#8B5CF6'; // Purple — brand for soft services
const SSM_TEAL   = '#06B6D4';
const SSM_GREEN  = '#10B981';
const SSM_AMBER  = '#F59E0B';

// ─── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'stock' | 'checklist' | 'tickets' | 'profile';

interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  assigned_to?: string | null;
  assignee?: { full_name: string } | null;
}

interface StockItem {
  id: string;
  name: string;
  quantity: number;
  min_threshold: number | null;
  category: string | null;
  unit: string | null;
}

interface SopTemplate {
  id: string;
  name: string;
  is_active: boolean;
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function KPICard({ value, label, color, icon, delay = 0 }: {
  value: string | number; label: string; color: string;
  icon: keyof typeof Ionicons.glyphMap; delay?: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(450)} style={[sKPI.card, { borderColor: `${color}22` }]}>
      <LinearGradient colors={[`${color}1A`, 'transparent']} style={StyleSheet.absoluteFillObject} />
      <View style={[sKPI.iconWrap, { backgroundColor: `${color}1A` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={sKPI.value}>{value}</Text>
      <Text style={sKPI.label}>{label}</Text>
    </Animated.View>
  );
}

const sKPI = StyleSheet.create({
  card: { flex: 1, borderRadius: 16, padding: 14, borderWidth: 1, overflow: 'hidden', gap: 6 },
  iconWrap: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  value: { color: '#FFF', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  label: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
});

function StockRow({ item, index }: { item: StockItem; index: number }) {
  const isOut  = item.quantity <= 0;
  const isLow  = !isOut && item.quantity <= (item.min_threshold ?? 10);
  const color  = isOut ? '#EF4444' : isLow ? '#F59E0B' : '#10B981';
  const status = isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock';

  return (
    <Animated.View entering={FadeInUp.delay(index * 40).duration(400)} style={sStock.row}>
      <LinearGradient colors={['rgba(255,255,255,0.05)', 'transparent']} style={StyleSheet.absoluteFillObject} />
      <View style={[sStock.dot, { backgroundColor: color }]} />
      <View style={sStock.mid}>
        <Text style={sStock.name} numberOfLines={1}>{item.name}</Text>
        <Text style={sStock.meta}>{item.category ?? 'Uncategorized'}</Text>
      </View>
      <View style={sStock.right}>
        <Text style={sStock.qty}>{item.quantity}{item.unit ? ` ${item.unit}` : ''}</Text>
        <View style={[sStock.badge, { backgroundColor: `${color}18` }]}>
          <Text style={[sStock.badgeText, { color }]}>{status}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const sStock = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 12, gap: 10, marginBottom: 8, overflow: 'hidden' },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  mid: { flex: 1 },
  name: { color: '#FFF', fontSize: 13, fontWeight: '500' },
  meta: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  qty: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
});

function TicketRow({ ticket, index, onPress }: { ticket: Ticket; index: number; onPress: () => void }) {
  const pc: Record<string, string> = { critical: '#EF4444', high: '#F59E0B', medium: '#3B82F6', low: '#10B981' };
  const color = pc[ticket.priority?.toLowerCase()] ?? '#6B7280';

  return (
    <Animated.View entering={FadeInUp.delay(index * 40).duration(400)}>
      <TouchableOpacity style={sTkt.row} onPress={onPress} activeOpacity={0.82}>
        <LinearGradient colors={['rgba(255,255,255,0.05)', 'transparent']} style={StyleSheet.absoluteFillObject} />
        <View style={[sTkt.prio, { backgroundColor: color }]} />
        <View style={sTkt.mid}>
          <Text style={sTkt.num}>{ticket.ticket_number}</Text>
          <Text style={sTkt.title} numberOfLines={1}>{ticket.title}</Text>
        </View>
        <View style={sTkt.right}>
          <View style={[sTkt.statusBadge, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
            <Text style={sTkt.statusText}>{ticket.status.replace(/_/g, ' ').toUpperCase()}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const sTkt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 12, gap: 10, marginBottom: 8, overflow: 'hidden' },
  prio: { width: 4, height: '100%', borderRadius: 2, minHeight: 36, flexShrink: 0 },
  mid: { flex: 1 },
  num: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  title: { color: '#FFF', fontSize: 13, fontWeight: '500', marginTop: 2 },
  right: { alignItems: 'flex-end' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  statusText: { color: SSM_ACCENT, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
});

// ─── Tab bar button ────────────────────────────────────────────────────────────
function TabBtn({ icon, label, active, onPress, badge }: {
  icon: keyof typeof Ionicons.glyphMap; label: string;
  active: boolean; onPress: () => void; badge?: number;
}) {
  return (
    <TouchableOpacity style={sTab.btn} onPress={onPress} activeOpacity={0.75}>
      <View style={{ position: 'relative' }}>
        <Ionicons name={icon} size={22} color={active ? SSM_ACCENT : 'rgba(255,255,255,0.40)'} />
        {badge !== undefined && badge > 0 && (
          <View style={sTab.badge}><Text style={sTab.badgeText}>{badge > 9 ? '9+' : badge}</Text></View>
        )}
      </View>
      <Text style={[sTab.label, active && sTab.labelActive]}>{label}</Text>
      {active && <View style={sTab.indicator} />}
    </TouchableOpacity>
  );
}

const sTab = StyleSheet.create({
  btn: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  label: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: '600' },
  labelActive: { color: SSM_ACCENT },
  indicator: { position: 'absolute', bottom: 0, height: 2, width: 24, backgroundColor: SSM_ACCENT, borderRadius: 1 },
  badge: { position: 'absolute', top: -4, right: -6, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
});

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function LovableSoftServiceManagerDashboard({ propertyId }: { propertyId: string }) {
  const insets = useSafeAreaInsets();
  const { user, signOut, membership } = useAuth();
  const { weather } = useWeather();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // ── State ──
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [propertyName, setPropertyName] = useState('');
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isTogglingShift, setIsTogglingShift] = useState(false);

  // Data
  const [tickets, setTickets]     = useState<Ticket[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [sopTotal, setSopTotal]   = useState(0);
  const [sopDone, setSopDone]     = useState(0);

  // PPM stats
  const [ppmTotal, setPpmTotal]   = useState(0);
  const [ppmDone, setPpmDone]     = useState(0);
  const [ppmPending, setPpmPending] = useState(0);
  const [ppmOverdue, setPpmOverdue] = useState(0);
  const [ppmPostponed, setPpmPostponed] = useState(0);

  // Modals
  const [showSignOut, setShowSignOut]           = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPermOnboard, setShowPermOnboard]   = useState(false);

  // ── Computed ──
  const fullName = user?.user_metadata?.full_name ?? 'Manager';
  const initials = fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  const orgId    = membership?.org_id ?? '';

  const stockStats = useMemo(() => {
    const total    = stockItems.length;
    const lowStock = stockItems.filter(s => s.quantity > 0 && s.quantity <= (s.min_threshold ?? 10)).length;
    const outStock = stockItems.filter(s => s.quantity <= 0).length;
    return { total, lowStock, outStock };
  }, [stockItems]);

  const ticketStats = useMemo(() => {
    const open   = tickets.filter(t => ['open', 'in_progress', 'assigned', 'client_raised'].includes(t.status)).length;
    const mine   = tickets.filter(t => t.assigned_to === user?.id).length;
    return { total: tickets.length, open, mine };
  }, [tickets, user?.id]);

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    try {
      // Property name
      const { data: prop } = await serverApi.query({ table: 'properties', action: 'select', select: 'name', filters: [{ op: 'eq', column: 'id', value: propertyId }], maybeSingle: true });
      if (prop) setPropertyName((prop as any).name ?? '');

      // Tickets (view + approve + assign)
      const { data: tData } = await serverApi.query({
        table: 'tickets',
        action: 'select',
        select: 'id, ticket_number, title, status, priority, created_at, assigned_to, assignee:users!assigned_to(full_name)',
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
        orders: [{ column: 'created_at', ascending: false }],
        limit: 50,
      });
      if (tData) setTickets(tData as Ticket[]);

      // Stock items
      const { data: sData } = await serverApi.query({
        table: 'stock_items',
        action: 'select',
        select: 'id, name, quantity, min_threshold, category, unit',
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
        orders: [{ column: 'quantity', ascending: true }],
      });
      if (sData) setStockItems(sData as StockItem[]);

      // SOP completions
      const { data: sopTemplates } = await serverApi.query({
        table: 'sop_templates',
        action: 'select',
        select: 'id',
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }, { op: 'eq', column: 'is_active', value: true }],
      });
      if (sopTemplates) setSopTotal((sopTemplates as any[]).length);

      const todayStr = new Date().toISOString().split('T')[0];
      const { data: sopCompletions } = await serverApi.query({
        table: 'sop_completions',
        action: 'select',
        select: 'status',
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }, { op: 'eq', column: 'completion_date', value: todayStr }],
      });
      if (sopCompletions) {
        setSopDone((sopCompletions as any[]).filter((s: any) => s.status === 'completed').length);
      }

      // PPM stats
      try {
        const ppmRes = await ppmService.fetchStats(propertyId);
        if (ppmRes.success && ppmRes.data) {
          setPpmTotal(ppmRes.data.total ?? 0);
          setPpmDone(ppmRes.data.done ?? 0);
          setPpmPending(ppmRes.data.pending ?? 0);
          setPpmOverdue(ppmRes.data.overdue ?? 0);
          setPpmPostponed(ppmRes.data.postponed ?? 0);
        }
      } catch (_e) { /* ignore */ }

      // Shift status
      const { data: shiftData } = await serverApi.query({
        table: 'resolver_stats',
        action: 'select',
        select: 'is_checked_in',
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }, { op: 'eq', column: 'user_id', value: user?.id }],
        maybeSingle: true,
      });
      if (shiftData) setIsCheckedIn(!!(shiftData as any).is_checked_in);
    } catch (err) {
      console.warn('[SSMDashboard] fetchData error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [propertyId, user?.id]);

  const { refetch } = useDashboardFetch(queryKeys.property.softService(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    hasRequestedPermissions().then(requested => {
      if (!requested) setShowPermOnboard(true);
    });
  }, []);

  const onRefresh = async () => { setIsRefreshing(true); await refetch(); };

  const toggleShift = async () => {
    if (!user?.id || isTogglingShift) return;
    setIsTogglingShift(true);
    const newStatus = !isCheckedIn;
    try {
      await serverApi.query({
        table: 'resolver_stats',
        action: 'upsert',
        values: { property_id: propertyId, user_id: user.id, is_checked_in: newStatus },
        mutationOptions: { onConflict: 'user_id,property_id' },
      });
      setIsCheckedIn(newStatus);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to update shift');
    } finally {
      setIsTogglingShift(false);
    }
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────────

  const renderOverview = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={SSM_ACCENT} />}
    >
      {/* Hero greeting */}
      <Animated.View entering={FadeInDown.duration(400)} style={sOv.hero}>
        <SafeBlurView intensity={25} tint="dark" style={StyleSheet.absoluteFillObject} />
        <LinearGradient
          colors={[`${SSM_ACCENT}22`, 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={sOv.heroLeft}>
          <View style={sOv.avatar}>
            <LinearGradient colors={[SSM_ACCENT, '#5B3FD6']} style={StyleSheet.absoluteFillObject} />
            <Text style={sOv.avatarText}>{initials}</Text>
          </View>
          <View>
            <Text style={sOv.greeting}>Hey, {fullName.split(' ')[0]} 👋</Text>
            <Text style={sOv.sub}>{propertyName || 'Soft Service Manager'}</Text>
          </View>
        </View>
        {/* Duty toggle */}
        <TouchableOpacity
          style={[sOv.dutyBtn, { borderColor: isCheckedIn ? `${SSM_GREEN}55` : 'rgba(239,68,68,0.40)' }]}
          onPress={toggleShift}
          disabled={isTogglingShift}
        >
          {isTogglingShift
            ? <ActivityIndicator size="small" color={isCheckedIn ? SSM_GREEN : '#EF4444'} />
            : <>
                <View style={[sOv.dutyDot, { backgroundColor: isCheckedIn ? SSM_GREEN : '#EF4444' }]} />
                <Text style={[sOv.dutyText, { color: isCheckedIn ? SSM_GREEN : '#EF4444' }]}>
                  {isCheckedIn ? 'ON DUTY' : 'OFF DUTY'}
                </Text>
              </>
          }
        </TouchableOpacity>
      </Animated.View>

      {/* KPI Row */}
      <Animated.View entering={FadeInDown.delay(80).duration(400)} style={sOv.kpiRow}>
        <KPICard value={ticketStats.open}   label="Open Tickets" color="#3B82F6" icon="ticket-outline" delay={0} />
        <KPICard value={stockStats.total}   label="Stock Items"  color={SSM_ACCENT}  icon="cube-outline"   delay={60} />
        <KPICard value={`${sopTotal > 0 ? Math.round(sopDone / sopTotal * 100) : 100}%`} label="SOP Done" color={SSM_GREEN} icon="checkbox-outline" delay={120} />
      </Animated.View>

      {/* Stock alerts */}
      {(stockStats.lowStock > 0 || stockStats.outStock > 0) && (
        <Animated.View entering={FadeInDown.delay(160).duration(400)} style={sOv.alertCard}>
          <SafeBlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={sOv.alertRow}>
            <Ionicons name="warning-outline" size={16} color={SSM_AMBER} />
            <Text style={sOv.alertTitle}>Stock Alerts</Text>
          </View>
          <View style={sOv.alertChips}>
            {stockStats.lowStock > 0 && (
              <View style={[sOv.chip, { backgroundColor: `${SSM_AMBER}18` }]}>
                <Ionicons name="trending-down-outline" size={12} color={SSM_AMBER} />
                <Text style={[sOv.chipText, { color: SSM_AMBER }]}>{stockStats.lowStock} Low</Text>
              </View>
            )}
            {stockStats.outStock > 0 && (
              <View style={[sOv.chip, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                <Ionicons name="close-circle-outline" size={12} color="#EF4444" />
                <Text style={[sOv.chipText, { color: '#EF4444' }]}>{stockStats.outStock} Out</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={sOv.alertCta} onPress={() => setActiveTab('stock')}>
            <Text style={sOv.alertCtaText}>View Stock →</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* SOP / Checklist progress */}
      <ChecklistProgressCard completed={sopDone} total={sopTotal} delay={200} onPress={() => setActiveTab('checklist')} />

      {/* PPM progress */}
      <PPMProgressCard
        propertyId={propertyId}
        organizationId={orgId}
        done={ppmDone}
        total={ppmTotal}
        pending={ppmPending}
        overdue={ppmOverdue}
        postponed={ppmPostponed}
        delay={240}
        onPress={() => router.push(`/property/${propertyId}/ppm`)}
      />

      {/* PPM activity */}
      <PPMActivityTile propertyId={propertyId} organizationId={orgId} delay={320} />

      {/* Quick actions */}
      <Animated.View entering={FadeInDown.delay(300).duration(400)}>
        <Text style={sOv.secTitle}>Quick Actions</Text>
        <View style={sOv.actionsRow}>
          {[
            { label: 'Stock',      icon: 'cube-outline' as const,      tab: 'stock'     as Tab, color: SSM_ACCENT },
            { label: 'Checklists', icon: 'checkbox-outline' as const,  tab: 'checklist' as Tab, color: SSM_GREEN },
            { label: 'Tickets',    icon: 'ticket-outline' as const,     tab: 'tickets'   as Tab, color: '#3B82F6' },
            { label: 'QR Scan',   icon: 'qr-code-outline' as const,    tab: null,                color: SSM_TEAL,
              nav: () => router.push(`/property/${propertyId}/stock/scan` as any) },
          ].map(({ label, icon, tab, color, nav }) => (
            <TouchableOpacity
              key={label}
              style={[sOv.actionBtn, { borderColor: `${color}33` }]}
              onPress={() => tab ? setActiveTab(tab) : nav?.()}
              activeOpacity={0.8}
            >
              <LinearGradient colors={[`${color}1A`, 'transparent']} style={StyleSheet.absoluteFillObject} />
              <Ionicons name={icon} size={22} color={color} />
              <Text style={[sOv.actionLabel, { color }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </ScrollView>
  );

  const renderStock = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={SSM_ACCENT} />}
    >
      {/* Header row */}
      <Animated.View entering={FadeInDown.duration(400)} style={sSection.header}>
        <Text style={sSection.title}>Stock / Inventory</Text>
        <TouchableOpacity
          style={sSection.scanBtn}
          onPress={() => router.push(`/property/${propertyId}/stock/scan` as any)}
        >
          <Ionicons name="qr-code-outline" size={16} color={SSM_ACCENT} />
          <Text style={sSection.scanText}>Scan</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Summary chips */}
      <Animated.View entering={FadeInDown.delay(60).duration(400)} style={sSection.chips}>
        <View style={sSection.chip}><Text style={sSection.chipNum}>{stockStats.total}</Text><Text style={sSection.chipLabel}>Total</Text></View>
        <View style={[sSection.chip, { borderColor: `${SSM_AMBER}33` }]}><Text style={[sSection.chipNum, { color: SSM_AMBER }]}>{stockStats.lowStock}</Text><Text style={sSection.chipLabel}>Low</Text></View>
        <View style={[sSection.chip, { borderColor: 'rgba(239,68,68,0.3)' }]}><Text style={[sSection.chipNum, { color: '#EF4444' }]}>{stockStats.outStock}</Text><Text style={sSection.chipLabel}>Out</Text></View>
      </Animated.View>

      {stockItems.length === 0
        ? <Empty icon="cube-outline" title="No stock items" sub="No items linked to this property." />
        : stockItems.map((item, i) => <StockRow key={item.id} item={item} index={i} />)
      }

      {/* Full stock screen CTA */}
      <TouchableOpacity style={sSection.fullCta} onPress={() => router.push(`/property/${propertyId}/stock` as any)}>
        <LinearGradient colors={[`${SSM_ACCENT}22`, 'transparent']} style={StyleSheet.absoluteFillObject} />
        <Ionicons name="open-outline" size={16} color={SSM_ACCENT} />
        <Text style={sSection.fullCtaText}>Open Full Stock Manager</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderChecklist = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={SSM_GREEN} />}
    >
      <Animated.View entering={FadeInDown.duration(400)} style={sSection.header}>
        <Text style={sSection.title}>Checklists & SOP</Text>
      </Animated.View>

      {/* Progress visual */}
      <Animated.View entering={FadeInDown.delay(80).duration(400)} style={sCl.progressCard}>
        <SafeBlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
        <LinearGradient colors={[`${SSM_GREEN}18`, 'transparent']} style={StyleSheet.absoluteFillObject} />
        <View style={sCl.progressRow}>
          <View>
            <Text style={sCl.progressValue}>{sopDone}<Text style={sCl.progressSub}>/{sopTotal}</Text></Text>
            <Text style={sCl.progressLabel}>Completed Today</Text>
          </View>
          <View style={sCl.progressDonut}>
            <Text style={[sCl.progressPct, { color: SSM_GREEN }]}>
              {sopTotal > 0 ? Math.round(sopDone / sopTotal * 100) : 100}%
            </Text>
            <Text style={sCl.progressPctLabel}>DONE</Text>
          </View>
        </View>
        {/* Bar */}
        <View style={sCl.barBg}>
          <View style={[sCl.barFill, { width: `${sopTotal > 0 ? (sopDone / sopTotal) * 100 : 100}%` as any }]} />
        </View>
      </Animated.View>

      {/* CTA to full checklist screen */}
      <TouchableOpacity style={sSection.fullCta} onPress={() => router.push(`/property/${propertyId}/checklist` as any)}>
        <LinearGradient colors={[`${SSM_GREEN}22`, 'transparent']} style={StyleSheet.absoluteFillObject} />
        <Ionicons name="open-outline" size={16} color={SSM_GREEN} />
        <Text style={[sSection.fullCtaText, { color: SSM_GREEN }]}>Open Checklist Manager</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderTickets = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
    >
      <Animated.View entering={FadeInDown.duration(400)} style={sSection.header}>
        <Text style={sSection.title}>Tickets</Text>
        <View style={sSection.chips}>
          <View style={sSection.chip}><Text style={sSection.chipNum}>{ticketStats.open}</Text><Text style={sSection.chipLabel}>Open</Text></View>
          <View style={sSection.chip}><Text style={sSection.chipNum}>{ticketStats.mine}</Text><Text style={sSection.chipLabel}>Mine</Text></View>
        </View>
      </Animated.View>

      {tickets.length === 0
        ? <Empty icon="ticket-outline" title="No tickets" sub="No active tickets for this property." />
        : tickets.slice(0, 30).map((t, i) => (
            <TicketRow
              key={t.id}
              ticket={t}
              index={i}
              onPress={() => router.push(`/property/${propertyId}/tickets/${t.id}` as any)}
            />
          ))
      }

      <TouchableOpacity style={sSection.fullCta} onPress={() => router.push(`/property/${propertyId}/tickets` as any)}>
        <LinearGradient colors={['rgba(59,130,246,0.15)', 'transparent']} style={StyleSheet.absoluteFillObject} />
        <Ionicons name="open-outline" size={16} color="#3B82F6" />
        <Text style={[sSection.fullCtaText, { color: '#3B82F6' }]}>Open Full Ticket View</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderProfile = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
    >
      {/* Profile card */}
      <Animated.View entering={FadeInDown.duration(400)} style={sPro.card}>
        <SafeBlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
        <LinearGradient colors={[`${SSM_ACCENT}22`, 'transparent']} style={StyleSheet.absoluteFillObject} />
        <View style={sPro.avatarWrap}>
          <LinearGradient colors={[SSM_ACCENT, '#5B3FD6']} style={sPro.avatar}>
            <Text style={sPro.avatarText}>{initials}</Text>
          </LinearGradient>
        </View>
        <Text style={sPro.name}>{fullName}</Text>
        <Text style={sPro.email}>{user?.email}</Text>
        <View style={sPro.roleBadge}>
          <Text style={sPro.roleText}>SOFT SERVICE MANAGER</Text>
        </View>

        <View style={sPro.divider} />

        {[
          { label: 'Property',   value: propertyName || '—' },
          { label: 'Tickets',    value: `${ticketStats.total} total` },
          { label: 'Stock Items',value: `${stockStats.total} items` },
          { label: 'SOP Today',  value: `${sopDone}/${sopTotal} completed` },
        ].map(({ label, value }) => (
          <View key={label} style={sPro.row}>
            <Text style={sPro.rowLabel}>{label}</Text>
            <Text style={sPro.rowValue}>{value}</Text>
          </View>
        ))}
      </Animated.View>

      {/* Sign out */}
      <TouchableOpacity style={sPro.signOut} onPress={() => setShowSignOut(true)}>
        <Ionicons name="log-out-outline" size={18} color="#EF4444" />
        <Text style={sPro.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ── Loading ──
  if (isLoading) {
    return (
      <View style={[sMain.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={[...BG]} style={StyleSheet.absoluteFillObject} />
        <ActivityIndicator size="large" color={SSM_ACCENT} />
        <Text style={{ color: 'rgba(255,255,255,0.4)', marginTop: 14 }}>Loading…</Text>
      </View>
    );
  }

  // ── Main render ──
  return (
    <View style={[sMain.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={[...BG]} style={StyleSheet.absoluteFillObject} />
      {weather && <WeatherBackground condition={weather.condition} />}

      {/* ── Header ── */}
      <Animated.View entering={FadeInDown.duration(400)} style={sMain.header}>
        <Image
          source={require('@/assets/images/autopilot-logo-new.png')}
          style={sMain.logo}
          resizeMode="contain"
        />
        <View style={sMain.headerRight}>
          <TouchableOpacity style={sMain.iconBtn} onPress={() => setShowNotifications(true)}>
            <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[sMain.shiftPill, { borderColor: isCheckedIn ? `${SSM_GREEN}55` : 'rgba(239,68,68,0.4)' }]}
            onPress={toggleShift}
            disabled={isTogglingShift}
          >
            <View style={[sMain.shiftDot, { backgroundColor: isCheckedIn ? SSM_GREEN : '#EF4444' }]} />
            <Text style={[sMain.shiftText, { color: isCheckedIn ? SSM_GREEN : '#EF4444' }]}>
              {isCheckedIn ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ── Content ── */}
      <View style={{ flex: 1 }}>
        {activeTab === 'overview'   && renderOverview()}
        {activeTab === 'stock'      && renderStock()}
        {activeTab === 'checklist'  && renderChecklist()}
        {activeTab === 'tickets'    && renderTickets()}
        {activeTab === 'profile'    && renderProfile()}
      </View>

      {/* ── Bottom Nav ── */}
      <View style={[sMain.bottomNav, { paddingBottom: insets.bottom + 4 }]}>
        <SafeBlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={sMain.bottomNavInner}>
          <TabBtn icon="grid-outline"     label="Overview"   active={activeTab === 'overview'}   onPress={() => setActiveTab('overview')} />
          <TabBtn icon="cube-outline"     label="Stock"      active={activeTab === 'stock'}      onPress={() => setActiveTab('stock')} badge={stockStats.outStock + stockStats.lowStock} />
          <TabBtn icon="checkbox-outline" label="Checklists" active={activeTab === 'checklist'}  onPress={() => setActiveTab('checklist')} />
          <TabBtn icon="ticket-outline"   label="Tickets"    active={activeTab === 'tickets'}    onPress={() => setActiveTab('tickets')} badge={ticketStats.open} />
          <TabBtn icon="person-outline"   label="Profile"    active={activeTab === 'profile'}    onPress={() => setActiveTab('profile')} />
        </View>
      </View>

      {/* Modals */}
      <SignOutModal visible={showSignOut} onClose={() => setShowSignOut(false)} onSignOut={signOut} />
      <NotificationModal visible={showNotifications} onClose={() => setShowNotifications(false)} propertyId={propertyId} />
      <PermissionOnboarding visible={showPermOnboard} onComplete={() => setShowPermOnboard(false)} />
    </View>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────────
function Empty({ icon, title, sub }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
      <Ionicons name={icon} size={48} color="rgba(255,255,255,0.10)" />
      <Text style={{ color: '#FFF', fontSize: 17, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, textAlign: 'center' }}>{sub}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const sMain = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  logo: { width: 140, height: 36 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  shiftPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  shiftDot: { width: 6, height: 6, borderRadius: 3 },
  shiftText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  bottomNav: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  bottomNavInner: { flexDirection: 'row', paddingTop: 4 },
});

const sOv = StyleSheet.create({
  hero: { borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 4 },
  heroLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  greeting: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  sub: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 },
  dutyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  dutyDot: { width: 6, height: 6, borderRadius: 3 },
  dutyText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  alertCard: { borderRadius: 16, padding: 14, borderWidth: 1, borderColor: `${SSM_AMBER}33`, overflow: 'hidden', marginBottom: 14 },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  alertTitle: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  alertChips: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  chipText: { fontSize: 12, fontWeight: '700' },
  alertCta: { alignSelf: 'flex-start' },
  alertCtaText: { color: SSM_AMBER, fontSize: 12, fontWeight: '700' },
  secTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 12, marginTop: 8 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { width: (SW - 52) / 2, borderRadius: 16, padding: 14, borderWidth: 1, overflow: 'hidden', gap: 8 },
  actionLabel: { fontSize: 13, fontWeight: '700' },
});

const sSection = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 14 },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: `${SSM_ACCENT}18`, borderWidth: 1, borderColor: `${SSM_ACCENT}33` },
  scanText: { color: SSM_ACCENT, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  chipNum: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  chipLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },
  fullCta: { borderRadius: 14, borderWidth: 1, borderColor: `${SSM_ACCENT}33`, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden', marginTop: 10 },
  fullCtaText: { color: SSM_ACCENT, fontSize: 14, fontWeight: '700' },
});

const sCl = StyleSheet.create({
  progressCard: { borderRadius: 18, padding: 16, borderWidth: 1, borderColor: `${SSM_GREEN}33`, overflow: 'hidden', marginBottom: 14 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  progressValue: { color: '#FFF', fontSize: 36, fontWeight: '800' },
  progressSub: { color: 'rgba(255,255,255,0.4)', fontSize: 20, fontWeight: '400' },
  progressLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 },
  progressDonut: { alignItems: 'center' },
  progressPct: { fontSize: 28, fontWeight: '800' },
  progressPctLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  barBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3 },
  barFill: { height: 6, backgroundColor: SSM_GREEN, borderRadius: 3 },
});

const sPro = StyleSheet.create({
  card: { borderRadius: 22, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 4, alignItems: 'center', marginBottom: 14 },
  avatarWrap: { marginBottom: 12 },
  avatar: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontSize: 26, fontWeight: '800' },
  name: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  email: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4 },
  roleBadge: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, backgroundColor: `${SSM_ACCENT}22`, borderWidth: 1, borderColor: `${SSM_ACCENT}44` },
  roleText: { color: SSM_ACCENT, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  divider: { width: '100%', height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  rowLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },
  rowValue: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', backgroundColor: 'rgba(239,68,68,0.06)' },
  signOutText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
});
