import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context';
import TicketListItem from '@/components/tickets/TicketListItem';
import MediaCaptureModal, { MediaFile } from '@/components/shared/MediaCaptureModal';
import { GlassCard } from '@/constants/designSystem';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { RotatingBorder } from '@/components/shared/RotatingBorder';
import { TicketCreateModal } from '@/components/tickets/TicketCreateModal';
import { LinearGradient } from 'expo-linear-gradient';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';



type StatusFilter = 'all' | 'mine' | 'open' | 'in_progress' | 'resolved' | 'closed';
type DateRangeFilter = 'all' | 'today' | 'week' | 'month';

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all',                label: 'All' },
  { key: 'mine',               label: 'My Tickets' },
  { key: 'open',               label: 'Opened' },
  { key: 'in_progress',        label: 'In Progress' },
  { key: 'resolved',           label: 'Resolved' },
  { key: 'closed',             label: 'Closed' },
];

const DATE_RANGES: { key: DateRangeFilter; label: string }[] = [
  { key: 'all',   label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

interface TicketEscalationLog {
  from_level: number;
  to_level: number | null;
  escalated_at: string;
  from_employee?: { full_name: string; user_photo_url?: string | null } | null;
  to_employee?: { full_name: string; user_photo_url?: string | null } | null;
}

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  ticket_number: string;
  created_at: string;
  updated_at: string;
  property_id: string;
  organization_id: string;
  assignee: { id: string; full_name: string; user_photo_url?: string | null } | null;
  creator:  { id: string; full_name: string } | null;
  photo_before_url?: string | null;
  is_internal?: boolean | null;
  ticket_escalation_logs?: TicketEscalationLog[];
}

const PAGE_SIZE = 20;

export default function TicketsScreen() {
  const { propertyId, filter } = useLocalSearchParams<{ propertyId: string; filter?: string }>();
  const router = useRouter();
  const isNeedsAttentionMode = filter === 'needs_attention';
  const supabase = createClient();
  const { membership, user: authUser } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [tickets, setTickets] = useState<Ticket[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
  const [statusCounts, setStatusCounts] = useState<Record<StatusFilter, number>>({
    all: 0, mine: 0, open: 0, in_progress: 0, resolved: 0, closed: 0,
  });
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const insets = useSafeAreaInsets();
  const orgId = membership?.org_id ?? '';

  // Client-side filter for needs-attention mode
  const displayedTickets = useMemo(() => {
    if (!isNeedsAttentionMode) return tickets;
    return tickets.filter((t) => {
      // Critical priority
      if (t.priority === 'critical') return true;
      // High priority + active
      if (t.priority === 'high' && !['resolved', 'closed'].includes(t.status)) return true;
      // Tenant ticket + active
      if (t.is_internal === false && !['resolved', 'closed'].includes(t.status)) return true;
      // Stale ticket (>3 days open)
      const daysOpen = (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysOpen > 3 && ['open', 'assigned', 'in_progress'].includes(t.status)) return true;
      return false;
    });
  }, [tickets, isNeedsAttentionMode]);

  const buildQuery = useCallback((offset: number, limit: number) => {
    if (!propertyId) return null;
    
    const propIds = propertyId === 'all' 
      ? (membership?.properties?.map(p => p.id) ?? [])
      : [propertyId];

    if (propIds.length === 0) return null;

    let q = supabase
      .from('tickets')
      .select(`id, title, description, status, priority, ticket_number, created_at, updated_at,
               property_id, organization_id, photo_before_url, is_internal,
               assignee:users!assigned_to(id, full_name, user_photo_url),
               creator:users!raised_by(id, full_name),
               ticket_escalation_logs(from_level, to_level, escalated_at,
                 from_employee:users!from_employee_id(full_name, user_photo_url),
                 to_employee:users!to_employee_id(full_name, user_photo_url))`);
                 
    if (propertyId === 'all') {
      q = q.in('property_id', propIds);
    } else {
      q = q.eq('property_id', propertyId);
    }

    q = q
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (isNeedsAttentionMode) {
        // Fetch all active tickets so we can client-side filter for needs attention
        q = q.not('status', 'in', '("resolved","closed")');
      } else if (statusFilter === 'mine') {
        q = q.eq('assigned_to', authUser?.id ?? '');
      } else if (statusFilter === 'open') {
        q = q.in('status', ['open', 'assigned']);
      } else if (statusFilter === 'in_progress') {
        q = q.in('status', ['in_progress']);
      } else if (statusFilter !== 'all') {
        q = q.eq('status', statusFilter);
      }

    if (dateRange !== 'all') {
      const now = new Date();
      const end = now.toISOString().split('T')[0] + 'T23:59:59';
      let start: string;
      if (dateRange === 'today') {
        start = now.toISOString().split('T')[0];
      } else if (dateRange === 'week') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        start = d.toISOString().split('T')[0];
      } else {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        start = d.toISOString().split('T')[0];
      }
      q = q.gte('created_at', start).lte('created_at', end);
    }

    return q;
  }, [propertyId, statusFilter, dateRange, supabase, isNeedsAttentionMode]);

  const fetchTickets = useCallback(async (reset = false) => {
    if (!propertyId) return;
    if (reset) setLoading(true);
    try {
      const q = buildQuery(0, PAGE_SIZE + 1);
      if (!q) return;
      const { data, error } = await q;
      let items: Ticket[] = (data ?? []) as Ticket[];
      if (error && error.code === 'PGRST116') {
        // No rows — not an error, just empty
        items = [];
      } else if (error) {
        throw error;
      }
      const hasMoreItems = items.length > PAGE_SIZE;
      setTickets(items.slice(0, PAGE_SIZE));
      setHasMore(hasMoreItems);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setTickets([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [propertyId, buildQuery]);

  const { refetch } = useDashboardFetch(queryKeys.property.tickets(propertyId), fetchTickets, {
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!isNeedsAttentionMode) fetchStatusCounts();
  }, [statusFilter, dateRange, isNeedsAttentionMode]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || !propertyId) return;
    setLoadingMore(true);
    try {
      const q = buildQuery(tickets.length, PAGE_SIZE + 1);
      if (!q) return;
      const { data, error } = await q;
      let items: Ticket[] = (data ?? []) as Ticket[];
      if (error && error.code === 'PGRST116') items = [];
      else if (error) throw error;
      setTickets(prev => [...prev, ...items.slice(0, PAGE_SIZE)]);
      setHasMore(items.length > PAGE_SIZE);
    } catch (err) {
      console.error('Error loading more:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const fetchStatusCounts = async () => {
  // Reset counts to avoid stale values while loading new data
  setStatusCounts({ all: 0, mine: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 });
    if (!propertyId) return;
    try {
      const counts: Record<StatusFilter, number> = {
        all: 0, mine: 0, open: 0, in_progress: 0, resolved: 0, closed: 0,
      };

      const propIds = propertyId === 'all'
        ? (membership?.properties?.map(p => p.id) ?? [])
        : [propertyId];

      if (propIds.length === 0) {
        setStatusCounts(counts);
        return;
      }

      const getDateRange = (range: DateRangeFilter) => {
        const now = new Date();
        const end = now.toISOString().split('T')[0] + 'T23:59:59';
        if (range === 'today') return { start: now.toISOString().split('T')[0], end };
        if (range === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); return { start: d.toISOString().split('T')[0], end }; }
        if (range === 'month') { const d = new Date(now); d.setDate(d.getDate() - 30); return { start: d.toISOString().split('T')[0], end }; }
        return { start: '1970-01-01', end };
      };
      const { start, end } = getDateRange(dateRange);

      const applyDateFilter = (q: any) => {
        if (dateRange !== 'all') {
          return q.gte('created_at', start).lte('created_at', end);
        }
        return q;
      };

      const applyPropertyFilter = (q: any) => {
        if (propertyId === 'all') {
          return q.in('property_id', propIds);
        }
        return q.eq('property_id', propertyId);
      };

      const { count: allCount } = await applyDateFilter(
        applyPropertyFilter(
          supabase
            .from('tickets').select('id', { count: 'exact', head: true })
        )
      ) as any;
      counts.all = allCount ?? 0;

      const { count: mineCount } = await applyDateFilter(
        applyPropertyFilter(
          supabase
            .from('tickets').select('id', { count: 'exact', head: true })
            .eq('assigned_to', authUser?.id ?? '')
        )
      ) as any;
      counts.mine = mineCount ?? 0;

      const { count: openCount } = await applyDateFilter(
        applyPropertyFilter(
          supabase
            .from('tickets').select('id', { count: 'exact', head: true })
            .in('status', ['open', 'assigned'])
        )
      ) as any;
      counts.open = openCount ?? 0;

      const { count: progressCount } = await applyDateFilter(
        applyPropertyFilter(
          supabase
            .from('tickets').select('id', { count: 'exact', head: true })
            .in('status', ['in_progress'])
        )
      ) as any;
      counts.in_progress = progressCount ?? 0;

      const { count: resolvedCount } = await applyDateFilter(
        applyPropertyFilter(
          supabase
            .from('tickets').select('id', { count: 'exact', head: true })
            .eq('status', 'resolved')
        )
      ) as any;
      counts.resolved = resolvedCount ?? 0;

      const { count: closedCount } = await applyDateFilter(
        applyPropertyFilter(
          supabase
            .from('tickets').select('id', { count: 'exact', head: true })
            .eq('status', 'closed')
        )
      ) as any;
      counts.closed = closedCount ?? 0;

      setStatusCounts(counts);
    } catch (err) {
      console.error('Error fetching status counts:', err);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    refetch();
  };


  // Override status filter to 'all' when entering needs-attention mode
  useEffect(() => {
    if (isNeedsAttentionMode && statusFilter !== 'all') {
      setStatusFilter('all');
    }
  }, [isNeedsAttentionMode]);

  const renderTicket = ({ item }: { item: Ticket }) => {
    const logs = item.ticket_escalation_logs;
    let escalationChain: { name: string; avatar?: string | null }[] | undefined;
    if (logs && logs.length > 0) {
      const sorted = [...logs].sort(
        (a, b) => new Date(a.escalated_at).getTime() - new Date(b.escalated_at).getTime()
      );
      escalationChain = [];
      sorted.forEach((log, i) => {
        if (i === 0 && log.from_employee?.full_name) {
          escalationChain!.push({ name: log.from_employee.full_name, avatar: log.from_employee.user_photo_url ?? undefined });
        }
        if (log.to_employee?.full_name) {
          escalationChain!.push({ name: log.to_employee.full_name, avatar: log.to_employee.user_photo_url ?? undefined });
        }
      });
      if (escalationChain.length === 0) escalationChain = undefined;
    }
    return (
      <TicketListItem
        id={item.id}
        title={item.title}
        status={item.status}
        priority={item.priority ?? 'medium'}
        ticketNumber={item.ticket_number ?? item.id.slice(0, 8).toUpperCase()}
        createdAt={item.created_at}
        assignedTo={item.assignee?.full_name}
        assigneePhotoUrl={item.assignee?.user_photo_url}
        photoUrl={item.photo_before_url ?? undefined}
        escalationChain={escalationChain}
        onPress={() => router.push(`/property/${propertyId}/tickets/${item.id}`)}
      />
    );
  };

  const bg = isDark ? '#0F1521' : '#F5F0E8';
  const cardBg = isDark ? 'rgba(30,38,55,0.88)' : 'rgba(255,255,255,0.88)';
  const textPrimary = isDark ? '#F0F4F8' : '#1A2332';
  const textSecondary = isDark ? '#A0AEC0' : '#64748B';
  const borderColor = isDark ? 'rgba(80,100,130,0.30)' : 'rgba(180,195,210,0.35)';

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <LinearGradient 
        colors={isDark ? ['#0F1521', '#121824', '#090d16'] : ['#F5F0E8', '#EAE0D5', '#DFD3C3']} 
        style={StyleSheet.absoluteFillObject} 
      />

      <View style={[styles.container, { paddingBottom: 0 }]}>
        {/* Modern Header */}
        <SafeBlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.headerTitleMain, { color: textPrimary }]}>
              {isNeedsAttentionMode ? 'Needs Attention' : 'Requests'}
            </Text>
            <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.headerAddBtn}>
              <Ionicons name="add" size={24} color={textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Filter Tabs - Glass Style */}
          {!isNeedsAttentionMode && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabScroll}
              style={styles.tabBarContainer} showsVerticalScrollIndicator={false}>
              {FILTER_TABS.map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.tab,
                    statusFilter === tab.key && {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)',
                    },
                  ]}
                  onPress={() => setStatusFilter(tab.key)}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: statusFilter === tab.key ? textPrimary : textSecondary },
                      statusFilter === tab.key && { fontWeight: '800' },
                    ]}
                  >
                    {tab.label}
                  </Text>
                  <View style={[styles.countBadge, {
                    backgroundColor: statusFilter === tab.key ? '#7CB9A8' : 'rgba(124,185,168,0.2)',
                  }]}>
                    <Text style={[styles.countBadgeText, { color: statusFilter === tab.key ? '#FFF' : '#7CB9A8' }]}>
                      {statusCounts[tab.key]}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {isNeedsAttentionMode && (
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: textSecondary, fontWeight: '600' }}>
                Critical, tenant & stale tickets
              </Text>
            </View>
          )}
        </SafeBlurView>

        {/* Date Range Filter */}
        <View style={[styles.dateFilterRow, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            style={styles.dateFilterBtn}
            onPress={() => setShowDateFilter(!showDateFilter)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={15} color={textSecondary} />
            <Text style={[styles.dateFilterLabel, { color: textSecondary }]}>
              {DATE_RANGES.find(d => d.key === dateRange)?.label ?? 'All Time'}
            </Text>
            <Ionicons
              name={showDateFilter ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Date Range Dropdown */}
        {showDateFilter && (
          <View style={[styles.dateFilterDropdown, { backgroundColor: cardBg, borderColor }]}>
            {DATE_RANGES.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.dateFilterOption,
                  dateRange === opt.key && { backgroundColor: isDark ? 'rgba(124,185,168,0.12)' : 'rgba(124,185,168,0.08)' },
                ]}
                onPress={() => { setDateRange(opt.key); setShowDateFilter(false); }}
              >
                <Text style={[styles.dateFilterOptionText, {
                  color: dateRange === opt.key ? '#7CB9A8' : textSecondary,
                  fontWeight: dateRange === opt.key ? '700' : '500',
                }]}>
                  {opt.label}
                </Text>
                {dateRange === opt.key && (
                  <Ionicons name="checkmark" size={16} color="#7CB9A8" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Ticket List */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#7CB9A8" />
          </View>
        ) : displayedTickets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="ticket-outline" size={64} color={isDark ? '#4B5563' : '#CBD5E1'} />
            <Text style={[styles.emptyTitle, { color: textPrimary }]}>No Requests</Text>
            <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
              {isNeedsAttentionMode
                ? 'No tickets need attention right now. Great job!'
                : statusFilter === 'all'
                  ? 'No requests found for this property.'
                  : `No ${statusFilter.replace('_', ' ')} requests.`}
            </Text>
            <TouchableOpacity
              style={styles.emptyCreateBtn}
              onPress={() => setShowCreateModal(true)}
            >
              <Text style={styles.emptyCreateBtnText}>Raise a Request</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={displayedTickets}
            renderItem={renderTicket}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#7CB9A8"
                colors={['#7CB9A8']}
              />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator size="small" color="#7CB9A8" />
                </View>
              ) : hasMore ? (
                <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore}>
                  <Text style={styles.loadMoreBtnText}>Load More</Text>
                </TouchableOpacity>
              ) : null
            }
          />
        )}


      </View>

        <TicketCreateModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          propertyId={propertyId ?? ''}
          organizationId={orgId}
          role={(membership as any)?.role === 'org_super_admin' ? 'super_admin' : ((membership as any)?.role === 'property_admin' ? 'admin' : 'tenant')}
        />




    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleMain: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  headerAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBarContainer: {
    marginTop: 0,
  },
  tabScroll: {
    gap: 8,
    flexDirection: 'row',
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  countBadge: {
    marginLeft: 8,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  dateFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  dateFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  dateFilterLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  dateFilterDropdown: {
    position: 'absolute',
    top: 180,
    left: 20,
    right: 20,
    borderRadius: 16,
    borderWidth: 1,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  dateFilterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateFilterOptionText: {
    fontSize: 14,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 100,
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreBtn: {
    marginVertical: 16,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#7CB9A8',
    borderRadius: 20,
  },
  loadMoreBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyCreateBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#7CB9A8',
    borderRadius: 12,
  },
  emptyCreateBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7CB9A8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(124,185,168,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalForm: { flex: 1 },
  field: { marginBottom: 20 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    height: 120,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mediaPlaceholder: {
    height: 100,
    borderStyle: 'dashed',
    borderWidth: 2,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  mediaPlaceholderText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mediaPreview: {
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeMedia: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  submitBtn: {
    flexDirection: 'row',
    backgroundColor: '#7CB9A8',
    padding: 18,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 40,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  successView: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  successText: {
    fontSize: 22,
    fontWeight: '900',
    marginTop: 20,
    marginBottom: 8,
  },
  successSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
});
