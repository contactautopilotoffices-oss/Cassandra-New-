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
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createClient } from '../../utils/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { useWeather } from '@/hooks/useWeather';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/context';
import { AuroraBackground } from '@/components/shared/AuroraBackground';
import TicketCard from '../shared/TicketCard';
import SignOutModal from '../ui/SignOutModal';
import Skeleton from '../ui/Skeleton';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';

// Types
type Tab = 'overview' | 'requests' | 'users' | 'visitors' | 'diesel' | 'electricity' | 'settings' | 'profile';

interface Property {
  id: string;
  name: string;
  code: string;
  address: string;
  organization_id: string;
  image_url?: string;
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
  photo_before_url?: string;
  raised_by?: string;
  raised_by_name?: string;
  internal?: boolean;
}

interface DashboardStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  urgent: number;
}

interface PropertyAdminDashboardProps {
  propertyId: string;
}

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

export default function PropertyAdminDashboard({ propertyId }: PropertyAdminDashboardProps) {
  const { user, signOut, membership } = useAuth();
  const router = useRouter();
  const { weather } = useWeather();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  // State
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [property, setProperty] = useState<Property | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    open: 0,
    in_progress: 0,
    resolved: 0,
    urgent: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Shared ticker — one interval drives all TicketCard elapsed timers
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const supabase = useMemo(() => createClient(), []);

  // Get assigned properties for switcher
  const assignedProperties = useMemo(() =>
    (membership?.properties || [])
      .filter(p => !['tenant', 'super_tenant'].includes((p.role || '').toLowerCase()))
      .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i),
    [membership]
  );

  const { refetch } = useDashboardFetch(queryKeys.property.propertyAdminLegacy(propertyId), async () => {
    if (propertyId) {
      await Promise.all([fetchPropertyDetails(), fetchTickets()]);
    }
  }, {
    staleTime: 1000 * 60 * 5,
  });

  const fetchTickets = async () => {
    if (!propertyId) return;

    const { data, error } = await supabase
      .from('tickets')
      .select(`
        *,
        assignee:users!assigned_to(full_name, email, user_photo_url)
      `)
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tickets:', error);
    } else {
      const ticketData = (data || []).map((ticket: any) => ({
        ...ticket,
        ticket_number: ticket.ticket_number ?? '',
      }));
      setTickets(ticketData);
      
      // Calculate stats
      setStats({
        total: ticketData.length,
        open: ticketData.filter((t: any) => t.status === 'open').length,
        in_progress: ticketData.filter((t: any) => ['in_progress', 'assigned'].includes(t.status)).length,
        resolved: ticketData.filter((t: any) => ['resolved', 'closed'].includes(t.status)).length,
        urgent: ticketData.filter((t: any) => 
          ['urgent', 'high'].includes(t.priority) && !['resolved', 'closed'].includes(t.status)
        ).length,
      });
    }
  };

  const fetchPropertyDetails = async () => {
    setIsLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .maybeSingle();

      if (error || !data) {
        setErrorMsg('Property not found.');
      } else {
        setProperty({
          ...data,
          address: data.address ?? '',
          organization_id: data.organization_id ?? '',
          image_url: data.image_url ?? undefined,
        });
      }
    } catch (err) {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const filteredTickets = useMemo(() => {
    let result = tickets;
    
    // Apply search filter
    if (searchQuery) {
      result = result.filter(t =>
        fuzzyMatch(t.title, searchQuery) ||
        fuzzyMatch(t.ticket_number, searchQuery) ||
        fuzzyMatch(t.description ?? '', searchQuery)
      );
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(t => {
        if (statusFilter === 'open') return t.status === 'open';
        if (statusFilter === 'in_progress') return ['in_progress', 'assigned'].includes(t.status);
        if (statusFilter === 'resolved') return ['resolved', 'closed'].includes(t.status);
        return true;
      });
    }
    
    return result;
  }, [tickets, searchQuery, statusFilter]);

  const renderOverviewTab = () => (
    <ScrollView 
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
    >
      {/* Property Header */}
      <View style={styles.propertyHeader}>
        <View style={styles.propertyIcon}>
          <Ionicons name="business" size={32} color="#708F96" />
        </View>
        <View style={styles.propertyInfo}>
          <Text style={styles.propertyName}>{property?.name}</Text>
          <Text style={styles.propertyAddress}>{property?.address || 'No address set'}</Text>
          <View style={styles.propertyCodeBadge}>
            <Text style={styles.propertyCodeText}>{property?.code}</Text>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity 
          style={styles.quickActionBtn}
          onPress={() => router.push('/tickets/create' as any)}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
            <Ionicons name="add-circle" size={24} color="#708F96" />
          </View>
          <Text style={styles.quickActionText}>New Request</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.quickActionBtn}
          onPress={() => setActiveTab('users')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
            <Ionicons name="people" size={24} color="#708F96" />
          </View>
          <Text style={styles.quickActionText}>Users</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.quickActionBtn}
          onPress={() => setActiveTab('visitors')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(168,85,247,0.15)' }]}>
            <Ionicons name="person-add" size={24} color="#708F96" />
          </View>
          <Text style={styles.quickActionText}>Visitors</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCardLarge}>
          <Text style={styles.statNumberLarge}>{stats.total}</Text>
          <Text style={styles.statLabelLarge}>Total Requests</Text>
        </View>
        <View style={styles.statsColumn}>
          <View style={[styles.statCardSmall, styles.statCardUrgent]}>
            <Text style={[styles.statNumberSmall, styles.statNumberUrgent]}>{stats.urgent}</Text>
            <Text style={[styles.statLabelSmall, styles.statLabelUrgent]}>Urgent</Text>
          </View>
          <View style={styles.statCardSmall}>
            <Text style={styles.statNumberSmall}>{stats.open}</Text>
            <Text style={styles.statLabelSmall}>Open</Text>
          </View>
        </View>
      </View>

      {/* Secondary Stats */}
      <View style={styles.secondaryStats}>
        <View style={styles.secondaryStat}>
          <View style={[styles.secondaryStatIcon, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
            <Ionicons name="time" size={20} color="#708F96" />
          </View>
          <View>
            <Text style={styles.secondaryStatNumber}>{stats.in_progress}</Text>
            <Text style={styles.secondaryStatLabel}>In Progress</Text>
          </View>
        </View>
        <View style={styles.secondaryStat}>
          <View style={[styles.secondaryStatIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
            <Ionicons name="checkmark-circle" size={20} color="#708F96" />
          </View>
          <View>
            <Text style={styles.secondaryStatNumber}>{stats.resolved}</Text>
            <Text style={styles.secondaryStatLabel}>Resolved</Text>
          </View>
        </View>
      </View>

      {/* Recent Activity */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Requests</Text>
          <TouchableOpacity onPress={() => setActiveTab('requests')}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>
        
        {tickets.slice(0, 3).map((ticket) => (
          <TicketCard
            key={ticket.id}
            id={ticket.id}
            title={ticket.title}
            priority={(ticket.priority?.toUpperCase() as any) || 'MEDIUM'}
            status={
              ['closed', 'resolved'].includes(ticket.status) ? 'COMPLETED' :
              ticket.status === 'in_progress' ? 'IN_PROGRESS' :
              ticket.assigned_to ? 'ASSIGNED' : 'OPEN'
            }
            ticketNumber={ticket.ticket_number}
            createdAt={ticket.created_at}
            assignedTo={ticket.assignee?.full_name}
            assigneePhotoUrl={ticket.assignee?.user_photo_url}
            photoUrl={ticket.photo_before_url}
            onClick={() => router.push(`/tickets/${ticket.id}` as any)}
            tick={tick}
          />
        ))}

        {tickets.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="clipboard-outline" size={48} color="rgba(255,255,255,0.40)" />
            <Text style={styles.emptyStateText}>No requests yet</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderRequestsTab = () => (
    <ScrollView 
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
    >
      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="rgba(255,255,255,0.40)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search requests..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="rgba(255,255,255,0.40)"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.40)" />
          </TouchableOpacity>
        )}
      </View>

      {/* Status Filters */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContainer} showsVerticalScrollIndicator={false}>
        {[
          { key: 'all', label: 'All', icon: 'layers' },
          { key: 'open', label: 'Open', icon: 'alert-circle' },
          { key: 'in_progress', label: 'In Progress', icon: 'time' },
          { key: 'resolved', label: 'Resolved', icon: 'checkmark-circle' },
        ].map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[styles.filterChip, statusFilter === filter.key && styles.filterChipActive]}
            onPress={() => setStatusFilter(filter.key)}
          >
            <Ionicons 
              name={filter.icon as any} 
              size={16} 
              color={statusFilter === filter.key ? '#FFF' : 'rgba(255,255,255,0.40)'} 
            />
            <Text style={[styles.filterChipText, statusFilter === filter.key && styles.filterChipTextActive]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tickets List */}
      <View style={styles.ticketsList}>
        {filteredTickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            id={ticket.id}
            title={ticket.title}
            priority={(ticket.priority?.toUpperCase() as any) || 'MEDIUM'}
            status={
              ['closed', 'resolved'].includes(ticket.status) ? 'COMPLETED' :
              ticket.status === 'in_progress' ? 'IN_PROGRESS' :
              ticket.assigned_to ? 'ASSIGNED' : 'OPEN'
            }
            ticketNumber={ticket.ticket_number}
            createdAt={ticket.created_at}
            assignedTo={ticket.assignee?.full_name}
            assigneePhotoUrl={ticket.assignee?.user_photo_url}
            photoUrl={ticket.photo_before_url}
            onClick={() => router.push(`/tickets/${ticket.id}` as any)}
            tick={tick}
          />
        ))}

        {filteredTickets.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color="rgba(255,255,255,0.40)" />
            <Text style={styles.emptyStateText}>No requests found</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderUsersTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.navigableTabContent} showsVerticalScrollIndicator={false}>
      {/* Card to navigate to Users page */}
      <TouchableOpacity
        style={styles.navCard}
        onPress={() => router.push(`/property/${propertyId}/users` as any)}
        activeOpacity={0.7}
      >
        <View style={styles.navCardIcon}>
          <Ionicons name="people" size={28} color={colors.primary} />
        </View>
        <View style={styles.navCardContent}>
          <Text style={[styles.navCardTitle, { color: colors.textPrimary }]}>User Management</Text>
          <Text style={[styles.navCardDesc, { color: colors.textSecondary }]}>
            Manage property users, assign roles, and view activity.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Quick Stats */}
      <View style={[styles.quickStatsGrid, { marginTop: 16 }]}>
        <View style={[styles.quickStatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.quickStatNumber, { color: colors.primary }]}>—</Text>
          <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>Total Users</Text>
        </View>
        <View style={[styles.quickStatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.quickStatNumber, { color: colors.primary }]}>—</Text>
          <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>Active Today</Text>
        </View>
      </View>
    </ScrollView>
  );

  const renderVisitorsTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.navigableTabContent} showsVerticalScrollIndicator={false}>
      {/* Card to navigate to Visitors page */}
      <TouchableOpacity
        style={styles.navCard}
        onPress={() => router.push(`/property/${propertyId}/visitors` as any)}
        activeOpacity={0.7}
      >
        <View style={styles.navCardIcon}>
          <Ionicons name="person-add" size={28} color={colors.primary} />
        </View>
        <View style={styles.navCardContent}>
          <Text style={[styles.navCardTitle, { color: colors.textPrimary }]}>Visitor Management</Text>
          <Text style={[styles.navCardDesc, { color: colors.textSecondary }]}>
            Track visitors, manage check-ins, and view visitor history.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Quick Stats */}
      <View style={[styles.quickStatsGrid, { marginTop: 16 }]}>
        <View style={[styles.quickStatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.quickStatNumber, { color: colors.primary }]}>—</Text>
          <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>Checked In</Text>
        </View>
        <View style={[styles.quickStatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.quickStatNumber, { color: colors.primary }]}>—</Text>
          <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>Today's Visitors</Text>
        </View>
      </View>
    </ScrollView>
  );

  const renderProfileTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View style={[styles.profileAvatar, { backgroundColor: 'rgba(112,143,150,0.20)' }]}>
            <Text style={styles.profileAvatarText}>
              {user?.user_metadata?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'P'}
            </Text>
          </View>
          <View style={styles.profileBadge}>
            <Text style={styles.profileBadgeText}>Property Admin</Text>
          </View>
        </View>

        <View style={styles.profileInfo}>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Full Name</Text>
            <Text style={styles.profileValue}>{user?.user_metadata?.full_name || 'Not Set'}</Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Phone</Text>
            <Text style={styles.profileValue}>{user?.user_metadata?.phone || 'Not Set'}</Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Email</Text>
            <Text style={styles.profileValue}>{user?.email || 'Not Set'}</Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Property</Text>
            <Text style={styles.profileValue}>{property?.name || 'Not Assigned'}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity 
        style={styles.signOutButton}
        onPress={() => setShowSignOutModal(true)}
      >
        <Ionicons name="log-out-outline" size={20} color="#708F96" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  if (isLoading && !property) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDark ? '#060912' : '#F8FAFC' }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        {weather && <AuroraBackground colors={weather.auroraColors} />}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#708F96" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </View>
    );
  }

  if (!property) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDark ? '#060912' : '#F8FAFC' }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        {weather && <AuroraBackground colors={weather.auroraColors} />}
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#708F96" />
          <Text style={styles.errorTitle}>Unable to Load Dashboard</Text>
          <Text style={styles.errorText}>{errorMsg || 'Property not found.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchPropertyDetails}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDark ? '#060912' : '#F8FAFC' }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {weather && <AuroraBackground colors={weather.auroraColors} />}

      {/* Top Navigation — clean, floating */}
      <View style={styles.topNav}>
        <View style={{ flex: 1 }}>
          <Text style={styles.topNavTitle}>Property Admin</Text>
          <Text style={styles.topNavSubtitle}>{property?.name}</Text>
        </View>
        <TouchableOpacity
          style={styles.topNavButton}
          onPress={() => setShowSignOutModal(true)}
        >
          <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.60)" />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'requests' && renderRequestsTab()}
      {activeTab === 'users' && renderUsersTab()}
      {activeTab === 'visitors' && renderVisitorsTab()}
      {activeTab === 'profile' && renderProfileTab()}

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity 
          style={styles.navItem} 
          onPress={() => setActiveTab('overview')}
        >
          <Ionicons 
            name={activeTab === 'overview' ? 'grid' : 'grid-outline'} 
            size={24} 
            color={activeTab === 'overview' ? '#708F96' : 'rgba(255,255,255,0.40)'} 
          />
          <Text style={[styles.navText, activeTab === 'overview' && styles.navTextActive]}>Overview</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.navItem} 
          onPress={() => setActiveTab('requests')}
        >
          <Ionicons 
            name={activeTab === 'requests' ? 'ticket' : 'ticket-outline'} 
            size={24} 
            color={activeTab === 'requests' ? '#708F96' : 'rgba(255,255,255,0.40)'} 
          />
          <Text style={[styles.navText, activeTab === 'requests' && styles.navTextActive]}>Requests</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.navItem} 
          onPress={() => setActiveTab('users')}
        >
          <Ionicons 
            name={activeTab === 'users' ? 'people' : 'people-outline'} 
            size={24} 
            color={activeTab === 'users' ? '#708F96' : 'rgba(255,255,255,0.40)'} 
          />
          <Text style={[styles.navText, activeTab === 'users' && styles.navTextActive]}>Users</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.navItem} 
          onPress={() => setActiveTab('profile')}
        >
          <Ionicons 
            name={activeTab === 'profile' ? 'person' : 'person-outline'} 
            size={24} 
            color={activeTab === 'profile' ? '#708F96' : 'rgba(255,255,255,0.40)'} 
          />
          <Text style={[styles.navText, activeTab === 'profile' && styles.navTextActive]}>Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Sign Out Modal */}
      <SignOutModal
        visible={showSignOutModal}
        onClose={() => setShowSignOutModal(false)}
        onSignOut={signOut}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060912',
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#060912',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
      },
  errorText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 8,
    textAlign: 'center',
      },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(112,143,150,0.85)',
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
      },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  topNavButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topNavTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
        letterSpacing: -0.5,
  },
  topNavSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
      },
  tabContent: {
    flex: 1,
  },
  propertyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  propertyIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(112,143,150,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  propertyInfo: {
    flex: 1,
  },
  propertyName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
      },
  propertyAddress: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
      },
  propertyCodeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  propertyCodeText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
      },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  quickActionBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.80)',
      },
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 12,
  },
  statCardLarge: {
    flex: 1.5,
    backgroundColor: 'rgba(112,143,150,0.20)',
    borderRadius: 20,
    padding: 20,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statNumberLarge: {
    fontSize: 40,
    fontWeight: '800',
    color: '#708F96',
      },
  statLabelLarge: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
      },
  statsColumn: {
    flex: 1,
    gap: 12,
  },
  statCardSmall: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statCardUrgent: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.20)',
  },
  statNumberSmall: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
      },
  statNumberUrgent: {
    color: '#708F96',
  },
  statLabelSmall: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
      },
  statLabelUrgent: {
    color: 'rgba(255,255,255,0.70)',
  },
  secondaryStats: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  secondaryStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 12,
  },
  secondaryStatIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryStatNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
      },
  secondaryStatLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
      },
  section: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
      },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#708F96',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
      },
  ticketsList: {
    gap: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    color: '#FFFFFF',
      },
  filterScroll: {
    maxHeight: 60,
  },
  filterContainer: {
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(112,143,150,0.20)',
    borderColor: 'rgba(112,143,150,0.40)',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
  },
  filterChipTextActive: {
    color: '#FFF',
  },
  comingSoon: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 100,
  },
  comingSoonTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
      },
  comingSoonText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 8,
    textAlign: 'center',
      },
  // Navigable tab content (Users, Visitors tabs)
  navigableTabContent: {
    padding: 20,
  },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  navCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(112,143,150,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navCardContent: {
    flex: 1,
  },
  navCardTitle: {
    fontSize: 16,
    fontWeight: '600',
        marginBottom: 4,
  },
  navCardDesc: {
    fontSize: 13,
        lineHeight: 18,
  },
  quickStatsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  quickStatCard: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  quickStatNumber: {
    fontSize: 28,
    fontWeight: '700',
        marginBottom: 4,
  },
  quickStatLabel: {
    fontSize: 12,
        textAlign: 'center',
  },
  profileCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    margin: 20,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(112,143,150,0.20)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileAvatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.90)',
      },
  profileBadge: {
    backgroundColor: 'rgba(112,143,150,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  profileBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#708F96',
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
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  profileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
      },
  profileValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
      },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 16,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.20)',
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(239,68,68,0.90)',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 8,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
  },
  navText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.40)',
    marginTop: 4,
      },
  navTextActive: {
    color: '#708F96',
  },
});
