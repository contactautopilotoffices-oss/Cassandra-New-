'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// ─── Fuzzy Search Helper ──────────────────────────────────────────────────────
function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (lower.includes(q)) return true;
  const textWords = lower.split(/\s+/);
  const queryWords = q.split(/\s+/);
  for (const qw of queryWords) {
    if (qw.length < 2) continue;
    if (textWords.some(word => word.startsWith(qw))) return true;
  }
  let ti = 0;
  for (const ch of q) {
    const idx = lower.indexOf(ch, ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Dimensions,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInDown,
  FadeInUp,
  interpolate,
} from 'react-native-reanimated';
import { useAuth } from '@/hooks/useAuth';
import { useWeather, type WeatherCondition } from '@/hooks/useWeather';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import WeatherBadge from '@/components/dashboard/WeatherBadge';
import ShareModal from '@/components/shared/ShareModal';
import { useGamification, LeaderboardEntry as GamificationEntry } from '@/hooks/mst/useGamification';
import { createClient } from '@/utils/supabase/client';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/context';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import FloatingMenu from '@/components/ui/FloatingMenu';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Types
export type TabKey = 'dashboard' | 'requests' | 'daily-board' | 'flow-map' | 'visitors' | 'diesel' | 'electricity' | 'checklist' | 'settings' | 'profile';

interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  assigned_to?: string | null;
  assignee?: {
    full_name: string;
    email: string;
    user_photo_url?: string | null;
  } | null;
  sla_due_at?: string;
  department?: string;
}

interface MSTStats {
  total: number;
  active: number;
  completed: number;
  myActive: number;
  myCompleted: number;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  property: string;
  score: number;
  avatar?: string;
  user_id: string;
  // Gamification extras
  tickets_resolved?: number;
  sla_met_count?: number;
  first_time_fixes?: number;
  streak_days?: number;
  badges?: Array<{
    code: string;
    name: string;
    icon: string;
    color: string;
    tier: string;
    earned_at: string;
  }>;
}

interface MstDashboardProps {
  propertyId: string;
}

// KPI Card Component
const KPICard = React.memo(function KPICard({ value, label, color, delay = 0, labelColor }: { value: number; label: string; color: string; delay?: number; labelColor?: string }) {
  const { theme } = useTheme();
  const textSecondary = Colors[theme].textSecondary;
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()} style={styles.kpiCard}>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: labelColor ?? textSecondary }]}>{label}</Text>
    </Animated.View>
  );
});

const TicketCard = React.memo(function TicketCard({ ticket, onPress, index, onEdit, onShare }: { ticket: Ticket; onPress: () => void; index: number; onEdit?: () => void; onShare?: () => void }) {
  const getPriorityColor = () => {
    switch (ticket.priority?.toLowerCase()) {
      case 'urgent':
      case 'critical':
        return { bg: 'rgba(239,68,68,0.15)', text: '#EF4444', border: 'rgba(239,68,68,0.25)' };
      case 'high':
        return { bg: 'rgba(249,115,22,0.15)', text: '#F97316', border: 'rgba(249,115,22,0.25)' };
      case 'medium':
        return { bg: 'rgba(71,85,105,0.10)', text: '#475569', border: 'rgba(71,85,105,0.20)' };
      default:
        return { bg: 'rgba(100,116,139,0.15)', text: '#94A3B8', border: 'rgba(100,116,139,0.25)' };
    }
  };

  const priorityColors = getPriorityColor();
  
  const slaTime = ticket.sla_due_at 
    ? new Date(ticket.sla_due_at).getTime() - Date.now()
    : null;
  const slaHours = slaTime ? Math.floor(slaTime / (1000 * 60 * 60)) : 0;
  const slaMinutes = slaTime ? Math.floor((slaTime % (1000 * 60 * 60)) / (1000 * 60)) : 0;

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()} style={styles.ticketCardWrapper}>
      <TouchableOpacity style={styles.ticketCard} onPress={onPress} activeOpacity={0.9}>
        {/* Header */}
        <View style={styles.ticketHeader}>
          <View style={styles.ticketTitleRow}>
            <Text style={styles.ticketTitle} numberOfLines={2}>{ticket.title}</Text>
            <View style={styles.ticketActions}>
              {onEdit && (
                <TouchableOpacity style={styles.iconButton} onPress={onEdit}>
                  <Ionicons name="create-outline" size={16} color="rgba(255,255,255,0.45)" />
                </TouchableOpacity>
              )}
              {onShare && (
                <TouchableOpacity style={styles.iconButton} onPress={onShare}>
                  <Ionicons name="share-outline" size={16} color="rgba(255,255,255,0.45)" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Priority & Status */}
        <View style={styles.ticketBadges}>
          <View style={[styles.badge, { backgroundColor: priorityColors.bg, borderColor: priorityColors.border }]}>
            <Text style={[styles.badgeText, { color: priorityColors.text }]}>{ticket.priority?.toUpperCase()}</Text>
          </View>
          <View style={[styles.badge, styles.statusBadge, { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.25)' }]}>
            <Text style={[styles.statusBadgeText, { color: '#8B5CF6' }]}>ASSIGNED</Text>
          </View>
        </View>

        {/* Assignee */}
        <View style={styles.assigneeRow}>
          <View style={styles.assigneeAvatar}>
            <Text style={styles.assigneeInitials}>
              {ticket.assignee?.full_name?.[0] || 'M'}
            </Text>
          </View>
          <Text style={[styles.assigneeName, { color: 'rgba(255,255,255,0.75)' }]}>{ticket.assignee?.full_name || 'Unassigned'}</Text>
        </View>

        {/* SLA */}
        {slaTime && (
          <View style={styles.slaRow}>
            <Ionicons name="time-outline" size={14} color="#EF4444" />
            <Text style={[styles.slaText, { color: '#EF4444' }]}>
              {slaHours}h {slaMinutes}m
            </Text>
          </View>
        )}

        {/* Ticket Number & Date */}
        <View style={styles.ticketMeta}>
          <Text style={styles.ticketNumber}>{ticket.ticket_number}</Text>
          <Text style={styles.ticketDate}>
            {new Date(ticket.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
        </View>

        {/* Action Button */}
        <TouchableOpacity style={styles.viewButton} onPress={onPress}>
          <Text style={styles.viewButtonText}>View Ticket</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
});

// Leaderboard Entry Component
const LeaderboardEntry = React.memo(function LeaderboardEntry({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const getRankStyle = () => {
    switch (entry.rank) {
      case 1: return { bg: '#708F96', text: '#fff' };
      case 2: return { bg: '#C0C0C0', text: '#000' };
      case 3: return { bg: '#CD7F32', text: '#fff' };
      default: return { bg: 'rgba(255,255,255,0.10)', text: 'rgba(255,255,255,0.60)' };
    }
  };

  const rankStyle = getRankStyle();

  return (
    <Animated.View entering={FadeInDown.delay(index * 100).springify()} style={styles.leaderboardEntry}>
      <View style={[styles.rankBadge, { backgroundColor: rankStyle.bg }]}>
        <Text style={[styles.rankText, { color: rankStyle.text }]}>{entry.rank}</Text>
      </View>
      <View style={styles.leaderboardAvatar}>
        <Text style={styles.leaderboardAvatarText}>{entry.name[0]}</Text>
      </View>
      <View style={styles.leaderboardInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[styles.leaderboardName, { color: '#FFFFFF' }]}>{entry.name}</Text>
          {entry.badges && entry.badges.length > 0 && (
            <Ionicons name="medal" size={12} color={entry.badges[0].color} />
          )}
        </View>
        <Text style={[styles.leaderboardProperty, { color: 'rgba(255,255,255,0.45)' }]}>
          {entry.tickets_resolved ?? 0} resolved
          {(entry.streak_days ?? 0) > 0 && ` · ${entry.streak_days}d streak`}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.leaderboardScore, { color: '#FFFFFF' }]}>{entry.score.toLocaleString()}</Text>
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>pts</Text>
      </View>
    </Animated.View>
  );
});

// Main Dashboard Component
export default function NewMstDashboard({ propertyId }: MstDashboardProps) {
  const { user } = useAuth();
  const { weather } = useWeather();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const isMobile = width < 768;
  const insets = useSafeAreaInsets();

  // State
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<MSTStats>({
    total: 0,
    active: 0,
    completed: 0,
    myActive: 0,
    myCompleted: 0,
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [property, setProperty] = useState<{ name: string } | null>(null);
  const [countdown, setCountdown] = useState('00:00:00');
  const [searchQuery, setSearchQuery] = useState('');
  const [manualCondition, setManualCondition] = useState<WeatherCondition | null>(null);
  const [shareModalTicket, setShareModalTicket] = useState<Ticket | null>(null);

  // Gamification hook
  const { leaderboard: gamifyLb, myStats, loading: gamifyLoading, error: gamifyError, refetch: gamifyRefetch } = useGamification(propertyId);

  // Keep ref in sync with gamifyLb to avoid stale closure in fetchLeaderboard
  const gamifyLbRef = useRef(gamifyLb);
  useEffect(() => { gamifyLbRef.current = gamifyLb; }, [gamifyLb]);

  // Fetch data — gamifyLb.length removed from deps to break the cascading re-fetch loop
  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    await Promise.all([
      fetchProperty(),
      fetchTickets(),
      fetchStats(),
      fetchLeaderboard(),
    ]);
  }, [propertyId, user?.id]);

  const { refetch } = useDashboardFetch(queryKeys.property.mstDashboardNew(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5,
  });

  const fetchProperty = async () => {
    const { data } = await supabase
      .from('properties')
      .select('name')
      .eq('id', propertyId)
      .maybeSingle();
    if (data) setProperty(data);
  };

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchTickets = async () => {
    const { data, error } = await (supabase
      .from('tickets')
      .select(`
        *,
        assignee:users!assigned_to(id, full_name, email, user_photo_url)
      `)
      .eq('property_id', propertyId)
      .eq('is_internal', false)
      .order('created_at', { ascending: false })
      .limit(20) as any);

    if (!error && data) {
      setTickets(data);
    }
    setIsLoading(false);
  };

  const fetchStats = async () => {
    const [{ data: allData }, { data: activeData }, { data: completedData }] = await Promise.all([
      supabase
        .from('tickets')
        .select('id, status, assigned_to')
        .eq('property_id', propertyId),
      supabase
        .from('tickets')
        .select('id, assigned_to')
        .eq('property_id', propertyId)
        .not('status', 'in', '(resolved,closed)'),
      supabase
        .from('tickets')
        .select('id, assigned_to')
        .eq('property_id', propertyId)
        .in('status', ['resolved', 'closed']),
    ]);

    const all = allData || [];
    const active = activeData || [];
    const completed = completedData || [];
    const uid = user?.id;

    setStats({
      total: all.length,
      active: active.length,
      completed: completed.length,
      myActive: uid ? active.filter((t: any) => t.assigned_to === uid).length : 0,
      myCompleted: uid ? completed.filter((t: any) => t.assigned_to === uid).length : 0,
    });
  };

  const fetchLeaderboard = async () => {
    const { data: staffData, error } = await supabase
      .from('property_memberships')
      .select(`
        user_id,
        users:user_id(full_name, user_photo_url)
      `)
      .eq('property_id', propertyId)
      .in('role', ['mst', 'staff']);

    if (!error && staffData && staffData.length > 0) {
      // Build score lookup from gamification hook data — read from ref to avoid stale closure
      const scoreMap = new Map<string, GamificationEntry>();
      for (const entry of gamifyLbRef.current) {
        scoreMap.set(entry.user_id, entry);
      }

      const mergedLeaderboard: LeaderboardEntry[] = staffData.map((staff: any) => {
        const gamify = scoreMap.get(staff.user_id);
        return {
          rank: 0,
          name: staff.users?.full_name || 'Staff Member',
          property: 'Property',
          score: gamify?.score ?? 0,
          avatar: staff.users?.user_photo_url ?? undefined,
          user_id: staff.user_id,
          tickets_resolved: gamify?.tickets_resolved,
          sla_met_count: gamify?.sla_met_count,
          first_time_fixes: gamify?.first_time_fixes,
          streak_days: gamify?.streak_days,
          badges: gamify?.badges ?? [],
        };
      });

      // Sort by score descending, then assign ranks (handle ties)
      mergedLeaderboard.sort((a, b) => b.score - a.score);
      let rank = 1;
      for (let i = 0; i < mergedLeaderboard.length; i++) {
        if (i > 0 && mergedLeaderboard[i].score < mergedLeaderboard[i - 1].score) {
          rank = i + 1;
        }
        mergedLeaderboard[i].rank = rank;
      }

      setLeaderboard(mergedLeaderboard);
    } else {
      setLeaderboard([]);
    }
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refetch(), gamifyRefetch()]);
    setIsRefreshing(false);
  }, [refetch, gamifyRefetch]);

  const filteredTickets = useMemo(() => {
    if (!searchQuery) return tickets;
    return tickets.filter(t =>
      fuzzyMatch(t.title, searchQuery) ||
      fuzzyMatch(t.ticket_number, searchQuery) ||
      fuzzyMatch(t.description ?? '', searchQuery)
    );
  }, [tickets, searchQuery]);

  // Calculate grid columns based on width
  const getGridColumns = () => {
    if (width < 640) return 1;
    if (width < 1024) return 2;
    return 3;
  };

  const renderRequestsContent = () => (
    <ScrollView
      style={styles.contentScroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.pageHeader}>
        <View>
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Property Requests</Text>
          <Text style={styles.pageSubtitle}>
            {filteredTickets.length} request{filteredTickets.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search requests..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {filteredTickets.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#CBD5E1" />
          <Text style={styles.emptyStateText}>No requests found</Text>
        </View>
      ) : (
        filteredTickets.map((ticket, index) => (
          <View key={ticket.id} style={{ paddingVertical: 8 }}>
            <TicketCard
              ticket={ticket}
              index={index}
              onPress={() => router.push(`/property/${propertyId}/tickets/${ticket.id}` as any)}
              onEdit={() => router.push(`/property/${propertyId}/tickets/${ticket.id}?edit=true` as any)}
              onShare={() => setShareModalTicket(ticket)}
            />
          </View>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderDashboardContent = () => (
    <ScrollView
      style={styles.contentScroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Maintenance Dashboard</Text>
          <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>{property?.name || 'Property'} • MST: {user?.user_metadata?.full_name || 'MST Staff'}</Text>
        </View>
        <TouchableOpacity style={styles.customizeBtn}>
          <Ionicons name="options-outline" size={16} color="#64748B" />
          <Text style={styles.customizeText}>Customize</Text>
        </TouchableOpacity>
      </View>

      {/* KPI Cards */}
      <View style={styles.kpiContainer}>
        <KPICard value={stats.total} label="TOTAL" color={colors.primary} labelColor={colors.textSecondary} delay={0} />
        <KPICard value={stats.active} label="ACTIVE" color={colors.primary} labelColor={colors.textSecondary} delay={100} />
        <KPICard value={stats.completed} label="COMPLETED" color={colors.success} labelColor={colors.textSecondary} delay={200} />
      </View>

      {/* Property Requests Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Property Requests</Text>
            <Text style={styles.sectionSubtitle}>All requests for this property</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search requests..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Tickets Grid */}
        <View style={[styles.ticketsGrid, { flexDirection: getGridColumns() === 1 ? 'column' : 'row' }]}>
          {filteredTickets.slice(0, 6).map((ticket, index) => (
            <View key={ticket.id} style={{ flex: 1, minWidth: getGridColumns() === 1 ? '100%' : `${100 / getGridColumns()}%`, padding: 8 }}>
              <TicketCard
                ticket={ticket}
                index={index}
                onPress={() => router.push(`/property/${propertyId}/tickets/${ticket.id}` as any)}
                onEdit={() => router.push(`/property/${propertyId}/tickets/${ticket.id}?edit=true` as any)}
                onShare={() => setShareModalTicket(ticket)}
              />
            </View>
          ))}
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderDailyBoardContent = () => (
    <ScrollView
      style={styles.contentScroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Daily Top MSTs</Text>
          <Text style={styles.pageSubtitle}>Resets at Midnight: 12:00 AM local time</Text>
        </View>
      </View>

      {/* Countdown */}
      <View style={styles.countdownCard}>
        <Text style={styles.countdownLabel}>RESET IN</Text>
        <Text style={styles.countdownValue}>{countdown}</Text>
      </View>

      {/* Leaderboard */}
      <View style={styles.leaderboardContainer}>
        {leaderboard.map((entry, index) => (
          <LeaderboardEntry key={entry.user_id} entry={entry} index={index} />
        ))}
      </View>

      {/* Top Property */}
      <View style={styles.topPropertyCard}>
        <View>
          <Text style={styles.topPropertyLabel}>TOP PROPERTY TODAY</Text>
          <Text style={styles.topPropertyName}>{property?.name || 'Property'}</Text>
        </View>
        <Ionicons name="trophy" size={32} color="#708F96" />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderFlowMapContent = () => (
    <ScrollView
      style={styles.contentScroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Live Flow Map</Text>
          <Text style={styles.pageSubtitle}>Weekly Champion & Property Flow</Text>
        </View>
      </View>

      {/* Weekly Champion */}
      <View style={styles.championCard}>
        <View style={styles.championHeader}>
          <Text style={styles.championLabel}>WEEKLY CHAMPION</Text>
          <Ionicons name="star" size={16} color="#708F96" />
        </View>
        <View style={styles.championContent}>
          <View style={styles.championAvatar}>
            <Text style={styles.championAvatarText}>
              {leaderboard[0]?.name?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <View>
            <Text style={[styles.championName, { color: '#FFFFFF' }]}>{leaderboard[0]?.name || 'No champion yet'}</Text>
            <Text style={[styles.championScore, { color: '#708F96' }]}>
              {leaderboard[0]?.score.toLocaleString() ?? '0'} pts
            </Text>
            <Text style={[styles.championSub, { color: 'rgba(255,255,255,0.55)' }]}>
              {leaderboard[0]?.tickets_resolved ?? 0} tickets resolved
            </Text>
          </View>
        </View>
      </View>

      {/* Filter Pills */}
      <View style={styles.filterPills}>
        <TouchableOpacity style={[styles.filterPill, styles.criticalPill]}>
          <View style={[styles.pillDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.pillText}>Critical</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterPill, styles.highPill]}>
          <View style={[styles.pillDot, { backgroundColor: '#475569' }]} />
          <Text style={styles.pillText}>High</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterPill}>
          <Text style={styles.pillText}>Unassigned</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        {weather && <WeatherBackground condition={manualCondition || weather.condition} />}
        <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading dashboard...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {weather && <WeatherBackground condition={manualCondition || weather.condition} />}
      <View style={styles.mainContainer}>
        {/* Main Content */}
        <View style={styles.contentArea}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <View style={styles.topBarLeft}>
              <FloatingMenu
                title="Maintenance Portal"
                items={[
                  { label: 'Overview', icon: 'grid', onPress: () => setActiveTab('dashboard') },
                  { label: 'Requests', icon: 'ticket', onPress: () => setActiveTab('requests') },
                  { label: 'Leaderboard', icon: 'trophy', onPress: () => setActiveTab('daily-board') },
                  { label: 'Flow Map', icon: 'pulse', onPress: () => setActiveTab('flow-map') },
                  { label: 'Visitors', icon: 'people', onPress: () => router.push(`/property/${propertyId}/visitors` as any) },
                  { label: 'Diesel', icon: 'flame', onPress: () => router.push(`/property/${propertyId}/diesel` as any) },
                  { label: 'Electricity', icon: 'flash', onPress: () => router.push(`/property/${propertyId}/electricity` as any) },
                  { label: 'Checklists', icon: 'checkbox', onPress: () => router.push(`/property/${propertyId}/checklist` as any) },
                  { label: 'Settings', icon: 'settings', onPress: () => router.push(`/property/${propertyId}/settings` as any) },
                  { label: 'Profile', icon: 'person', onPress: () => setActiveTab('profile') },
                ]}
                footer={{ label: 'Sign Out', icon: 'log-out-outline', danger: true, onPress: () => router.push('/(auth)/login' as any) }}
              />
            </View>
            <View style={styles.topBarRight}>
              {weather && (
                <WeatherBadge
                  condition={manualCondition || weather.condition}
                  temperature={weather.temperature}
                  locationName={weather.locationName}
                  onChange={setManualCondition}
                />
              )}
              <TouchableOpacity style={styles.topBarButton}>
                <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.60)" />
                <View style={styles.notificationDot} />
              </TouchableOpacity>
              <View style={styles.onDutyBadge}>
                <View style={styles.onDutyDot} />
                <Text style={styles.onDutyText}>ON DUTY</Text>
                <Ionicons name="chevron-down" size={14} color="#64748B" />
              </View>
              <Text style={[styles.userName, { color: 'rgba(255,255,255,0.85)' }]}>{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'MST Staff'}</Text>
            </View>
          </View>

          {/* Content */}
          {activeTab === 'dashboard' && renderDashboardContent()}
          {activeTab === 'requests' && renderRequestsContent()}
          {activeTab === 'daily-board' && renderDailyBoardContent()}
          {activeTab === 'flow-map' && renderFlowMapContent()}
        </View>
      </View>

      {/* Share Modal */}
      {shareModalTicket && (
        <ShareModal
          isOpen={!!shareModalTicket}
          onClose={() => setShareModalTicket(null)}
          ticketId={shareModalTicket.id}
          ticketNumber={shareModalTicket.ticket_number}
          title={shareModalTicket.title}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor set via inline style with theme token (see JSX)
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#060912',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
  },

  // Sidebar
  sidebarContainer: {
    width: 280,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'column',
  },
  sidebarCollapsed: {
    width: 80,
  },
  sidebarHeader: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#708F96',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoIconText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  logoText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  logoSubtext: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1,
    marginTop: 2,
  },
  collapseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sidebarNav: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  navSection: {
    marginBottom: 24,
  },
  navSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.30)',
    letterSpacing: 1,
    marginBottom: 8,
    paddingLeft: 12,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 2,
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: 'rgba(112,143,150,0.15)',
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
  },
  navLabelActive: {
    color: '#708F96',
    fontWeight: '600',
  },
  sidebarFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  userCardCollapsed: {
    justifyContent: 'center',
    padding: 8,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(112,143,150,0.30)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(112,143,150,0.40)',
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#708F96',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  userRole: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.40)',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
  },
  signOutBtnCollapsed: {
    justifyContent: 'center',
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },

  // Content Area
  contentArea: {
    flex: 1,
    flexDirection: 'column',
  },

  // Mobile Sidebar Overlay
  mobileSidebarOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 280,
    zIndex: 10,
  },
  sidebarBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 5,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: 'rgba(10,15,25,0.80)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  topBarButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: 'rgba(10,15,25,0.80)',
  },
  onDutyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  onDutyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  onDutyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22C55E',
  },
  contentScroll: {
    flex: 1,
    padding: 24,
  },

  // Page Header
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
      },
  pageSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },
  customizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  customizeText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.70)',
  },

  // KPI Cards
  kpiContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.20,
    shadowRadius: 20,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  kpiValue: {
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 4,
      },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1,
      },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
      },
  sectionSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    color: '#FFFFFF',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '500',
  },

  // Tickets Grid
  ticketsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  ticketCardWrapper: {
    flex: 1,
  },
  ticketCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 3,
  },
  ticketHeader: {
    marginBottom: 12,
  },
  ticketTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  ticketTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 22,
      },
  ticketActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ticketBadges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusBadge: {
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  assigneeAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#708F96',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assigneeInitials: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  assigneeName: {
    fontSize: 13,
  },
  slaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  slaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ticketMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  ticketNumber: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.40)',
  },
  ticketDate: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.40)',
  },
  viewButton: {
    backgroundColor: 'rgba(112,143,150,0.85)',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Daily Board
  countdownCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  countdownLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1,
    marginBottom: 8,
      },
  countdownValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
      },
  leaderboardContainer: {
    gap: 12,
    marginBottom: 24,
  },
  leaderboardEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    fontSize: 14,
    fontWeight: '700',
  },
  leaderboardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#708F96',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  leaderboardAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 15,
    fontWeight: '600',
  },
  leaderboardProperty: {
    fontSize: 12,
  },
  leaderboardScore: {
    fontSize: 18,
    fontWeight: '700',
  },
  topPropertyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  topPropertyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1,
    marginBottom: 4,
  },
  topPropertyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Flow Map
  championCard: {
    backgroundColor: 'rgba(255,215,0,0.08)',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.20)',
  },
  championHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  championLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1,
  },
  championContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  championAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,215,0,0.20)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.30)',
  },
  championAvatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#708F96',
  },
  championName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  championScore: {
    fontSize: 24,
    fontWeight: '700',
  },
  championSub: {
    fontSize: 13,
  },
  filterPills: {
    flexDirection: 'row',
    gap: 12,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  criticalPill: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: 'rgba(239,68,68,0.25)',
  },
  highPill: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderColor: 'rgba(245,158,11,0.25)',
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },
});
