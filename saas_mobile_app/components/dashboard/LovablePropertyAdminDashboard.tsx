import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ScrollView,
  Platform,
  Modal,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNav from './lovable/BottomNav';
import SkeletonLoader from './lovable/SkeletonLoader';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { createClient } from '@/utils/supabase/client';
import { serverApi } from '@/lib/serverApi';
import { useAuth } from '@/hooks/useAuth';
import { useWeather } from '@/hooks/useWeather';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import DashboardBackground from '@/components/dashboard/DashboardBackground';
import SafeBlurView from '@/components/ui/SafeBlurView';
import SignOutModal from '@/components/ui/SignOutModal';
import CassandraSessionModal from '@/components/cassandra/CassandraSessionModal';
import SidekickFace from '@/components/dashboard/SidekickFace';
import DetailModal, { type TileDetail } from '@/components/dashboard/DetailModal';
import NeedsAttentionModal from '@/components/dashboard/NeedsAttentionModal';
import NotificationModal from '@/components/notifications/NotificationModal';
import { TicketCreateModal } from '@/components/tickets/TicketCreateModal';
import PPMActivityTile from '@/components/dashboard/PPMActivityTile';
import ChecklistProgressCard from '@/components/dashboard/ChecklistProgressCard';
import PPMProgressCard from '@/components/dashboard/PPMProgressCard';
import { ppmService } from '@/services/ppmService';
import { useCassandraStore } from '@/stores/cassandraStore';
import PermissionOnboarding, { hasRequestedPermissions } from '@/components/onboarding/PermissionOnboarding';
import PropertySwitcherModal from '@/components/dashboard/PropertySwitcherModal';
import {
  SPACING,
  TYPOGRAPHY,
  STATUS_COLORS,
  CARD_SURFACES,
} from '@/constants/designSystem';
import {
  PulseDot,
  GlassTile,
  MiniBarChart,
  ProgressBar,
  AttentionCard,
} from './DashboardComponents';

const fontSans = Platform.select({ web: 'system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });
const fontDisplay = Platform.select({ web: '"SF Pro Display", system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });
const BG = '#121212';

type TabKey = 'overview' | 'tickets';

import { useDashboardStore } from '@/stores/dashboardStore';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';

interface Props {
  propertyId: string;
}

export default function LovablePropertyAdminDashboard({ propertyId }: Props) {
  const { user, signOut, membership } = useAuth();
  const insets = useSafeAreaInsets();
  const { weather } = useWeather();
  const router = useRouter();

  // Zustand state for dashboard to prevent reloading on every mount
  const {
    tickets, ticketCounts, sopCount, sopTotal, energyKwh, energyTrend, propertyName: storedPropertyName,
    vmsStats, vendorStats, dieselStats, healthScore, attentionItems, ticketFunnel,
    hasLoadedInitialData, loadedPropertyId, lastUpdatedAt, setDashboardData, clearCache
  } = useDashboardStore();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [isLoading, setIsLoading] = useState(!hasLoadedInitialData || loadedPropertyId !== propertyId);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [showPermissionOnboarding, setShowPermissionOnboarding] = useState(false);
  const [showTileDetail, setShowTileDetail] = useState<TileDetail | null>(null);
  const [showNeedsAttention, setShowNeedsAttention] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPropertySwitcher, setShowPropertySwitcher] = useState(false);

  const [ticketTimeFilter, setTicketTimeFilter] = useState<'today' | 'month' | 'all'>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(
    lastUpdatedAt ? new Date(lastUpdatedAt) : null
  );

  // PPM stats (local)
  const [ppmTotal, setPpmTotal]   = useState(0);
  const [ppmDone, setPpmDone]     = useState(0);
  const [ppmPending, setPpmPending] = useState(0);
  const [ppmOverdue, setPpmOverdue] = useState(0);
  const [ppmPostponed, setPpmPostponed] = useState(0);

  // ─── Needs Attention: merge RPC items with property-scoped ticket logic ───────
  // Matches saas_one web dashboard rules:
  //   1. Tenant tickets      (is_internal === false, not resolved/closed)   → severity: high
  //   2. Critical tickets    (priority === 'critical', active)                      → severity: critical
  //   3. Urgent/High tickets (priority in ['urgent','high'], active)               → severity: high
  //   4. Stale tickets       (>3 days open with active status)                     → severity: medium
  const needsAttentionTickets = useMemo(() => {
    // Drop RPC attention items for tickets that are now resolved/closed
    const RESOLVED_STATUSES = ['resolved', 'closed'];
    const ACTIVE_STATUSES = ['open', 'assigned', 'in_progress', 'in_progress', 'waitlist', 'blocked', 'client_raised', 'work_started'];

    const activeAttentionItems = (attentionItems || []).filter((item) => {
      if (item.entity_type === 'ticket') {
        const t = tickets.find((tk) => tk.id === item.entity_id);
        if (t && RESOLVED_STATUSES.includes(t.status)) return false;
      }
      return true;
    });

    const items: any[] = [...activeAttentionItems];
    const seenIds = new Set(items.map((i) => i.entity_id));

    tickets.forEach((t) => {
      // Skip already-closed tickets
      if (RESOLVED_STATUSES.includes(t.status)) return;

      // 1. Tenant (external) tickets
      if (t.internal === false && !seenIds.has(t.id)) {
        items.push({
          id: `tenant-${t.id}`,
          entity_id: t.id,
          entity_type: 'ticket',
          severity: 'high',
          type: 'tenant_ticket',
          title: 'Tenant Ticket',
          description: t.title || 'Tenant raised ticket',
          action_label: 'View',
        });
        seenIds.add(t.id);
      }

      // 2. Critical priority tickets
      if (t.priority === 'critical' && !seenIds.has(t.id)) {
        items.push({
          id: `critical-${t.id}`,
          entity_id: t.id,
          entity_type: 'ticket',
          severity: 'critical',
          type: 'critical_ticket',
          title: 'Critical Ticket',
          description: t.title || 'Critical priority ticket',
          action_label: 'Urgent',
        });
        seenIds.add(t.id);
      }

      // 3. High / Urgent priority tickets (not already captured above)
      if (['urgent', 'high'].includes(t.priority) && !seenIds.has(t.id)) {
        items.push({
          id: `urgent-${t.id}`,
          entity_id: t.id,
          entity_type: 'ticket',
          severity: 'high',
          type: 'critical_ticket',
          title: t.priority === 'urgent' ? 'Urgent Ticket' : 'High Priority Ticket',
          description: t.title || `${t.priority} priority ticket`,
          action_label: 'Review',
        });
        seenIds.add(t.id);
      }

      // 4. Stale tickets — open for more than 3 days with an active status
      if (!seenIds.has(t.id) && ACTIVE_STATUSES.includes(t.status)) {
        const daysOpen = (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysOpen > 3) {
          items.push({
            id: `stale-${t.id}`,
            entity_id: t.id,
            entity_type: 'ticket',
            severity: 'medium',
            type: 'stale_ticket',
            title: 'Stale Ticket',
            description: `${t.title || 'Ticket'} · Open ${Math.floor(daysOpen)}d`,
            action_label: 'Follow Up',
          });
          seenIds.add(t.id);
        }
      }
    });

    return items;
  }, [attentionItems, tickets]);

  const prioritizedAttentionItems = useMemo(() => {
    if (!needsAttentionTickets.length) return [];
    return [...needsAttentionTickets].map((item) => {
      const matchingTicket = tickets.find((t) => t.id === item.entity_id);
      const isTenant = matchingTicket ? matchingTicket.internal === false : false;
      const isCritical = item.severity === 'critical';
      const isHighUrgent = ['urgent', 'high'].includes(matchingTicket?.priority ?? '');
      const isStale = item.type === 'stale_ticket';

      // Priority scoring matches saas_one web logic
      let priorityScore = 0;
      if (isCritical) priorityScore += 15;
      if (isTenant) priorityScore += 10;
      if (isHighUrgent) priorityScore += 8;
      if (isStale) priorityScore += 3;

      const cleanDescription = item.description
        ? item.description.replace(/^Ticket\s+#\S+\s+/i, '')
        : '';

      return {
        ...item,
        description: cleanDescription,
        photoBeforeUrl: matchingTicket?.photo_before_url || null,
        priorityScore,
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);
  }, [needsAttentionTickets, tickets]);

  // Cassandra voice state
  const voiceState = useCassandraStore((s) => s.voiceState);
  const faceState: any = (() => {
    if (voiceState === 'recording' || voiceState === 'processing' || voiceState === 'connecting') return 'listening';
    if (voiceState === 'speaking') return 'speaking';
    if (voiceState === 'error') return 'alert';
    return 'idle';
  })();

  const orgId = membership?.org_id ?? '';
  const orgRole = (membership?.org_role ?? '').toLowerCase();
  const isOrgAdmin = ['org_super_admin', 'org_admin', 'owner'].includes(orgRole);
  const propertyRole = (membership?.properties?.find(p => p.id === propertyId)?.role ?? '').toLowerCase();
  const isPropertyAdmin = ['property_admin', 'admin', 'manager', 'property_manager', 'facility_manager', 'spoc', 'administrator'].includes(propertyRole);
  const hasMultipleProperties = (membership?.properties?.length ?? 0) > 1;
  const canSwitchProperty = isOrgAdmin || (isPropertyAdmin && hasMultipleProperties);

  const propertyName = useMemo(() => {
    if (propertyId === 'all') return 'All Properties Overview';
    const prop = membership?.properties?.find(p => p.id === propertyId);
    return prop?.name || storedPropertyName || 'Property';
  }, [propertyId, membership, storedPropertyName]);

  const propertyIdRef = useRef(propertyId);
  useEffect(() => { propertyIdRef.current = propertyId; }, [propertyId]);

  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    const requestedPropertyId = propertyId;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const isAll = propertyId === 'all';
      const propIds = isAll 
        ? (membership?.properties?.map(p => p.id) ?? [])
        : [propertyId];

      if (propIds.length === 0) return; // Nothing to fetch

      const propFilter = isAll
        ? { op: 'in' as const, column: 'property_id', values: propIds }
        : { op: 'eq' as const, column: 'property_id', value: propertyId };

      const safeFetch = (promise: Promise<any>, fallbackData: any, countFallback: number | null = null) => 
        promise.catch(err => {
          if (__DEV__) console.warn('[Dashboard query fallback]', err?.message);
          return { data: fallbackData, count: countFallback };
        });

      const bulkQueries = Promise.all([
        isAll
          ? Promise.resolve({ data: { name: 'All Properties Overview' } })
          : safeFetch(serverApi.query({ table: 'properties', action: 'select', select: 'name', filters: [{ op: 'eq' as const, column: 'id', value: propertyId }], single: true }), null),
        safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id, title, status, priority, created_at, internal, photo_before_url', filters: [propFilter], orders: [{ column: 'created_at', ascending: false }] }), []),
        safeFetch(serverApi.query({ table: 'sop_templates', action: 'select', select: 'id', filters: [propFilter, { op: 'eq' as const, column: 'is_active', value: true }] }), []),
        safeFetch(serverApi.query({ table: 'sop_completions', action: 'select', select: 'status', filters: [propFilter, { op: 'eq' as const, column: 'completion_date', value: todayStr }] }), []),
        safeFetch(serverApi.query({ table: 'visitor_logs', action: 'select', select: 'status', filters: [propFilter] }), []),
        safeFetch(serverApi.query({ table: 'vendor_daily_revenue', action: 'select', select: 'revenue_amount, vendor_id', filters: [propFilter] }), []),
        safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id', selectOptions: { count: 'exact', head: true }, filters: [propFilter] }), null, 0),
        safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id', selectOptions: { count: 'exact', head: true }, filters: [propFilter, { op: 'in' as const, column: 'status', values: ['open', 'assigned', 'in_progress', 'client_raised', 'waitlist'] }] }), null, 0),
        safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id', selectOptions: { count: 'exact', head: true }, filters: [propFilter, { op: 'in' as const, column: 'status', values: ['resolved', 'closed'] }] }), null, 0),
      ]);

      const perPropQueries = Promise.all(propIds.map(async (pid) => {
        const [elec, diesel, health, attention, funnel, ppm] = await Promise.all([
          safeFetch(serverApi.query({ table: 'electricity_readings', action: 'select', select: 'final_units', filters: [{ op: 'eq' as const, column: 'property_id', value: pid }], orders: [{ column: 'created_at', ascending: false }], limit: 1, maybeSingle: true }), null),
          safeFetch(serverApi.query({ table: 'diesel_readings', action: 'select', select: 'current_fuel_level', filters: [{ op: 'eq' as const, column: 'property_id', value: pid }], orders: [{ column: 'created_at', ascending: false }], limit: 1, maybeSingle: true }), null),
          safeFetch(serverApi.rpc('get_property_health_score', { p_property_id: pid }), null),
          safeFetch(serverApi.rpc('get_attention_items', { p_property_id: pid, p_limit: 10 }), []),
          safeFetch(serverApi.rpc('get_ticket_funnel', { p_property_id: pid, p_days: 30 }), []),
          ppmService.fetchStats(pid).catch(() => ({ success: false, data: null }))
        ]);
        return { elec, diesel, health, attention, funnel, ppm };
      }));

      const [[propRes, ticketRes, sopTemplatesRes, sopCompletionsRes, vmsRes, revRes, countTotalRes, countOpenRes, countClosedRes], perPropResults] = await Promise.all([
        bulkQueries,
        perPropQueries
      ]);

      const currentState = useDashboardStore.getState();

      // Aggregate bulk results
      let newPropName = propRes?.data ? (propRes.data as any).name : currentState.propertyName;
      let newTickets = ticketRes?.data ? (ticketRes.data as any[]) : currentState.tickets;
      let newSopTotal = sopTemplatesRes?.data ? (sopTemplatesRes.data as any[]).length : currentState.sopTotal;
      let newSopCount = sopCompletionsRes?.data ? (sopCompletionsRes.data as any[]).filter((s: any) => s.status === 'completed').length : currentState.sopCount;

      let newVmsStats = currentState.vmsStats;
      if (vmsRes?.data) {
        const total = (vmsRes.data as any[]).length;
        const checkedIn = (vmsRes.data as any[]).filter((v: any) => v.status === 'checked_in').length;
        const checkedOut = (vmsRes.data as any[]).filter((v: any) => v.status === 'checked_out').length;
        newVmsStats = { total, in: checkedIn, out: checkedOut };
      }

      let newVendorStats = currentState.vendorStats;
      if (revRes?.data) {
        const totalRev = (revRes.data as any[]).reduce((acc: number, row: any) => acc + (row.revenue_amount || 0), 0);
        newVendorStats = { revenue: totalRev, commission: totalRev * 0.1 };
      }

      // Aggregate per-property results
      let totalElec = 0;
      let totalDiesel = 0;
      let healthSum = 0;
      let attentionArr: any[] = [];
      let funnelCounts: Record<string, number> = {};
      
      let pTotal = 0, pDone = 0, pPending = 0, pOverdue = 0, pPostponed = 0;

      perPropResults.forEach(res => {
        if (res.elec.data) totalElec += (res.elec.data as any).final_units || 0;
        if (res.diesel.data) totalDiesel += (res.diesel.data as any).current_fuel_level || 0;
        if (res.health.data) healthSum += (res.health.data as number);
        if (res.attention.data) attentionArr.push(...(res.attention.data as any[]));
        
        if (res.funnel.data) {
          (res.funnel.data as any[]).forEach(fItem => {
            funnelCounts[fItem.status_label] = (funnelCounts[fItem.status_label] || 0) + fItem.ticket_count;
          });
        }
        
        if (res.ppm.success && res.ppm.data) {
          pTotal += res.ppm.data.total ?? 0;
          pDone += res.ppm.data.done ?? 0;
          pPending += res.ppm.data.pending ?? 0;
          pOverdue += res.ppm.data.overdue ?? 0;
          pPostponed += res.ppm.data.postponed ?? 0;
        }
      });

      let newEnergyKwh = Math.round(totalElec);
      let newDieselStats = { level: totalDiesel, consumption: 0 };
      let newHealthScore = propIds.length > 0 ? Math.round(healthSum / propIds.length) : 100;
      
      const sortedAttention = attentionArr.sort((a, b) => {
        const score = (sev: string) => sev === 'critical' ? 3 : sev === 'high' ? 2 : 1;
        return score(b.severity) - score(a.severity);
      }).slice(0, 10);
      let newAttentionItems = sortedAttention;
      
      let newTicketFunnel = Object.entries(funnelCounts).map(([status_label, ticket_count]) => ({ status_label, ticket_count }));

      setPpmTotal(pTotal);
      setPpmDone(pDone);
      setPpmPending(pPending);
      setPpmOverdue(pOverdue);
      setPpmPostponed(pPostponed);

      // Guard against stale response from a previous property fetch
      if (propertyIdRef.current !== requestedPropertyId) return;

      setDashboardData({
        propertyName: newPropName,
        tickets: newTickets,
        ticketCounts: {
          total: countTotalRes?.count ?? newTickets.length,
          open: countOpenRes?.count ?? newTickets.filter(t => ['open', 'assigned', 'in_progress', 'client_raised', 'waitlist'].includes(t.status)).length,
          closed: countClosedRes?.count ?? newTickets.filter(t => ['resolved', 'closed'].includes(t.status)).length,
        },
        sopTotal: newSopTotal,
        sopCount: newSopCount,
        energyKwh: newEnergyKwh,
        healthScore: newHealthScore,
        attentionItems: newAttentionItems,
        ticketFunnel: newTicketFunnel,
        vmsStats: newVmsStats,
        vendorStats: newVendorStats,
        dieselStats: newDieselStats,
        hasLoadedInitialData: true,
        loadedPropertyId: requestedPropertyId,
        lastUpdatedAt: Date.now(),
      });

    } catch (err: any) {
      if (__DEV__) {
        console.error('[Dashboard] fetchData error:', err?.message ?? err);
      }
    } finally {
      // Only hide skeleton if we're still on the property we fetched for
      if (propertyIdRef.current === requestedPropertyId) {
        setIsLoading(false);
        setIsRefreshing(false);
        setLastUpdated(new Date());
      }
    }
  }, [propertyId, membership]);

  // React Query wrapper: prevents re-fetching on every mount if data is fresh
  const { refetch } = useDashboardFetch(queryKeys.property.dashboard(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    if (loadedPropertyId !== propertyId) {
      clearCache();
      setIsLoading(true);
    }
    // fetchData is called by useDashboardFetch on mount (if stale)
    // Show permission onboarding on first visit
    hasRequestedPermissions().then(requested => {
      if (!requested) setShowPermissionOnboarding(true);
    });
  }, [propertyId, loadedPropertyId]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Stats
  const filteredTickets = useMemo(() => {
    const now = new Date();
    if (ticketTimeFilter === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      return tickets.filter((t) => t.created_at?.startsWith(todayStr));
    }
    if (ticketTimeFilter === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      return tickets.filter((t) => t.created_at >= monthStart);
    }
    return tickets;
  }, [tickets, ticketTimeFilter]);

  const openTickets = useMemo(() => 
    ticketTimeFilter === 'all'
      ? ticketCounts.open
      : filteredTickets.filter((t) => ['open', 'assigned', 'in_progress', 'resolved', 'client_raised', 'waitlist'].includes(t.status)).length, 
    [filteredTickets, ticketTimeFilter, ticketCounts.open]
  );
  const resolvedTickets = useMemo(() => 
    ticketTimeFilter === 'all'
      ? ticketCounts.closed
      : filteredTickets.filter((t) => ['resolved', 'closed'].includes(t.status)).length, 
    [filteredTickets, ticketTimeFilter, ticketCounts.closed]
  );
  const totalTickets = ticketTimeFilter === 'all' ? ticketCounts.total : filteredTickets.length;

  // Dynamically compute funnel from filtered tickets
  const dynamicFunnel = useMemo(() => {
    const counts: Record<string, number> = {
      'assigned': 0,
      'in_progress': 0,
      'resolved': 0,
      'closed': 0,
    };
    filteredTickets.forEach(t => {
      if (counts.hasOwnProperty(t.status)) counts[t.status]++;
    });
    return Object.entries(counts).map(([status, count]) => ({
      status_label: status,
      ticket_count: count
    }));
  }, [filteredTickets]);
  const healthStatus: 'optimal' | 'watch' | 'critical' = openTickets > 15 ? 'critical' : openTickets > 5 ? 'watch' : 'optimal';
  const healthColor = STATUS_COLORS[healthStatus].bg;
  const checklistPct = sopTotal > 0 ? Math.round((sopCount / sopTotal) * 100) : 100;
  
  // Stats for VMS and Vendor
  const pendingValidationCount = useMemo(() => tickets.filter(t => t.status === 'resolved').length, [tickets]);

  // Mock 7-day history for sparklines
  const ticketHistory = useMemo(() => {
    return [12, 18, 15, 22, 19, 25, openTickets || 14];
  }, [openTickets]);

  const energyHistory = useMemo(() => {
    return [35, 55, 70, 92, 78, 60, 45];
  }, []);

  // Tile detail data
  const tileDetails: Record<string, TileDetail> = {
    tickets: {
      id: 'tickets',
      iconName: 'ticket',
      label: 'Tickets',
      title: `${propertyName} · Tickets`,
      metrics: [
        { label: 'Open', value: openTickets.toString() },
        { label: 'Resolved', value: resolvedTickets.toString() },
        { label: 'Total', value: totalTickets.toString() },
      ],
      chartTitle: '7-Day Volume',
      chartData: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => ({ label: d, value: ticketHistory[i] })),
      chartColor: '#3B82F6',
      trendDirection: openTickets > 10 ? 'up' : 'down',
      trendLabel: `${openTickets} open tickets`,
      breakdownTitle: 'Status Breakdown',
      breakdown: [
        { label: 'Open', value: openTickets, color: STATUS_COLORS.critical.bg },
        { label: 'Resolved', value: resolvedTickets, color: STATUS_COLORS.optimal.bg },
        { label: 'Total', value: totalTickets, color: '#3B82F6' },
      ],
      aiAnalysis: openTickets > 15
        ? 'Critical ticket backlog detected. Immediate staff reallocation recommended to meet SLA targets.'
        : 'Ticket volume is within normal operating parameters. Focus on maintaining resolution speed.',
    },
    checklist: {
      id: 'checklist',
      iconName: 'checkbox-outline',
      label: 'Checklist',
      title: `${propertyName} · Daily Checklist`,
      metrics: [
        { label: 'Completed', value: sopCount.toString() },
        { label: 'Total', value: sopTotal.toString() },
        { label: 'Success %', value: `${checklistPct}%` },
      ],
      chartTitle: 'Completion Trend',
      chartData: [
        { label: 'Goal', value: 100 },
        { label: 'Current', value: checklistPct },
      ],
      chartColor: STATUS_COLORS.optimal.bg,
      trendDirection: 'up',
      trendLabel: `${checklistPct}% compliance`,
      breakdownTitle: 'Completion Status',
      breakdown: [
        { label: 'Completed', value: sopCount, color: STATUS_COLORS.optimal.bg },
        { label: 'Pending', value: Math.max(0, sopTotal - sopCount), color: STATUS_COLORS.watch.bg },
      ],
      aiAnalysis: checklistPct > 90
        ? 'Operational compliance is excellent. Teams are following standard procedures consistently.'
        : 'Checklist completion is below target. Review pending tasks and assign additional resources.',
    },
    health: {
      id: 'health',
      iconName: 'heart',
      label: 'Health',
      title: `${propertyName} · Facility Health`,
      metrics: [
        { label: 'Open Issues', value: openTickets.toString() },
        { label: 'Status', value: healthStatus.toUpperCase() },
        { label: 'Trend', value: openTickets > 5 ? 'Declining' : 'Stable' },
      ],
      chartTitle: 'Health Index',
      chartData: [
        { label: 'Risk', value: Math.min(openTickets * 5, 100) },
        { label: 'Healthy', value: Math.max(0, 100 - openTickets * 5) },
      ],
      chartColor: healthColor,
      trendDirection: openTickets > 5 ? 'down' : 'up',
      trendLabel: 'Real-time index',
      breakdownTitle: 'Health Components',
      breakdown: [
        { label: 'Tickets', value: openTickets, color: healthColor },
        { label: 'Checklist Compliance', value: `${checklistPct}%`, color: STATUS_COLORS.optimal.bg },
      ],
      aiAnalysis: healthStatus === 'critical'
        ? 'Facility health has declined significantly. High open ticket count is the primary driver. Schedule emergency review.'
        : 'Facility health is stable. Continue monitoring ticket resolution rates and checklist compliance.',
    },
    energy: {
      id: 'energy',
      iconName: 'flash',
      label: 'Energy',
      title: `${propertyName} · Energy Consumption`,
      metrics: [
        { label: 'Today (kWh)', value: energyKwh.toString() },
        { label: 'Trend', value: `${energyTrend > 0 ? '+' : ''}${energyTrend}%` },
        { label: 'Peak', value: '14:00' },
      ],
      chartTitle: 'Hourly Consumption',
      chartData: ['06', '09', '12', '15', '18', '21', '00'].map((d, i) => ({ label: d, value: energyHistory[i] })),
      chartColor: '#FFD60A',
      trendDirection: energyTrend > 0 ? 'up' : 'down',
      trendLabel: `${Math.abs(energyTrend)}% vs avg`,
      breakdownTitle: 'Source Mix',
      breakdown: [
        { label: 'Grid', value: '68%', color: '#3B82F6' },
        { label: 'DG', value: '24%', color: '#C4A000' },
        { label: 'Solar', value: '8%', color: '#1FC26E' },
      ],
      aiAnalysis: energyTrend > 10
        ? 'Energy consumption is trending higher than average. Inspect heavy loads or check for utility leakage.'
        : 'Energy consumption is stable and matches historical patterns.',
    },
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: '#121212' }]}>
        <StatusBar barStyle="light-content" />
        <SkeletonLoader />
      </View>
    );
  }

  const renderTabContent = () => (
    <>
      <GlassTile label="Tickets" icon="ticket" delay={80} status={healthStatus} onPress={() => setShowTileDetail(tileDetails.tickets)}>
        <View style={styles.timeToggleRow}>
          {(['today', 'month', 'all'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.timeToggleBtn, ticketTimeFilter === f && styles.timeToggleBtnActive]}
              onPress={() => setTicketTimeFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={[styles.timeToggleText, ticketTimeFilter === f && styles.timeToggleTextActive]}>
                {f === 'today' ? 'Today' : f === 'month' ? 'This Month' : 'All Time'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <View style={{ alignItems: 'flex-start' }}>
            <Text style={styles.tileMetricMid}>{totalTickets}</Text>
            <Text style={[styles.tileSubtext, { marginTop: 0, fontSize: 10, letterSpacing: 1 }]}>TOTAL</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.tileMetricMid, { color: '#FCA5A5' }]}>{openTickets}</Text>
            <Text style={[styles.tileSubtext, { marginTop: 0, fontSize: 10, letterSpacing: 1 }]}>OPEN</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.tileMetricMid, { color: '#10B981' }]}>{resolvedTickets}</Text>
            <Text style={[styles.tileSubtext, { marginTop: 0, fontSize: 10, letterSpacing: 1 }]}>CLOSED</Text>
          </View>
        </View>
      </GlassTile>

      {prioritizedAttentionItems.length > 0 && (
        <>
          <Animated.View entering={FadeInUp.delay(160).duration(500)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, marginBottom: SPACING.md }}>
            <Text style={{  fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 2, textTransform: 'uppercase' }}>⚠️ NEEDS ATTENTION</Text>
            <TouchableOpacity onPress={() => setShowNeedsAttention(true)}>
              <Text style={{  fontSize: 11, fontWeight: '700', color: '#3B82F6' }}>VIEW ALL</Text>
            </TouchableOpacity>
          </Animated.View>
          {prioritizedAttentionItems.slice(0, 3).map((item, index) => (
            <AttentionCard key={item.id} item={item} index={index} onAction={() => item.entity_type === 'ticket' && router.push(`/property/${propertyId}/tickets/${item.entity_id}`)} />
          ))}
        </>
      )}

      <ChecklistProgressCard completed={sopCount} total={sopTotal} delay={200} onPress={() => setShowTileDetail(tileDetails.checklist)} />

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

      <PPMActivityTile propertyId={propertyId} organizationId={orgId} delay={320} />

      <GlassTile label="Energy Usage" icon="flash" delay={280} status={energyTrend > 10 ? 'watch' : 'optimal'} onPress={() => setShowTileDetail(tileDetails.energy)}>
        <View style={styles.tileTopRow}><View><Text style={styles.tileMetricMid}>{energyKwh} <Text style={styles.tileSuffix}>kWh</Text></Text><Text style={styles.tileSubtext}>Grid + DG consumption today</Text></View><View style={styles.trendChip}><Ionicons name={energyTrend > 0 ? 'trending-up' : 'trending-down'} size={12} color="#1FC26E" /><Text style={styles.trendChipText}>+{energyTrend}%</Text></View></View>
        <MiniBarChart data={energyHistory} highlightColor="rgba(214,158,46,0.85)" />
      </GlassTile>

      {/* NEW: Visitor Stats Tile */}
      <GlassTile label="Visitors" icon="people-outline" delay={320} onPress={() => router.push(`/property/${propertyId}/visitors`)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={styles.tileMetricMid}>{vmsStats.total}</Text>
            <Text style={styles.tileSubtext}>Total Visitors</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#10B981', fontWeight: '700' }}>{vmsStats.in}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>IN</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>{vmsStats.out}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>OUT</Text>
            </View>
          </View>
        </View>
      </GlassTile>

      {/* NEW: Vendor Revenue Tile */}
      <GlassTile label="Cafeteria Revenue" icon="fast-food-outline" delay={360} onPress={() => router.push(`/property/${propertyId}/vendor`)}>
        <View style={styles.tileTopRow}>
          <View>
            <Text style={styles.tileMetricMid}>₹{vendorStats.revenue.toLocaleString()}</Text>
            <Text style={styles.tileSubtext}>Total Revenue</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: '#F59E0B', fontSize: 16, fontWeight: '800' }}>₹{Math.round(vendorStats.commission).toLocaleString()}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>COMMISSION</Text>
          </View>
        </View>
      </GlassTile>

      {/* NEW: Diesel Level Tile */}
      <GlassTile label="Diesel Status" icon="water-outline" delay={400} onPress={() => router.push(`/property/${propertyId}/diesel`)}>
        <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 2, borderColor: 'rgba(245,158,11,0.3)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '800' }}>{dieselStats.level}%</Text>
          </View>
          <View>
            <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>Current Level</Text>
            <Text style={styles.tileSubtext}>Tank A + Tank B summary</Text>
          </View>
        </View>
      </GlassTile>
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <DashboardBackground />
      {weather && <WeatherBackground condition={weather.condition} />}
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="rgba(255,255,255,0.6)" />} contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}>
        <Animated.View entering={FadeInUp.duration(500)} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity style={styles.hamburgerBtn} onPress={() => setShowDrawer(true)} activeOpacity={0.7}><Ionicons name="menu" size={28} color="#FFFFFF" /></TouchableOpacity>
          <View style={styles.headerCenter}>
            <TouchableOpacity 
              style={styles.profileRow} 
              activeOpacity={0.7}
              onPress={() => router.push(`/property/${propertyId}/profile`)}
            >
              <View style={styles.avatar}>
                {user?.avatar ? (
                  <Image source={{ uri: user.avatar }} style={styles.avatarImage} resizeMode="cover" />
                ) : (
                  <Text style={styles.avatarText}>{user?.user_metadata?.full_name ? user.user_metadata.full_name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}</Text>
                )}
              </View>
              <View style={[styles.nameContainer, { flex: 1 }]}>
                <Text style={styles.greetingText} numberOfLines={1}>Hey, {user?.user_metadata?.full_name?.split(' ')[0] || 'Admin'}</Text>
                {canSwitchProperty ? (
                  <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}
                    onPress={(e) => { e.stopPropagation(); setShowPropertySwitcher(true); }}
                  >
                    <Text style={[styles.headerSubtitle, { marginTop: 0 }]} numberOfLines={1}>{propertyName}</Text>
                    <Ionicons name="chevron-down" size={14} color="#FFF" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.headerSubtitle} numberOfLines={1}>{propertyName}</Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowCreateModal(true)} activeOpacity={0.7}>
              <Ionicons name="add-circle-outline" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowNotifications(true)}>
              <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
              <View style={styles.notificationBadge} />
            </TouchableOpacity>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(100).duration(600)} style={styles.overviewHeader}><Text style={styles.overviewTitle}>PROPERTY OVERVIEW</Text></Animated.View>
        
        <View style={{ marginTop: SPACING.lg }}>{renderTabContent()}</View>
      </ScrollView>

      {showTileDetail && <DetailModal onClose={() => setShowTileDetail(null)} detail={showTileDetail} />}
      <NeedsAttentionModal
        visible={showNeedsAttention}
        onClose={() => setShowNeedsAttention(false)}
        items={prioritizedAttentionItems}
        propertyName={propertyName}
        onItemPress={(item) => {
          setShowNeedsAttention(false);
          if (item.entity_type === 'ticket') {
            router.push(`/property/${propertyId}/tickets/${item.entity_id}` as any);
          }
        }}
      />
      <SignOutModal visible={showSignOut} onClose={() => setShowSignOut(false)} onSignOut={signOut} />
      <CassandraSessionModal visible={showChat} onClose={() => setShowChat(false)} orgId={orgId} propertyId={propertyId} initialMode="text" />
      <TicketCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        propertyId={propertyId}
        organizationId={orgId}
        role="admin"
        onSuccess={fetchData}
      />
      <NotificationModal
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
        propertyId={propertyId}
      />
      <PermissionOnboarding
        visible={showPermissionOnboarding}
        onComplete={() => setShowPermissionOnboarding(false)}
      />
      {canSwitchProperty && (
        <PropertySwitcherModal
          visible={showPropertySwitcher}
          onClose={() => setShowPropertySwitcher(false)}
          currentPropertyId={propertyId}
          orgId={orgId}
        />
      )}
      
      <Modal visible={showDrawer} transparent animationType="fade" onRequestClose={() => setShowDrawer(false)}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={[styles.drawerPanel, { paddingTop: insets.top + 16 }]}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerLogoContainer}>
                <Image 
                  source={require('@/assets/images/autopilot-logo-new.png')} 
                  style={[styles.drawerLogo, { tintColor: '#FFFFFF' }]} 
                  resizeMode="contain" 
                />
              </View>
              <TouchableOpacity onPress={() => setShowDrawer(false)} style={styles.drawerCloseBtn}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.drawerSectionHeader}>
                <Ionicons name="construct-outline" size={14} color="rgba(255,255,255,0.3)" />
                <Text style={styles.drawerSectionLabel}>OPERATIONS</Text>
              </View>
              {[
                { label: 'Dashboard', route: 'dashboard', icon: 'grid-outline' },
                { label: 'Tickets', route: 'tickets', icon: 'ticket-outline' },
                { label: 'User Directory', route: 'users', icon: 'people-outline' },
                { label: 'Visitors', route: 'visitors', icon: 'walk-outline' },
                { label: 'Meeting Rooms', route: 'rooms', icon: 'calendar-outline' },
              ].map((item) => (
                <TouchableOpacity key={item.route} style={styles.drawerItem} onPress={() => { setShowDrawer(false); router.push(`/property/${propertyId}/${item.route}` as any); }}>
                  <Ionicons name={item.icon as any} size={20} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.drawerItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}

              <View style={[styles.drawerSectionHeader, { marginTop: 20 }]}>
                <Ionicons name="hammer-outline" size={14} color="rgba(255,255,255,0.3)" />
                <Text style={styles.drawerSectionLabel}>UTILITIES</Text>
              </View>
              {[
                { label: 'Diesel Manager', route: 'diesel', icon: 'water-outline' },
                { label: 'Electricity', route: 'electricity', icon: 'flash-outline' },
                { label: 'Stock / Inventory', route: 'stock', icon: 'cube-outline' },
                { label: 'Checklists', route: 'checklist', icon: 'clipboard-outline' },
                { label: 'PPM', route: 'ppm', icon: 'calendar-clear-outline' },
              ].map((item) => (
                <TouchableOpacity key={item.route} style={styles.drawerItem} onPress={() => { setShowDrawer(false); router.push(`/property/${propertyId}/${item.route}` as any); }}>
                  <Ionicons name={item.icon as any} size={20} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.drawerItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}

              <View style={[styles.drawerSectionHeader, { marginTop: 20 }]}>
                <Ionicons name="pie-chart-outline" size={14} color="rgba(255,255,255,0.3)" />
                <Text style={styles.drawerSectionLabel}>MANAGEMENT</Text>
              </View>
              {[
                { label: 'Procurement', route: 'procurement', icon: 'cart-outline' },
                { label: 'Escalation', route: 'escalation', icon: 'git-branch-outline' },
                { label: 'Vendor Revenue', route: 'vendor', icon: 'restaurant-outline' },
                { label: 'Reports', route: 'reports', icon: 'document-text-outline' },
                { label: 'Settings', route: 'settings', icon: 'settings-outline' },
              ].map((item) => (
                <TouchableOpacity key={item.route} style={styles.drawerItem} onPress={() => { setShowDrawer(false); router.push(`/property/${propertyId}/${item.route}` as any); }}>
                  <Ionicons name={item.icon as any} size={20} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.drawerItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.drawerSignOut} onPress={() => { setShowDrawer(false); setShowSignOut(true); }}>
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              <Text style={styles.drawerSignOutText}>Logout</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.drawerBackdrop} onPress={() => setShowDrawer(false)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingBottom: 12 },
  hamburgerBtn: { padding: 4 },
  headerCenter: { flex: 1, paddingHorizontal: 16 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: 32, height: 32, borderRadius: 16 },
  avatarText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  greetingText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  headerRight: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  headerIconBtn: { position: 'relative' },
  notificationBadge: { position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  overviewHeader: { paddingHorizontal: SPACING.xl, marginTop: 20 },
  overviewTitle: {  fontSize: 24, fontWeight: '800', color: '#FFFFFF', lineHeight: 26, letterSpacing: -0.5 },
  tileWrapper: { marginHorizontal: SPACING.xl, marginBottom: 12, borderRadius: 20, overflow: 'hidden' },
  tileBlur: { minHeight: 140 },
  tileContent: { padding: 16 },
  tileTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tileMetricBig: {  fontSize: 42, fontWeight: '800', color: '#FFFFFF' },
  tileMetricMid: {  fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  tileSuffix: { fontSize: 16, color: 'rgba(255,255,255,0.3)', fontWeight: '600' },
  tileSubtext: {  fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  timeToggleRow: { flexDirection: 'row', gap: 6, marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 4, width: '100%' },
  timeToggleBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  timeToggleBtnActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  timeToggleText: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  timeToggleTextActive: { color: '#FFF', fontWeight: '700' },
  trendChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(31,194,110,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  trendChipText: { color: '#1FC26E', fontSize: 12, fontWeight: '700' },
  drawerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  drawerPanel: { width: 280, height: '100%', backgroundColor: '#111', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 20 },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 25, marginTop: 10 },
  drawerLogoContainer: { flex: 1 },
  drawerLogo: { width: 140, height: 35, marginLeft: -5 },
  drawerSubtitle: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '900', letterSpacing: 2, marginTop: 4, marginLeft: 2 },
  drawerTitle: {  fontSize: 24, fontWeight: '700', color: '#FFF' },
  drawerCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
  drawerItem: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 15 },
  drawerItemLabel: {  fontSize: 16, color: '#FFF' },
  drawerSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4, gap: 6 },
  drawerSectionLabel: {  fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5 },
  drawerSignOut: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', marginBottom: 40 },
  drawerSignOutText: { color: '#EF4444', fontWeight: '700' },
  nameContainer: { flexDirection: 'column' as const },
  healthDot: { width: 10, height: 10, borderRadius: 5 },
});
