'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  ActivityIndicator,
  StatusBar,
  Alert,
  Pressable,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  runOnJS,
  interpolate,
  Extrapolate,
  useDerivedValue
} from 'react-native-reanimated';
import { 
  Gesture, 
  GestureDetector, 
  GestureHandlerRootView 
} from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createClient } from '../../utils/supabase/client';
import { serverApi } from '@/lib/serverApi';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '@/context';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import TicketCard from '../shared/TicketCard';
import SignOutModal from '../ui/SignOutModal';
import { TicketCreateModal } from '../tickets/TicketCreateModal';
import { AppBottomNav, TabKey } from '../shared/AppBottomNav';
import { LoggersMenu } from '../shared/LoggersMenu';
import { TicketShuffleStack } from '../shared/TicketShuffleStack';
import FloatingMenu from '@/components/ui/FloatingMenu';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import NotificationBell from '@/components/dashboard/NotificationBell';

// ---- Dotted Background Pattern ----
const DottedBackground = ({ color, isDark }: { color?: string; isDark: boolean }) => {
  const dotColor = color || (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)');
  return (
    <View style={StyleSheet.absoluteFill}>
       <Svg width="100%" height="100%">
        <Defs>
          <Pattern
            id="dotPattern"
            x="0"
            y="0"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <Circle cx="2" cy="2" r="1.2" fill={dotColor} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#dotPattern)" />
      </Svg>
    </View>
  );
};

// Types
type Tab = 'dashboard' | 'requests' | 'profile';

const DRAWER_WIDTH = 280;

interface Property {
  id: string;
  name: string;
  code: string;
  address: string;
  organization_id?: string;
}

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
  creator?: {
    full_name: string;
  } | null;
  photo_before_url?: string;
  raised_by?: string;
  internal?: boolean;
  property_id?: string;
  ticket_escalation_logs?: {
    from_level: number;
    to_level: number | null;
    escalated_at: string;
    from_employee?: { full_name: string; user_photo_url?: string | null } | null;
    to_employee?: { full_name: string; user_photo_url?: string | null } | null;
  }[];
}

// ─── Fuzzy Search Helper ──────────────────────────────────────────────────────
/**
 * Matches text against a query using:
 * 1. Exact substring (case-insensitive)
 * 2. Word prefix: query word matches the start of any word in the text
 * 3. Subsequence: all query chars appear in order (non-consecutive) in text
 */
function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;

  // 1. Exact substring
  if (lower.includes(q)) return true;

  // 2. Word prefix match: "cle" matches "Cleaning" because "Cle" is a prefix of "Cleaning"
  const textWords = lower.split(/\s+/);
  const queryWords = q.split(/\s+/);
  for (const qw of queryWords) {
    if (qw.length < 2) continue; // skip single-char words
    const match = textWords.some(word => word.startsWith(qw));
    if (match) return true;
  }

  // 3. Subsequence: all chars of query appear in order (non-consecutive) in text
  let ti = 0;
  for (const ch of q) {
    const idx = lower.indexOf(ch, ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}

// ─── Component Props ─────────────────────────────────────────────────────────
interface MstDashboardProps {
  propertyId: string;
}

export default function MstDashboard({ propertyId }: MstDashboardProps) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark, theme } = useTheme();

  // State
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [property, setProperty] = useState<Property | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [incomingTickets, setIncomingTickets] = useState<Ticket[]>([]);
  const [completedTickets, setCompletedTickets] = useState<Ticket[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [userRole, setUserRole] = useState('MST Professional');
  const [searchQuery, setSearchQuery] = useState('');
  const [requestFilter, setRequestFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Edit Modal State
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showLoggersMenu, setShowLoggersMenu] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statsData, setStatsData] = useState({ urgent: 0, rate: 0 });
  
  // Shift Management State
  const [isMstCheckedIn, setIsMstCheckedIn] = useState(false);
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [isCheckingInOut, setIsCheckingInOut] = useState(false);

  // Shared ticker — one interval drives all TicketCard elapsed timers
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    await Promise.all([
      fetchPropertyDetails(),
      fetchTickets(),
      fetchUserRole(),
      fetchShiftStatus(),
    ]);
  }, [propertyId, user?.id]);

  const { refetch } = useDashboardFetch(queryKeys.property.mstDashboardLegacy(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5,
  });

  // Sync tab from URL
  const { tab } = useLocalSearchParams<{ tab: string }>();
  useEffect(() => {
    if (tab === 'requests') {
      setActiveTab('requests');
    } else if (tab === 'overview') {
      setActiveTab('overview');
    }
  }, [tab]);

  const fetchShiftStatus = async () => {
    if (!user?.id || !propertyId) return;
    try {
      // 1. Get status from resolver_stats
      const { data: rsData }: any = await supabase
        .from('resolver_stats')
        .select('is_checked_in')
        .eq('user_id', user.id)
        .eq('property_id', propertyId)
        .single();

      if (rsData) {
        setIsMstCheckedIn(rsData.is_checked_in);
      }

      // TODO: shift_logs does not exist in saas_one schema
      // // 2. Get active shift log if any
      // const { data: shiftData }: any = await supabase
      //   .from('shift_logs')
      //   .select('id')
      //   .eq('user_id', user.id)
      //   .eq('property_id', propertyId)
      //   .eq('status', 'active')
      //   .order('check_in_at', { ascending: false })
      //   .limit(1)
      //   .maybeSingle();
      // if (shiftData) {
      //   setActiveShiftId(shiftData.id);
      //   setIsMstCheckedIn(true); // Sync with logs
      // }
    } catch (error) {
      console.error('Error fetching shift status:', error);
    }
  };

  const toggleMstShift = async () => {
    if (!user?.id || !propertyId || isCheckingInOut) return;
    
    setIsCheckingInOut(true);
    const newStatus = !isMstCheckedIn;

    try {
      // TODO: shift_logs does not exist in saas_one schema
      // if (newStatus) {
      //   // --- CHECK IN ---
      //   const { data: newShift, error: shiftErr }: any = await (supabase
      //     .from('shift_logs') as any)
      //     .insert({
      //       user_id: user.id,
      //       property_id: propertyId,
      //       status: 'active',
      //       check_in_at: new Date().toISOString()
      //     })
      //     .select()
      //     .single();
      //   if (shiftErr) throw shiftErr;
      //   setActiveShiftId(newShift.id);
      // } else {
      //   // --- CHECK OUT ---
      //   if (activeShiftId) {
      //     const { error: shiftErr } = await (supabase
      //       .from('shift_logs') as any)
      //       .update({
      //         status: 'completed',
      //         check_out_at: new Date().toISOString()
      //       })
      //       .eq('id', activeShiftId);
      //     if (shiftErr) throw shiftErr;
      //   }
      //   setActiveShiftId(null);
      // }

      // Update resolver_stats for load balancing
      const { error: rsErr } = await (supabase
        .from('resolver_stats') as any)
        .update({ is_checked_in: newStatus })
        .eq('user_id', user.id)
        .eq('property_id', propertyId);

      if (rsErr) throw rsErr;

      setIsMstCheckedIn(newStatus);
      Alert.alert('Shift Updated', `You are now ${newStatus ? 'ON DUTY' : 'OFF DUTY'}.`);
    } catch (error: any) {
      console.error('Shift toggle error:', error);
      Alert.alert('Error', error.message || 'Failed to update shift status');
    } finally {
      setIsCheckingInOut(false);
    }
  };

  const fetchUserRole = async () => {
    if (!user) return;
    const { data: member } = await (supabase
      .from('property_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('property_id', propertyId)
      .single() as any);

    if (member) {
      setUserRole(member.role.replace('_', ' '));
    } else {
      const { data: orgMember } = await (supabase
        .from('organization_memberships')
        .select('role')
        .eq('user_id', user.id)
        .single() as any);
      if (orgMember) setUserRole(orgMember.role.replace('_', ' '));
    }
  };

  const fetchTickets = async () => {
    if (!user || !propertyId) return;
    setIsFetching(true);

    const { data, error } = await (supabase
      .from('tickets')
      .select(`
        *,
        assignee:users!assigned_to(id, full_name, email, user_photo_url),
        creator:users!raised_by(id, full_name),
        ticket_escalation_logs(from_level, to_level, escalated_at, from_employee:users!from_employee_id(full_name, user_photo_url), to_employee:users!to_employee_id(full_name, user_photo_url))
      `)
      .eq('property_id', propertyId)

      .order('created_at', { ascending: false }) as any);

    if (error) {
      console.error('Error fetching tickets:', error);
    } else {
      const tickets = data || [];
      const active = tickets.filter((t: any) => !['resolved', 'closed'].includes(t.status));
      const completed = tickets.filter((t: any) => ['resolved', 'closed'].includes(t.status));
      const urgentCount = active.filter((t: any) => t.priority === 'urgent' || t.priority === 'high').length;
      const completionRate = tickets.length > 0 ? Math.round((completed.length / tickets.length) * 100) : 0;
      
      setIncomingTickets(active);
      setCompletedTickets(completed);
      setStatsData({
        urgent: urgentCount,
        rate: completionRate
      });
    }
    setIsFetching(false);
  };

  const fetchPropertyDetails = async () => {
    setIsLoading(true);
    setErrorMsg('');

    const { data, error } = await (supabase
      .from('properties')
      .select('*')
      .eq('id', propertyId)
      .maybeSingle() as any);

    if (error || !data) {
      console.error('Property fetch error:', error);
      setErrorMsg(`Property not found (ID: ${propertyId})`);
    } else {
      setProperty(data);
    }
    setIsLoading(false);
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const handleUpdateTicket = async () => {
    if (!editingTicket || !editTitle.trim()) return;
    setIsUpdating(true);
    try {
      const { error } = await serverApi.query({
        table: 'tickets',
        action: 'update',
        values: { title: editTitle, description: editDescription },
        filters: [{ op: 'eq', column: 'id', value: editingTicket.id }],
      });

      if (error) throw error;
      setEditingTicket(null);
      fetchTickets();
    } catch (error) {
      console.error('Update ticket error:', error);
      Alert.alert('Error', 'Failed to update ticket');
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredIncomingTickets = useMemo(() => {
    if (!searchQuery) return incomingTickets;
    return incomingTickets.filter(t =>
      fuzzyMatch(t.title, searchQuery) ||
      fuzzyMatch(t.ticket_number, searchQuery) ||
      fuzzyMatch(t.description ?? '', searchQuery)
    );
  }, [incomingTickets, searchQuery]);

  const filteredCompletedTickets = useMemo(() => {
    if (!searchQuery) return completedTickets;
    return completedTickets.filter(t =>
      fuzzyMatch(t.title, searchQuery) ||
      fuzzyMatch(t.ticket_number, searchQuery) ||
      fuzzyMatch(t.description ?? '', searchQuery)
    );
  }, [completedTickets, searchQuery]);

  const totalTickets = incomingTickets.length + completedTickets.length;
  const activeCount = incomingTickets.filter(t =>
    t.status === 'in_progress' || t.status === 'assigned' || t.status === 'open'
  ).length;
  const completedCount = completedTickets.length;

  // ---- Get User Initials ----
  function getInitials(name: string): string {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  }

  const renderDashboardTab = () => (
    <LinearGradient 
      colors={isDark ? ['#0F172A', '#1E293B'] : ['#FFFFFF', '#F9FBFF']}
      style={styles.tabContent}
    >
      <DottedBackground isDark={isDark} />
      <ScrollView 
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* High-Fidelity Header Row */}
        <View style={mstStyles.premiumHeader}>
          <Text style={[mstStyles.headerContext, { color: colors.textSecondary }]}>
            {(property?.name || 'HEAD OFFICE').toUpperCase()} • MST: {(user?.user_metadata?.full_name || 'MST HO').toUpperCase()}
          </Text>

          <TouchableOpacity 
            style={[
              mstStyles.premiumShiftToggle, 
              { 
                backgroundColor: isMstCheckedIn ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)', 
                borderColor: isMstCheckedIn ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)' 
              }
            ]}
            onPress={toggleMstShift}
            disabled={isCheckingInOut}
          >
            {isCheckingInOut ? (
              <ActivityIndicator size="small" color={isMstCheckedIn ? '#10B981' : '#EF4444'} />
            ) : (
              <>
                <View style={[mstStyles.statusDot, { backgroundColor: isMstCheckedIn ? '#10B981' : '#EF4444' }]} />
                <Text style={[mstStyles.shiftToggleText, { color: isMstCheckedIn ? '#10B981' : '#EF4444' }]}>
                  {isMstCheckedIn ? 'ON DUTY' : 'OFF DUTY'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Statistics Grid - Squared Glass Cards */}
        <View style={mstStyles.premiumStatsGrid}>
          {/* Total Card */}
          <TouchableOpacity 
            style={[mstStyles.squareGlassCard, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.18)' : 'rgba(99, 102, 241, 0.1)', borderColor: isDark ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.25)', borderWidth: 1.5 }]}
            onPress={() => setRequestFilter('all')}
          >
            {Platform.OS === 'ios' && <SafeBlurView intensity={isDark ? 20 : 30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
            <View style={mstStyles.squareCardContent}>
              <Text style={[mstStyles.squareStatNumber, { color: isDark ? '#A5B4FC' : '#6366F1' }]}>{totalTickets}</Text>
              <Text style={[mstStyles.squareStatLabel, { color: isDark ? '#A5B4FC' : '#6366F1', opacity: 0.8 }]}>TOTAL</Text>
              <View style={mstStyles.squareStatAction}>
                <Ionicons name="layers-outline" size={10} color={isDark ? '#A5B4FC' : '#6366F1'} />
                <Text style={[mstStyles.squareStatActionText, { color: isDark ? '#A5B4FC' : '#6366F1' }]}>All Tasks</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Active Card */}
          <TouchableOpacity 
            style={[mstStyles.squareGlassCard, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.08)' }]}
            onPress={() => setRequestFilter('active')}
          >
            {Platform.OS === 'ios' && <SafeBlurView intensity={isDark ? 20 : 30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
            <View style={mstStyles.squareCardContent}>
              <Text style={[mstStyles.squareStatNumber, { color: '#3B82F6' }]}>{activeCount}</Text>
              <Text style={[mstStyles.squareStatLabel, { color: colors.textSecondary }]}>ACTIVE</Text>
            </View>
          </TouchableOpacity>

          {/* Done Card */}
          <TouchableOpacity 
            style={[mstStyles.squareGlassCard, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)' }]}
            onPress={() => setRequestFilter('completed')}
          >
            {Platform.OS === 'ios' && <SafeBlurView intensity={isDark ? 20 : 30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
            <View style={mstStyles.squareCardContent}>
              <Text style={[mstStyles.squareStatNumber, { color: '#10B981' }]}>{completedCount}</Text>
              <Text style={[mstStyles.squareStatLabel, { color: colors.textSecondary }]}>DONE</Text>
              <Text style={[mstStyles.squareStatActionText, { color: '#10B981' }]}>{Math.round((completedCount/Math.max(1, totalTickets))*100)}% Rate</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={mstStyles.searchContainer}>
          <View style={[mstStyles.searchBar, { backgroundColor: isDark ? 'rgba(30, 41, 59, 0.8)' : '#FFF', borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
            <TextInput 
              placeholder="Search requests..."
              placeholderTextColor={colors.textSecondary}
              style={[mstStyles.searchInput, { color: colors.textPrimary }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Property Requests Header */}
        <View style={mstStyles.requestsHeaderRow}>
          <View>
            <Text style={[mstStyles.requestsTitle, { color: colors.textPrimary }]}>Property Requests</Text>
            <Text style={[mstStyles.requestsSubtitle, { color: colors.textSecondary }]}>All requests for this property</Text>
          </View>
          <TouchableOpacity onPress={() => setActiveTab('requests')} style={mstStyles.viewAllBtn}>
            <Text style={mstStyles.viewAllText}>View All</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Shuffled Stack Section */}
        <View style={[mstStyles.stackSection, { height: 320, justifyContent: 'center' }]}>
          <TicketShuffleStack 
            tickets={incomingTickets} 
            user={user} 
            propertyId={propertyId} 
            tick={tick}
            onEdit={(t) => {
              setEditingTicket(t as any);
              setEditTitle(t.title);
              setEditDescription(t.description || '');
            }} 
          />
        </View>

        {/* Recent Completed List */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 12 }]}>Recently Resolved</Text>
          {completedTickets.slice(0, 3).map(ticket => (
            <TicketCard 
              key={ticket.id}
              id={ticket.id}
              title={ticket.title}
              priority={ticket.priority as any}
              status="COMPLETED"
              ticketNumber={ticket.ticket_number}
              createdAt={ticket.created_at}
              tick={tick}
              onClick={() => router.push(`/property/${propertyId}/tickets/${ticket.id}` as any)}
              style={{ marginBottom: 12 }}
            />
          ))}
          {completedTickets.length === 0 && (
            <View style={[styles.emptyState, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F1F5F9', borderRadius: 20 }]}>
              <Ionicons name="checkmark-circle-outline" size={40} color={colors.textSecondary} />
              <Text style={styles.emptyStateText}>No resolved tickets yet</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </LinearGradient>
  );

  const renderRequestsTab = () => (
    <ScrollView 
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Filter Tabs */}
      <View style={[styles.filterContainer, { backgroundColor: colors.background }]}>
        {([
          { key: 'all' as const, label: 'All', count: totalTickets },
          { key: 'active' as const, label: 'Active', count: activeCount },
          { key: 'completed' as const, label: 'Completed', count: completedCount },
        ]).map(({ key, label, count }) => {
          const isActive = requestFilter === key;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterTab,
                { 
                  backgroundColor: colors.surface, 
                  borderColor: colors.border,
                },
                isActive && { 
                  backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)', 
                  borderColor: colors.primary 
                }
              ]}
              onPress={() => setRequestFilter(key)}
            >
              <Text style={[
                styles.filterTabText,
                { color: colors.textSecondary },
                isActive && { color: colors.primary }
              ]}>
                {label}
              </Text>
              <Text style={[
                styles.filterTabCount,
                { color: colors.textTertiary },
                isActive && { color: colors.primary, fontWeight: '700' }
              ]}>
                {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tickets List */}
      <View style={[styles.ticketsList, { backgroundColor: colors.background, paddingHorizontal: 20 }]}>
        {(requestFilter === 'all' || requestFilter === 'active') && filteredIncomingTickets.map((ticket) => {
          // Calculate escalation chain
          const logs = ticket.ticket_escalation_logs;
          let escalationChain = undefined;
          if (logs && logs.length > 0) {
            const sorted = [...logs].sort((a, b) => new Date(a.escalated_at).getTime() - new Date(b.escalated_at).getTime());
            const chain: { name: string; avatar?: string | null }[] = [];
            sorted.forEach((log: any, i: number) => {
              if (i === 0 && log.from_employee?.full_name) chain.push({ name: log.from_employee.full_name, avatar: log.from_employee.user_photo_url ?? null });
              if (log.to_employee?.full_name) chain.push({ name: log.to_employee.full_name, avatar: log.to_employee.user_photo_url ?? null });
            });
            if (chain.length > 0) escalationChain = chain;
          }

          return (
            <TicketCard
              key={ticket.id}
              id={ticket.id}
              title={ticket.title}
              priority={(ticket.priority?.toUpperCase() as any) || 'MEDIUM'}
              status={
                ticket.status === 'in_progress' ? 'IN_PROGRESS' :
                ticket.assigned_to ? 'ASSIGNED' : 'OPEN'
              }
              ticketNumber={ticket.ticket_number}
              createdAt={ticket.created_at}
              assignedTo={ticket.assignee?.full_name || 'Unassigned'}
              assigneePhotoUrl={ticket.assignee?.user_photo_url}
              photoUrl={ticket.photo_before_url}
              materialsOrdered={(ticket as any).materials_ordered}
              raisedByName={ticket.creator?.full_name || 'Anonymous'}
              escalationChain={escalationChain}
              onClick={() => router.push(`/property/${propertyId}/tickets/${ticket.id}` as any)}
              onEdit={() => {
                setEditingTicket(ticket);
                setEditTitle(ticket.title);
                setEditDescription(ticket.description);
              }}
              tick={tick}
            />
          );
        })}
        {(requestFilter === 'all' || requestFilter === 'completed') && filteredCompletedTickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            id={ticket.id}
            title={ticket.title}
            priority={(ticket.priority?.toUpperCase() as any) || 'MEDIUM'}
            status="COMPLETED"
            ticketNumber={ticket.ticket_number}
            createdAt={ticket.created_at}
            assignedTo={ticket.assignee?.full_name || 'Unassigned'}
            assigneePhotoUrl={ticket.assignee?.user_photo_url}
            photoUrl={ticket.photo_before_url}
            materialsOrdered={(ticket as any).materials_ordered}
            raisedByName={ticket.creator?.full_name || 'Anonymous'}
            onClick={() => router.push(`/property/${propertyId}/tickets/${ticket.id}` as any)}
            tick={tick}
          />
        ))}
        {((requestFilter === 'active' && filteredIncomingTickets.length === 0) ||
          (requestFilter === 'completed' && filteredCompletedTickets.length === 0)) && (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyStateText}>No {requestFilter} requests</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderProfileTab = () => (
    <ScrollView style={[styles.tabContent, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.profileHeader}>
          <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.profileAvatarText}>
              {user?.user_metadata?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
          <View style={[styles.profileBadge, { backgroundColor: isDark ? 'rgba(112,143,150,0.15)' : '#EFF6FF' }]}>
            <Text style={[styles.profileBadgeText, { color: colors.primary }]}>{userRole}</Text>
          </View>
        </View>

        <View style={styles.profileInfo}>
          <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.profileLabel, { color: colors.textTertiary }]}>Full Name</Text>
            <Text style={[styles.profileValue, { color: colors.textPrimary }]}>{user?.user_metadata?.full_name || 'Not Set'}</Text>
          </View>
          <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.profileLabel, { color: colors.textTertiary }]}>Phone</Text>
            <Text style={[styles.profileValue, { color: colors.textPrimary }]}>{user?.user_metadata?.phone || 'Not Set'}</Text>
          </View>
          <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.profileLabel, { color: colors.textTertiary }]}>Email</Text>
            <Text style={[styles.profileValue, { color: colors.textPrimary }]}>{user?.email || 'Not Set'}</Text>
          </View>
          <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.profileLabel, { color: colors.textTertiary }]}>Property</Text>
            <Text style={[styles.profileValue, { color: colors.textPrimary }]}>{property?.name || 'Not Assigned'}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity 
        style={[styles.signOutButton, { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', borderColor: isDark ? 'rgba(239,68,68,0.2)' : '#FECACA' }]}
        onPress={() => setShowSignOutModal(true)}
      >
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  if (isLoading && !property) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </View>
    );
  }

  if (!property) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
          <Text style={styles.errorTitle}>Error Loading Dashboard</Text>
          <Text style={styles.errorText}>{errorMsg || 'Property not found.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchPropertyDetails}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />


      <FloatingMenu
        title="Maintenance Portal"
        items={[
          { label: 'Overview', icon: 'grid', onPress: () => setActiveTab('overview') },
          { label: 'Requests', icon: 'ticket', onPress: () => setActiveTab('requests') },
          { label: 'Flow Map', icon: 'git-network', onPress: () => router.push('/property/' + propertyId + '/flow-map' as any) },
          { label: 'Visitors', icon: 'people', onPress: () => router.push('/property/' + propertyId + '/visitors' as any) },
          { label: 'Diesel', icon: 'water', onPress: () => router.push('/property/' + propertyId + '/diesel' as any) },
          { label: 'Electricity', icon: 'flash', onPress: () => router.push('/property/' + propertyId + '/electricity' as any) },
          { label: 'Checklists', icon: 'checkbox', onPress: () => router.push('/property/' + propertyId + '/checklist' as any) },
          { label: 'Settings', icon: 'settings', onPress: () => router.push('/property/' + propertyId + '/settings' as any) },
          { label: 'Profile', icon: 'person', onPress: () => router.push('/property/' + propertyId + '/profile' as any) },
        ]}
        footer={{ label: 'Sign Out', icon: 'log-out-outline', danger: true, onPress: () => setShowSignOutModal(true) }}
      />

      {/* Top Navigation */}
      <View style={[styles.topNav, {
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
        paddingTop: Math.max(insets.top, 16)
      }]}>
        <Image 
          source={require('../../assets/images/autopilot-logo-new.png')} 
          style={{ height: 48, width: 200, resizeMode: 'stretch' }}
        />

        {/* Top Right Actions */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <NotificationBell style={styles.bellButton} iconSize={24} iconColor={colors.textSecondary} />
        </View>
      </View>

      {/* Main Content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'overview' && renderDashboardTab()}
        {activeTab === 'requests' && renderRequestsTab()}
      </View>

      <AppBottomNav 
        activeTab={activeTab}
        propertyId={propertyId}
        onLoggersPress={() => setShowLoggersMenu(true)}
        onCreateRequestPress={() => setShowCreateModal(true)}
      />

      <LoggersMenu 
        visible={showLoggersMenu}
        onClose={() => setShowLoggersMenu(false)}
        propertyId={propertyId}
      />

      {/* Sign Out Modal */}
      <SignOutModal
        visible={showSignOutModal}
        onClose={() => setShowSignOutModal(false)}
        onSignOut={signOut}
      />

      {/* Create Ticket Modal */}
      <TicketCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        propertyId={propertyId}
        organizationId={''}
        role="staff"
        onSuccess={fetchTickets}
      />



      {/* Edit Ticket Modal */}
      <Modal
        visible={!!editingTicket}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingTicket(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Edit Request</Text>
              <TouchableOpacity onPress={() => setEditingTicket(null)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Title</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Request title"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Detailed description..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.cancelButton, { backgroundColor: colors.border }]}
                onPress={() => setEditingTicket(null)}
              >
                <Text style={[styles.cancelButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveButton, { backgroundColor: colors.primary }]}
                onPress={handleUpdateTicket}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </View>
  );
}

function AnimatedTicketCard({
  ticket, index, total, translateX, onSwipe, user, propertyId, onEdit, tick
}: {
  ticket: Ticket; index: number; total: number; translateX: any; onSwipe: () => void; user: any; propertyId: string; onEdit: (t: Ticket) => void; tick: number;
}) {
  const router = useRouter();
  const isTop = index === 0;

  const animatedStyle = useAnimatedStyle(() => {
    if (isTop) {
      return {
        transform: [
          { translateX: translateX.value },
          { rotate: `${interpolate(translateX.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-8, 0, 8], Extrapolate.CLAMP)}deg` }
        ],
        zIndex: total,
      };
    }

    // Keep cards solid to avoid seeing text from cards behind
    const stackScale = interpolate(Math.abs(translateX.value), [0, 150], [1 - (index * 0.06), 1 - ((index - 1) * 0.06)], Extrapolate.CLAMP);
    const stackTranslateY = interpolate(Math.abs(translateX.value), [0, 150], [index * -12, (index - 1) * -12], Extrapolate.CLAMP);

    return {
      transform: [
        { scale: stackScale }, 
        { translateY: stackTranslateY }
      ],
      zIndex: total - index,
    };
  });

  const pan = Gesture.Pan()
    .enabled(isTop)
    .minDistance(5)
    .shouldCancelWhenOutside(true)
    .onUpdate((e) => { 
        translateX.value = e.translationX; 
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 100) {
        const dest = e.translationX > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH;
        translateX.value = withSpring(dest, { velocity: e.velocityX, damping: 20, stiffness: 90 }, () => { 
            runOnJS(onSwipe)(); 
        });
      } else {
        translateX.value = withSpring(0, { damping: 15, stiffness: 120 });
      }
    });

  const escalationChain = useMemo(() => {
    const logs = ticket.ticket_escalation_logs;
    if (!logs || logs.length === 0) return undefined;
    const sorted = [...logs].sort((a, b) => new Date(a.escalated_at).getTime() - new Date(b.escalated_at).getTime());
    const chain: { name: string; avatar?: string | null }[] = [];
    sorted.forEach((log, i) => {
      if (i === 0 && log.from_employee?.full_name) chain.push({ name: log.from_employee.full_name, avatar: log.from_employee.user_photo_url });
      if (log.to_employee?.full_name) chain.push({ name: log.to_employee.full_name, avatar: log.to_employee.user_photo_url });
    });
    return chain.length > 0 ? chain : undefined;
  }, [ticket.ticket_escalation_logs]);

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[
        mstStyles.animatedWrapper, 
        animatedStyle,
        Platform.OS === 'web' && { touchAction: 'none' } as any
      ]}>
        <TicketCard
          id={ticket.id}
          title={ticket.title}
          priority={(ticket.priority?.toUpperCase() as any) || 'MEDIUM'}
          status={
            ['closed', 'resolved'].includes(ticket.status) ? 'COMPLETED' :
            ticket.status === 'in_progress' ? 'IN_PROGRESS' :
            ticket.assigned_to ? 'ASSIGNED' : 'OPEN'
          }
          ticketNumber={ticket.ticket_number || `TKT-${ticket.id.slice(0,8)}`}
          createdAt={ticket.created_at}
          assignedTo={ticket.assignee?.full_name || 'Unassigned'}
          assigneePhotoUrl={ticket.assignee?.user_photo_url}
          photoUrl={ticket.photo_before_url}
          materialsOrdered={(ticket as any).materials_ordered}
          escalationChain={escalationChain}
          onClick={() => router.push(`/property/${propertyId}/tickets/${ticket.id}` as any)}
          onEdit={() => onEdit(ticket)}
          compact={true}
          tick={tick}
          style={{ height: 190 }} // Reduced further from bottom
        />
      </Animated.View>
    </GestureDetector>
  );
}

const mstStyles = StyleSheet.create({
  stackContainer: {
    height: 320, 
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  animatedWrapper: {
    position: 'absolute',
    width: SCREEN_WIDTH - 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderRadius: 16,
  },

  // Premium Dashboard Sections
  premiumHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 15,
  },
  headerContext: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    flex: 1,
  },
  premiumShiftToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  shiftToggleText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  
  premiumStatsGrid: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  squareGlassCard: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  squareCardContent: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  squareStatNumber: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 2,
  },
  squareStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  squareStatAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  squareStatActionText: {
    fontSize: 9,
    fontWeight: '600',
  },

  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 22,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 99,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '500',
    padding: 0, // Remove native padding
  },

  requestsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 2,
  },
  requestsTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  requestsSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  stackSection: {
    marginBottom: 10,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748B',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A2332',
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  topNavTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  bellButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ---- Drawer Styles ----
  drawerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    zIndex: 101,
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  drawerLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  drawerLogoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerAppName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  drawerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerBadge: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 4,
  },
  drawerBadgeText: {
        fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  drawerSectionLabel: {
        fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    marginBottom: 6,
    marginTop: 4,
  },
  drawerQuickActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderBottomWidth: 1,
  },
  drawerQuickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  drawerQuickActionText: {
        fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    borderRadius: 12,
    marginBottom: 2,
  },
  drawerItemLabel: {
        fontSize: 15,
    letterSpacing: 0.1,
  },
  drawerBottom: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  drawerUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
  },
  drawerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  drawerAvatarText: {
        fontSize: 14,
    color: '#708F96',
  },
  drawerUserName: {
        fontSize: 13,
    fontWeight: '600',
  },
  drawerUserRole: {
        fontSize: 11,
    marginTop: 1,
  },
  drawerSignOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  drawerSignOutText: {
        fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  tabContent: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 10,
  },
  propertySelectWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  propertyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    paddingRight: 12,
    borderRadius: 99,
    borderWidth: 1,
  },
  propertyAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  propertyPillInfo: {
    justifyContent: 'center',
  },
  propertyPillName: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
  },
  propertyPillRole: {
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 10,
    opacity: 0.7,
  },
  notificationIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  titleArea: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 13,
    fontWeight: '600',
      },
  nameText: {
    fontSize: 26,
    fontWeight: '900',
        letterSpacing: -0.5,
  },
  stackSection: {
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A2332',
  },
  headerSubtitle: {
        fontSize: 14,
    color: '#1A2332',
    marginTop: 0,
    letterSpacing: 1.5,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activeStatCard: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A2332',
  },
  activeStatNumber: {
    color: '#3B82F6',
  },
  completedStatNumber: {
    color: '#10B981',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  glassStatCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  statDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  statDetailText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
  },
  urgentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  shiftToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1.5,
    gap: 6,
    minWidth: 110,
    justifyContent: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  shiftToggleText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  searchInput: {
    flex: 1,
    marginLeft: 14,
    fontSize: 15,
    fontWeight: '500',
    color: '#1A2332',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A2332',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 16,
  },
  skeletonContainer: {
    gap: 12,
  },
  skeletonCard: {
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '500',
  },
  ticketsList: {
    gap: 12,
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 100,
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    gap: 6,
  },
  filterTabActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  filterTabCount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94A3B8',
  },
  filterTabTextActive: {
    color: '#FFF',
  },
  profileCard: {
    backgroundColor: '#FFF',
    margin: 20,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileAvatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFF',
  },
  profileBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  profileBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
    textTransform: 'uppercase',
  },
  profileInfo: {
    gap: 16,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  profileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  profileValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A2332',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 16,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 8,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
  },
  navIconWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  navIconWrapperActive: {
    backgroundColor: '#EFF6FF',
  },
  navText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  navTextActive: {
    color: '#3B82F6',
  },
  navItemCenter: {
    alignItems: 'center',
    flex: 1,
    height: 60,
    justifyContent: 'flex-start',
  },
  centerFab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  menuContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A2332',
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A2332',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A2332',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#1A2332',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});
