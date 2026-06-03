'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Image,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createClient } from '../../utils/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '@/context';
import NotificationBell from '@/components/dashboard/NotificationBell';
import TicketCard from '../shared/TicketCard';
import SignOutModal from '../ui/SignOutModal';
import { TicketCreateModal } from '../tickets/TicketCreateModal';
import { AppBottomNav, TabKey } from '../shared/AppBottomNav';
import { LoggersMenu } from '../shared/LoggersMenu';
import StockScannerModal from '../stock/StockScannerModal';
import { TicketShuffleStack } from '../shared/TicketShuffleStack';
import FloatingMenu from '@/components/ui/FloatingMenu';
import PermissionOnboarding, { hasRequestedPermissions } from '@/components/onboarding/PermissionOnboarding';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { serverApi } from '@/lib/serverApi';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';

const DRAWER_WIDTH = 280;

const DottedBackground = ({ isDark }: { isDark: boolean }) => (
  <View style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%">
      <Defs>
        <Pattern id="dotPattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <Circle cx="2" cy="2" r="1.2" fill={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#dotPattern)" />
    </Svg>
  </View>
);

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
  assignee?: { full_name: string; email: string; user_photo_url?: string | null } | null;
  photo_before_url?: string;
  raised_by?: string;
  internal?: boolean;
  property_id?: string;
  creator?: { full_name: string } | null;
  ticket_escalation_logs?: {
    from_level: number;
    to_level: number | null;
    escalated_at: string;
    from_employee?: { full_name: string; user_photo_url?: string | null } | null;
    to_employee?: { full_name: string; user_photo_url?: string | null } | null;
  }[];
}

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

export default function StaffDashboard({ propertyId }: { propertyId: string }) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [activeTab, setActiveTab] = useState<'overview' | 'requests' | 'profile'>('overview');
  const [property, setProperty] = useState<Property | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [incomingTickets, setIncomingTickets] = useState<Ticket[]>([]);
  const [completedTickets, setCompletedTickets] = useState<Ticket[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [userRole, setUserRole] = useState('Staff');
  const [specialization, setSpecialization] = useState<string | null>(null);
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [requestFilter, setRequestFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [showLoggersMenu, setShowLoggersMenu] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showPermissionOnboarding, setShowPermissionOnboarding] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  // Shift / Check-in state
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [isCheckingInOut, setIsCheckingInOut] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  // Determines if this staff is a "technical" or "soft_services" specialist
  const isTechnical = userSkills.includes('technical');
  const isSoftServices = userSkills.includes('soft_services') || userSkills.includes('housekeeping');

  // Skill-group color for the dashboard accent
  const skillColor = isTechnical ? '#3B82F6' : isSoftServices ? '#8B5CF6' : '#708F96';

  const { refetch } = useDashboardFetch(queryKeys.property.staffLegacy(propertyId), async () => {
    if (propertyId) {
      await Promise.all([
        fetchPropertyDetails(),
        fetchTickets(),
        fetchUserRoleAndSkills(),
        fetchShiftStatus(),
      ]);
    }
  }, {
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    hasRequestedPermissions().then(requested => {
      if (!requested) setShowPermissionOnboarding(true);
    });
  }, []);

  const { tab } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (tab === 'requests') setActiveTab('requests');
    else if (tab === 'overview') setActiveTab('overview');
  }, [tab]);

  // ─── Shift / Check-in ───────────────────────────────────────────────────
  const fetchShiftStatus = async () => {
    if (!user?.id || !propertyId) return;
    try {
      const { data: rsData }: any = await supabase
        .from('resolver_stats')
        .select('is_checked_in')
        .eq('user_id', user.id)
        .eq('property_id', propertyId)
        .single();

      if (rsData) setIsCheckedIn(rsData.is_checked_in);

      // TODO: shift_logs does not exist in saas_one schema
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
      //   setIsCheckedIn(true);
      // }
    } catch (error) {
      console.error('Error fetching shift status:', error);
    }
  };

  const toggleShift = async () => {
    if (!user?.id || !propertyId || isCheckingInOut) return;
    setIsCheckingInOut(true);
    const newStatus = !isCheckedIn;
    try {
      // TODO: shift_logs does not exist in saas_one schema
      // if (newStatus) {
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
      //   if (activeShiftId) {
      //     const { error: shiftErr } = await (supabase
      //       .from('shift_logs') as any)
      //       .update({ status: 'completed', check_out_at: new Date().toISOString() })
      //       .eq('id', activeShiftId);
      //     if (shiftErr) throw shiftErr;
      //   }
      //   setActiveShiftId(null);
      // }

      const { error: rsErr } = await (supabase
        .from('resolver_stats') as any)
        .update({ is_checked_in: newStatus })
        .eq('user_id', user.id)
        .eq('property_id', propertyId);
      if (rsErr) throw rsErr;

      setIsCheckedIn(newStatus);
      Alert.alert('Shift Updated', `You are now ${newStatus ? 'ON DUTY' : 'OFF DUTY'}.`);
    } catch (error: any) {
      console.error('Shift toggle error:', error);
      Alert.alert('Error', error.message || 'Failed to update shift status');
    } finally {
      setIsCheckingInOut(false);
    }
  };

  const fetchUserRoleAndSkills = async () => {
    if (!user) return;
    const { data: member } = await (supabase
      .from('property_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('property_id', propertyId)
      .single() as any);
    if (member) {
      setUserRole(member.role.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));
    }

    // Fetch specialization from mst_skills (stores skill groups per user per property)
    const { data: skills } = await ((supabase
      .from('mst_skills') as any)
      .select('skill_group_code')
      .eq('user_id', user.id)
      .eq('property_id', propertyId)
      .single() as any);

    if (skills?.skill_group_code) {
      setUserSkills([skills.skill_group_code]);
      setSpecialization(skills.skill_group_code.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));
    }

    // Also try resolver_stats for skills array (newer schema)
    const { data: resolverStats } = await (supabase
      .from('resolver_stats')
      .select('skills, specialization')
      .eq('user_id', user.id)
      .eq('property_id', propertyId)
      .single() as any);

    if (resolverStats?.skills && Array.isArray(resolverStats.skills)) {
      setUserSkills(resolverStats.skills);
      if (!specialization && resolverStats.skills.length > 0) {
        setSpecialization(resolverStats.skills[0].replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));
      }
    } else if (resolverStats?.specialization) {
      setSpecialization(resolverStats.specialization.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));
    }
  };

  const fetchTickets = async () => {
    if (!user || !propertyId) return;
    setIsFetching(true);

    // Fetch tickets with skill_group_code so we can filter
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
      setIncomingTickets(tickets.filter((t: Ticket) => !['resolved', 'closed'].includes(t.status)));
      setCompletedTickets(tickets.filter((t: Ticket) => ['resolved', 'closed'].includes(t.status)));
    }
    setIsFetching(false);
  };

  const fetchPropertyDetails = async () => {
    setIsLoading(true);
    const { data, error } = await (supabase
      .from('properties')
      .select('*')
      .eq('id', propertyId)
      .maybeSingle() as any);
    if (error || !data) {
      setErrorMsg('Property not found');
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
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update');
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredIncoming = useMemo(() => {
    if (!searchQuery) return incomingTickets;
    return incomingTickets.filter(t =>
      fuzzyMatch(t.title, searchQuery) ||
      fuzzyMatch(t.ticket_number, searchQuery) ||
      fuzzyMatch(t.description ?? '', searchQuery)
    );
  }, [incomingTickets, searchQuery]);

  const filteredCompleted = useMemo(() => {
    if (!searchQuery) return completedTickets;
    return completedTickets.filter(t =>
      fuzzyMatch(t.title, searchQuery) ||
      fuzzyMatch(t.ticket_number, searchQuery) ||
      fuzzyMatch(t.description ?? '', searchQuery)
    );
  }, [completedTickets, searchQuery]);

  const totalTickets = incomingTickets.length + completedTickets.length;
  const activeCount = incomingTickets.filter(t =>
    ['in_progress', 'assigned', 'open'].includes(t.status)
  ).length;
  const completedCount = completedTickets.length;

  function getInitials(name: string): string {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  }

  function buildEscalationChain(logs: Ticket['ticket_escalation_logs']) {
    if (!logs?.length) return undefined;
    const sorted = [...logs].sort((a, b) => new Date(a.escalated_at).getTime() - new Date(b.escalated_at).getTime());
    const chain: { name: string; avatar?: string | null }[] = [];
    sorted.forEach((log, i) => {
      if (i === 0 && log.from_employee?.full_name) chain.push({ name: log.from_employee.full_name, avatar: log.from_employee.user_photo_url });
      if (log.to_employee?.full_name) chain.push({ name: log.to_employee.full_name, avatar: log.to_employee.user_photo_url });
    });
    return chain.length > 0 ? chain : undefined;
  }

  // Shuffle array using Fisher-Yates
  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Shuffled versions for overview display
  const shuffledActive = useMemo(() => shuffle(incomingTickets), [incomingTickets]);
  const shuffledCompleted = useMemo(() => shuffle(completedTickets), [completedTickets]);

  // ─── Overview Tab ───────────────────────────────────────────────────────────
  const renderOverviewTab = () => (
    <LinearGradient colors={isDark ? ['#0F172A', '#1E293B'] : ['#FFFFFF', '#F9FBFF']} style={styles.tabContent}>
      <DottedBackground isDark={isDark} />
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.premiumHeader}>
          <Text style={[styles.headerContext, { color: colors.textSecondary }]}>
            {(property?.name || 'HEAD OFFICE').toUpperCase()}
          </Text>
          <Text style={[styles.headerName, { color: colors.textPrimary }]}>
            {(user?.user_metadata?.full_name || 'STAFF').toUpperCase()}
          </Text>
          {specialization && (
            <View style={[styles.specBadge, { backgroundColor: isDark ? `${skillColor}20` : `${skillColor}15`, borderColor: `${skillColor}50` }]}>
              <Text style={[styles.specBadgeText, { color: skillColor }]}>{specialization}</Text>
            </View>
          )}
          {/* Check-in / Check-out Toggle */}
          <TouchableOpacity
            style={[
              styles.stockToggle,
              {
                borderColor: isCheckedIn ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)',
                backgroundColor: isCheckedIn ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              }
            ]}
            onPress={toggleShift}
            disabled={isCheckingInOut}
          >
            {isCheckingInOut ? (
              <ActivityIndicator size="small" color={isCheckedIn ? '#10B981' : '#EF4444'} />
            ) : (
              <>
                <View style={[styles.stockToggleDot, { backgroundColor: isCheckedIn ? '#10B981' : '#EF4444' }]} />
                <Text style={[styles.stockToggleText, { color: isCheckedIn ? '#10B981' : '#EF4444' }]}>
                  {isCheckedIn ? 'ON DUTY' : 'OFF DUTY'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.premiumStatsGrid}>
          <TouchableOpacity 
            style={[styles.squareGlassCard, { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.1)', borderColor: isDark ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.25)', borderWidth: 1.5 }]}
            onPress={() => setRequestFilter('all')}
          >
            {Platform.OS === 'ios' && <SafeBlurView intensity={isDark ? 20 : 30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
            <View style={styles.squareCardContent}>
              <Text style={[styles.squareStatNumber, { color: isDark ? '#A5B4FC' : '#6366F1' }]}>{totalTickets}</Text>
              <Text style={[styles.squareStatLabel, { color: isDark ? '#A5B4FC' : '#6366F1', opacity: 0.8 }]}>TOTAL</Text>
              <View style={styles.squareStatAction}>
                <Ionicons name="layers-outline" size={10} color={isDark ? '#A5B4FC' : '#6366F1'} />
                <Text style={[styles.squareStatActionText, { color: isDark ? '#A5B4FC' : '#6366F1' }]}>All Tasks</Text>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.squareGlassCard, { backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)' }]} onPress={() => setRequestFilter('active')}>
            {Platform.OS === 'ios' && <SafeBlurView intensity={isDark ? 20 : 30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
            <View style={styles.squareCardContent}>
              <Text style={[styles.squareStatNumber, { color: '#3B82F6' }]}>{activeCount}</Text>
              <Text style={[styles.squareStatLabel, { color: colors.textSecondary }]}>ACTIVE</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.squareGlassCard, { backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)' }]} onPress={() => setRequestFilter('completed')}>
            {Platform.OS === 'ios' && <SafeBlurView intensity={isDark ? 20 : 30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
            <View style={styles.squareCardContent}>
              <Text style={[styles.squareStatNumber, { color: '#10B981' }]}>{completedCount}</Text>
              <Text style={[styles.squareStatLabel, { color: colors.textSecondary }]}>DONE</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <View style={[styles.searchBar, { backgroundColor: isDark ? 'rgba(30,41,59,0.8)' : '#FFF', borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
            <TextInput placeholder="Search requests..." placeholderTextColor={colors.textSecondary} style={[styles.searchInput, { color: colors.textPrimary }]} value={searchQuery} onChangeText={setSearchQuery} />
          </View>
        </View>

        <View style={styles.requestsHeaderRow}>
          <View>
            <Text style={[styles.requestsTitle, { color: colors.textPrimary }]}>Property Requests</Text>
            <Text style={[styles.requestsSubtitle, { color: colors.textSecondary }]}>All requests for this property</Text>
          </View>
          <TouchableOpacity onPress={() => setActiveTab('requests')} style={styles.viewAllBtn}>
            <Text style={styles.viewAllText}>View All</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.stackSection, { height: 320, justifyContent: 'center' }]}>
          <TicketShuffleStack 
            tickets={incomingTickets} 
            user={user} 
            propertyId={propertyId} 
            onEdit={(t) => { 
                setEditingTicket(t as any); 
                setEditTitle(t.title); 
                setEditDescription(t.description || ''); 
            }} 
          />
        </View>
        {incomingTickets.length === 0 && (
          <View style={[styles.emptyState, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F1F5F9', borderRadius: 20, marginHorizontal: 20 }]}>
            <Ionicons name="checkmark-circle-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyStateText}>No active requests</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 12 }]}>Recently Resolved</Text>
          {shuffledCompleted.slice(0, 3).map(ticket => (
            <TicketCard key={ticket.id} id={ticket.id} title={ticket.title}
              priority={(ticket.priority?.toUpperCase() as any) || 'MEDIUM'} status="COMPLETED"
              ticketNumber={ticket.ticket_number || `TKT-${ticket.id.slice(0, 8)}`}
              createdAt={ticket.created_at}
              onClick={() => router.push(`/property/${propertyId}/tickets/${ticket.id}` as any)}
              style={{ marginBottom: 12 }} />
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

  // ─── Requests Tab ──────────────────────────────────────────────────────────
  const renderRequestsTab = () => (
    <ScrollView style={styles.tabContent} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}>
      <View style={[styles.filterContainer, { backgroundColor: colors.background }]}>
        {([
          { key: 'all' as const, label: 'All', count: totalTickets },
          { key: 'active' as const, label: 'Active', count: activeCount },
          { key: 'completed' as const, label: 'Completed', count: completedCount },
        ]).map(({ key, label, count }) => {
          const isActive = requestFilter === key;
          return (
            <TouchableOpacity key={key}
              style={[styles.filterTab, { backgroundColor: colors.surface, borderColor: colors.border }, isActive && { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)', borderColor: colors.primary }]}
              onPress={() => setRequestFilter(key)}>
              <Text style={[styles.filterTabText, { color: colors.textSecondary }, isActive && { color: colors.primary }]}>{label}</Text>
              <Text style={[styles.filterTabCount, { color: colors.textTertiary }, isActive && { color: colors.primary, fontWeight: '700' }]}>{count}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.ticketsList, { paddingHorizontal: 20 }]}>
        {(requestFilter === 'all' || requestFilter === 'active') && filteredIncoming.map(ticket => (
          <TicketCard key={ticket.id} id={ticket.id} title={ticket.title}
            priority={(ticket.priority?.toUpperCase() as any) || 'MEDIUM'}
            status={ticket.status === 'in_progress' ? 'IN_PROGRESS' : ticket.assigned_to ? 'ASSIGNED' : 'OPEN'}
            ticketNumber={ticket.ticket_number || `TKT-${ticket.id.slice(0, 8)}`}
            createdAt={ticket.created_at} assignedTo={ticket.assignee?.full_name || 'Unassigned'}
            assigneePhotoUrl={ticket.assignee?.user_photo_url} photoUrl={ticket.photo_before_url}
            raisedByName={ticket.creator?.full_name || ticket.raised_by || 'Anonymous'}
            escalationChain={buildEscalationChain(ticket.ticket_escalation_logs)}
            onClick={() => router.push(`/property/${propertyId}/tickets/${ticket.id}` as any)}
            onEdit={() => { setEditingTicket(ticket); setEditTitle(ticket.title); setEditDescription(ticket.description || ''); }} />
        ))}
        {(requestFilter === 'all' || requestFilter === 'completed') && filteredCompleted.map(ticket => (
          <TicketCard key={ticket.id} id={ticket.id} title={ticket.title}
            priority={(ticket.priority?.toUpperCase() as any) || 'MEDIUM'} status="COMPLETED"
            ticketNumber={ticket.ticket_number || `TKT-${ticket.id.slice(0, 8)}`}
            createdAt={ticket.created_at}
            onClick={() => router.push(`/property/${propertyId}/tickets/${ticket.id}` as any)} />
        ))}
        {((requestFilter === 'active' && filteredIncoming.length === 0) || (requestFilter === 'completed' && filteredCompleted.length === 0)) && (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyStateText}>No {requestFilter} requests</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  // ─── Profile Tab ───────────────────────────────────────────────────────────
  const renderProfileTab = () => (
    <ScrollView style={[styles.tabContent, { backgroundColor: colors.background }]}>
      <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.profileHeader}>
          <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.profileAvatarText}>{user?.user_metadata?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}</Text>
          </View>
          <View style={[styles.profileBadge, { backgroundColor: isDark ? 'rgba(112,143,150,0.15)' : '#EFF6FF' }]}>
            <Text style={[styles.profileBadgeText, { color: colors.primary }]}>{userRole}</Text>
          </View>
          {specialization && (
            <View style={[styles.specBadge, { backgroundColor: isDark ? `${skillColor}20` : `${skillColor}15`, borderColor: `${skillColor}50`, marginTop: 6 }]}>
              <Text style={[styles.specBadgeText, { color: skillColor }]}>{specialization}</Text>
            </View>
          )}
        </View>
        <View style={styles.profileInfo}>
          <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.profileLabel, { color: colors.textTertiary }]}>Full Name</Text>
            <Text style={[styles.profileValue, { color: colors.textPrimary }]}>{user?.user_metadata?.full_name || 'Not Set'}</Text>
          </View>
          <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.profileLabel, { color: colors.textTertiary }]}>Email</Text>
            <Text style={[styles.profileValue, { color: colors.textPrimary }]}>{user?.email || 'Not Set'}</Text>
          </View>
          <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.profileLabel, { color: colors.textTertiary }]}>Specialization</Text>
            <Text style={[styles.profileValue, { color: colors.textPrimary }]}>{specialization || 'Not Set'}</Text>
          </View>
          <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.profileLabel, { color: colors.textTertiary }]}>Property</Text>
            <Text style={[styles.profileValue, { color: colors.textPrimary }]}>{property?.name || 'Not Assigned'}</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity style={[styles.signOutButton, { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', borderColor: isDark ? 'rgba(239,68,68,0.2)' : '#FECACA' }]} onPress={() => setShowSignOutModal(true)}>
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
          <ActivityIndicator size="large" color={colors.primary} />
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
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <FloatingMenu
        title="Staff Portal"
        items={[
          { label: 'Overview', icon: 'grid', onPress: () => setActiveTab('overview') },
          { label: 'Requests', icon: 'ticket', onPress: () => setActiveTab('requests') },
          { label: 'Stock', icon: 'cube', onPress: () => router.push('/property/' + propertyId + '/stock' as any) },
          { label: 'Checklists', icon: 'checkbox', onPress: () => router.push('/property/' + propertyId + '/checklist' as any) },
          { label: 'Visitors', icon: 'people', onPress: () => router.push('/property/' + propertyId + '/visitors' as any) },
          { label: 'Diesel', icon: 'water', onPress: () => router.push('/property/' + propertyId + '/diesel' as any) },
          { label: 'Electricity', icon: 'flash', onPress: () => router.push('/property/' + propertyId + '/electricity' as any) },
          { label: 'Settings', icon: 'settings', onPress: () => router.push('/property/' + propertyId + '/settings' as any) },
          { label: 'Profile', icon: 'person', onPress: () => router.push('/property/' + propertyId + '/profile' as any) },
        ]}
        footer={{ label: 'Sign Out', icon: 'log-out-outline', danger: true, onPress: () => setShowSignOutModal(true) }}
      />

      <View style={[styles.topNav, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 16) }]}>
        <Image source={require('../../assets/images/autopilot-logo-new.png')} style={{ height: 48, width: 200, resizeMode: 'stretch' }} />
        <View style={styles.headerRightGroup}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setShowScanner(true)}
          >
            <Ionicons name="qr-code-outline" size={22} color="#708F96" />
          </TouchableOpacity>
          <NotificationBell 
            style={styles.bellButton} 
            iconSize={24} 
            iconColor={colors.textSecondary} 
          />
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'requests' && renderRequestsTab()}
        {activeTab === 'profile' && renderProfileTab()}
      </View>

      <AppBottomNav
        activeTab={activeTab as TabKey}
        propertyId={propertyId}
        onLoggersPress={() => setShowLoggersMenu(true)}
        onCreateRequestPress={() => setShowCreateModal(true)}
        baseRoute="/staff"
        showLoggers={false}
      />

      <LoggersMenu visible={showLoggersMenu} onClose={() => setShowLoggersMenu(false)} propertyId={propertyId} />

      <SignOutModal visible={showSignOutModal} onClose={() => setShowSignOutModal(false)} onSignOut={signOut} />

      <StockScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        propertyId={propertyId}
        userId={user?.id}
      />

      <TicketCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        propertyId={propertyId}
        organizationId={property?.organization_id ?? ''}
        role="staff"
        onSuccess={() => fetchTickets()}
      />

      <Modal visible={!!editingTicket} transparent animationType="slide" onRequestClose={() => setEditingTicket(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Edit Request</Text>
              <TouchableOpacity onPress={() => setEditingTicket(null)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Title</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]} value={editTitle} onChangeText={setEditTitle} placeholder="Request title" placeholderTextColor={colors.textTertiary} />
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Description</Text>
            <TextInput style={[styles.input, styles.textArea, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]} value={editDescription} onChangeText={setEditDescription} placeholder="Detailed description..." placeholderTextColor={colors.textTertiary} multiline numberOfLines={4} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.border }]} onPress={() => setEditingTicket(null)}>
                <Text style={[styles.cancelButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={handleUpdateTicket} disabled={isUpdating}>
                {isUpdating ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <PermissionOnboarding visible={showPermissionOnboarding} onComplete={() => setShowPermissionOnboarding(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#64748B' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: '#1A2332', marginTop: 16 },
  errorText: { fontSize: 14, color: '#64748B', marginTop: 8, textAlign: 'center' },
  retryButton: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#3B82F6', borderRadius: 12 },
  retryButtonText: { color: '#FFF', fontWeight: '600' },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  bellButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

  // Drawer
  drawerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  drawer: { position: 'absolute', top: 0, left: 0, bottom: 0, width: DRAWER_WIDTH, zIndex: 101, flexDirection: 'column', shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 12 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  drawerCloseBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  drawerBadge: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, marginTop: 8, marginBottom: 4 },
  drawerBadgeText: { fontFamily: 'Poppins-Bold', fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  drawerSectionLabel: { fontFamily: 'Poppins-Bold', fontSize: 9, fontWeight: '700', letterSpacing: 1.2, paddingHorizontal: 16, marginBottom: 6, marginTop: 4 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16, marginHorizontal: 8, borderRadius: 12, marginBottom: 2 },
  drawerItemLabel: { fontFamily: 'Urbanist-Medium', fontSize: 15, letterSpacing: 0.1 },
  drawerBottom: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  drawerUserCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 10, marginBottom: 10, borderWidth: 1 },
  drawerAvatar: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  drawerAvatarText: { fontFamily: 'Poppins-Bold', fontSize: 14, color: '#708F96' },
  drawerUserName: { fontFamily: 'Poppins-Medium', fontSize: 13, fontWeight: '600' },
  drawerUserRole: { fontFamily: 'Urbanist-Regular', fontSize: 11, marginTop: 1 },
  drawerSignOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  drawerSignOutText: { fontFamily: 'Urbanist-Medium', fontSize: 14, fontWeight: '600', color: '#EF4444' },

  // Content
  tabContent: { flex: 1 },
  premiumHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 15, gap: 12 },
  headerContext: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  headerName: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
  specBadge: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start' },
  specBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  stockToggle: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  stockToggleDot: { width: 6, height: 6, borderRadius: 3 },
  stockToggleText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5, marginLeft: 4 },
  premiumStatsGrid: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 20 },
  squareGlassCard: { flex: 1, aspectRatio: 1, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  squareCardContent: { padding: 10, alignItems: 'center', justifyContent: 'center' },
  squareStatNumber: { fontSize: 28, fontWeight: '800', marginBottom: 2 },
  squareStatLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  squareStatAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  squareStatActionText: { fontSize: 9, fontWeight: '600' },
  searchContainer: { paddingHorizontal: 16, marginBottom: 22 },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 99, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  searchInput: { flex: 1, marginLeft: 12, fontSize: 14, fontWeight: '500', padding: 0 },
  requestsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 2 },
  requestsTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  requestsSubtitle: { fontSize: 12, fontWeight: '500' },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  section: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  stackSection: {
    marginBottom: 10,
  },
  animatedWrapper: {
    position: 'absolute',
    width: Dimensions.get('window').width - 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderRadius: 16,
  },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyStateText: { marginTop: 12, fontSize: 15, color: '#94A3B8', fontWeight: '500' },
  ticketsList: { gap: 12 },
  filterContainer: { flexDirection: 'row', padding: 20, gap: 8 },
  filterTab: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 100, borderWidth: 1.5, alignItems: 'center', gap: 6 },
  filterTabText: { fontSize: 14, fontWeight: '700' },
  filterTabCount: { fontSize: 14, fontWeight: '500' },

  // Profile
  profileCard: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, margin: 20, overflow: 'hidden' },
  profileHeader: { alignItems: 'center', paddingTop: 24, paddingBottom: 16 },
  profileAvatar: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
  profileAvatarText: { fontSize: 28, fontWeight: '700', color: '#FFF' },
  profileBadge: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  profileBadgeText: { fontSize: 12, fontWeight: '700' },
  profileInfo: { paddingHorizontal: 20, paddingBottom: 20 },
  profileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  profileLabel: { fontSize: 13, fontWeight: '600' },
  profileValue: { fontSize: 13, fontWeight: '500', textAlign: 'right', flex: 1, marginLeft: 16 },
  signOutButton: { marginHorizontal: 20, marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 16 },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  cancelButtonText: { fontSize: 15, fontWeight: '700' },
  saveButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
