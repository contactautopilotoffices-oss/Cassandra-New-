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
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createClient } from '../../utils/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import WeatherBadge from '@/components/dashboard/WeatherBadge';
import { useWeather } from '@/hooks/useWeather';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { useAsyncStorageCache } from '@/hooks/useAsyncStorageCache';
import { useTheme } from '@/context';
import SignOutModal from '../ui/SignOutModal';
import Skeleton from '../ui/Skeleton';

// Types
type Tab = 'overview' | 'organizations' | 'users' | 'tickets' | 'settings' | 'profile';

interface Organization {
  id: string;
  name: string;
  code: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  properties?: { count: number }[];
}

interface SystemUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  is_master_admin?: boolean;
}

interface DashboardStats {
  entities: number;
  activeSessions: number;
  securityAlerts: number;
  pendingDeletions: number;
}

export default function MasterAdminDashboard() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { weather } = useWeather();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  const supabase = useMemo(() => createClient(), []);

  // ── AsyncStorage cache — declared BEFORE useState that uses its values ──
  const { cachedData: masterCache, hasCache: hasMasterCache, saveCache: saveMasterCache } = useAsyncStorageCache<{
    organizations: Organization[];
    users: SystemUser[];
    stats: DashboardStats;
  }>({ key: 'master-admin-dashboard', propertyId: user?.id ?? 'master', staleTime: 10 * 60 * 1000 });

  // State — pre-seeded from cache for instant paint
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [organizations, setOrganizations] = useState<Organization[]>(masterCache?.organizations ?? []);
  const [users, setUsers] = useState<SystemUser[]>(masterCache?.users ?? []);
  const [isLoading, setIsLoading] = useState(!hasMasterCache);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [manualCondition, setManualCondition] = useState<import('@/hooks/useWeather').WeatherCondition | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    entities: masterCache?.stats.entities ?? 0,
    activeSessions: 0,
    securityAlerts: 0,
    pendingDeletions: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgCode, setNewOrgCode] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  const checkMasterAdmin = async () => {
    if (!user) return;

    const { data: userProfile } = await (supabase
      .from('users')
      .select('is_master_admin')
      .eq('id', user.id)
      .single() as any);

    if (userProfile?.is_master_admin) {
      fetchData();
    } else {
      setIsLoading(false);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchOrganizations(),
      fetchUsers(),
      fetchStats(),
    ]);
    setIsLoading(false);
  };

  const fetchOrganizations = async () => {
    const { data, error } = await (supabase
      .from('organizations')
      .select('*, properties(count)')
      .order('created_at', { ascending: false }) as any);

    if (error) {
      console.error('Error fetching organizations:', error);
    } else {
      setOrganizations(data ?? []);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, phone, created_at, is_master_admin')
        .order('created_at', { ascending: false })
        .limit(200);
      if (!error) setUsers((data as SystemUser[]) || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const [{ count: orgCount }, { count: userCount }] = await Promise.all([
        supabase.from('organizations').select('id', { count: 'exact', head: true }),
        supabase.from('users').select('id', { count: 'exact', head: true }),
      ]);
      const computed: DashboardStats = {
        entities: (orgCount ?? 0) + (userCount ?? 0),
        activeSessions: 0,
        securityAlerts: 0,
        pendingDeletions: 0,
      };
      setStats(computed);
      // Save to cache after all data loads
      saveMasterCache({ organizations, users, stats: computed });
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const { refetch } = useDashboardFetch(queryKeys.admin.masterAdmin(user?.id ?? 'none'), checkMasterAdmin, {
    staleTime: 1000 * 60 * 5,
  });

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const handleCreateOrg = async () => {
    if (!newOrgName.trim() || !newOrgCode.trim()) return;

    setIsCreatingOrg(true);
    try {
      const { error } = await (supabase
        .from('organizations')
        .insert([{
          name: newOrgName.trim(),
          code: newOrgCode.trim().toLowerCase(),
          is_deleted: false,
        }] as any));

      if (error) throw error;

      setShowCreateOrgModal(false);
      setNewOrgName('');
      setNewOrgCode('');
      fetchOrganizations();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create organization');
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleSoftDeleteOrg = async (orgId: string) => {
    Alert.alert(
      'Delete Organization',
      'Are you sure you want to mark this organization for deletion? It will be in a 24-hour cooling period.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await (supabase as any)
              .from('organizations')
              .update({
                is_deleted: true,
                deleted_at: new Date().toISOString()
              })
              .eq('id', orgId);
            fetchOrganizations();
          }
        }
      ]
    );
  };

  const handleRestoreOrg = async (orgId: string) => {
    await (supabase as any)
      .from('organizations')
      .update({
        is_deleted: false,
        deleted_at: null
      })
      .eq('id', orgId);
    fetchOrganizations();
  };

  const filteredOrganizations = useMemo(() => {
    if (!searchQuery) return organizations;
    const query = searchQuery.toLowerCase();
    return organizations.filter(o =>
      o.name.toLowerCase().includes(query) ||
      o.code.toLowerCase().includes(query)
    );
  }, [organizations, searchQuery]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(u =>
      u.full_name?.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  const renderOverviewTab = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#708F96" />}
          showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Master Control</Text>
        <Text style={styles.headerSubtitle}>System-wide oversight and governance</Text>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, styles.statCardBlue]}>
          <Ionicons name="business" size={24} color="#708F96" />
          <Text style={[styles.statNumber, { color: '#FFFFFF' }]}>{stats.entities}</Text>
          <Text style={styles.statLabel}>Organizations</Text>
        </View>
        <View style={[styles.statCard, styles.statCardGreen]}>
          <Ionicons name="pulse" size={24} color="#708F96" />
          <Text style={[styles.statNumber, { color: '#FFFFFF' }]}>{stats.activeSessions}</Text>
          <Text style={styles.statLabel}>Active Sessions</Text>
        </View>
        <View style={[styles.statCard, styles.statCardPurple]}>
          <Ionicons name="shield-checkmark" size={24} color="#708F96" />
          <Text style={[styles.statNumber, { color: '#FFFFFF' }]}>{stats.securityAlerts}</Text>
          <Text style={styles.statLabel}>Security Alerts</Text>
        </View>
        <View style={[styles.statCard, styles.statCardRed]}>
          <Ionicons name="trash" size={24} color="#708F96" />
          <Text style={[styles.statNumber, { color: '#FFFFFF' }]}>{stats.pendingDeletions}</Text>
          <Text style={styles.statLabel}>Pending Deletions</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => setShowCreateOrgModal(true)}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.25)' }]}>
              <Ionicons name="add-circle" size={24} color="#708F96" />
            </View>
            <Text style={styles.quickActionText}>New Organization</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => setActiveTab('users')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(76,175,80,0.15)', borderColor: 'rgba(76,175,80,0.25)' }]}>
              <Ionicons name="person-add" size={24} color="#708F96" />
            </View>
            <Text style={styles.quickActionText}>Add User</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => setActiveTab('tickets')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.25)' }]}>
              <Ionicons name="ticket" size={24} color="#708F96" />
            </View>
            <Text style={styles.quickActionText}>View Tickets</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Organizations */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Organizations</Text>
          <TouchableOpacity onPress={() => setActiveTab('organizations')}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {organizations.slice(0, 3).map((org) => (
          <View key={org.id} style={[styles.orgCard, org.is_deleted && styles.orgCardDeleted]}>
            <View style={[styles.orgIcon, { backgroundColor: 'rgba(112,143,150,0.25)' }]}>
              <Text style={styles.orgIconText}>{org.name.substring(0, 2).toUpperCase()}</Text>
            </View>
            <View style={styles.orgInfo}>
              <Text style={[styles.orgName, org.is_deleted && styles.orgNameDeleted]}>
                {org.name}
              </Text>
              <Text style={styles.orgCode}>/{org.code}</Text>
            </View>
            <View style={styles.orgMeta}>
              {org.is_deleted ? (
                <View style={styles.deletedBadge}>
                  <Text style={styles.deletedBadgeText}>Cooling Down</Text>
                </View>
              ) : (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              )}
            </View>
          </View>
        ))}

        {organizations.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color="rgba(255,255,255,0.40)" />
            <Text style={styles.emptyStateText}>No organizations yet</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderOrganizationsTab = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#708F96" />}
          showsVerticalScrollIndicator={false}
    >
      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="rgba(255,255,255,0.40)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search organizations..."
          placeholderTextColor="rgba(255,255,255,0.40)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.40)" />
          </TouchableOpacity>
        )}
      </View>

      {/* Create Button */}
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => setShowCreateOrgModal(true)}
      >
        <Ionicons name="add" size={20} color="#FFFFFF" />
        <Text style={styles.createButtonText}>Create Organization</Text>
      </TouchableOpacity>

      {/* Organizations List */}
      <View style={styles.listContainer}>
        {filteredOrganizations.map((org) => (
          <View key={org.id} style={[styles.orgCard, org.is_deleted && styles.orgCardDeleted]}>
            <View style={[styles.orgIcon, { backgroundColor: 'rgba(112,143,150,0.25)' }]}>
              <Text style={styles.orgIconText}>{org.name.substring(0, 2).toUpperCase()}</Text>
            </View>
            <View style={styles.orgInfo}>
              <Text style={[styles.orgName, org.is_deleted && styles.orgNameDeleted]}>
                {org.name}
              </Text>
              <Text style={styles.orgCode}>/{org.code}</Text>
              <Text style={styles.orgProperties}>
                {org.properties?.[0]?.count || 0} Properties
              </Text>
            </View>
            <View style={styles.orgActions}>
              {org.is_deleted ? (
                <TouchableOpacity
                  style={styles.restoreButton}
                  onPress={() => handleRestoreOrg(org.id)}
                >
                  <Ionicons name="refresh" size={18} color="#708F96" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleSoftDeleteOrg(org.id)}
                >
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        {filteredOrganizations.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color="rgba(255,255,255,0.40)" />
            <Text style={styles.emptyStateText}>No organizations found</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderUsersTab = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#708F96" />}
          showsVerticalScrollIndicator={false}
    >
      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="rgba(255,255,255,0.40)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users..."
          placeholderTextColor="rgba(255,255,255,0.40)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.40)" />
          </TouchableOpacity>
        )}
      </View>

      {/* Users List */}
      <View style={styles.listContainer}>
        {filteredUsers.map((user) => (
          <View key={user.id} style={styles.userCard}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {user.full_name?.substring(0, 2).toUpperCase() || user.email.substring(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user.full_name || 'Unknown User'}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
              {user.is_master_admin && (
                <View style={styles.masterBadge}>
                  <Text style={styles.masterBadgeText}>MASTER</Text>
                </View>
              )}
            </View>
          </View>
        ))}

        {filteredUsers.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.40)" />
            <Text style={styles.emptyStateText}>No users found</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderTicketsTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.comingSoon}>
        <Ionicons name="ticket-outline" size={64} color="rgba(255,255,255,0.40)" />
        <Text style={styles.comingSoonTitle}>Support Tickets</Text>
        <Text style={styles.comingSoonText}>
          View and manage all support tickets across the platform.
        </Text>
      </View>
    </ScrollView>
  );

  const renderProfileTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View style={[styles.profileAvatar, { backgroundColor: 'rgba(112,143,150,0.25)' }]}>
            <Text style={styles.profileAvatarText}>
              {user?.email?.[0].toUpperCase() || 'M'}
            </Text>
          </View>
          <View style={styles.profileBadge}>
            <Text style={[styles.profileBadgeText, { color: '#708F96' }]}>Master Admin</Text>
          </View>
        </View>

        <View style={styles.profileInfo}>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Email</Text>
            <Text style={styles.profileValue}>{user?.email || 'Not Set'}</Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Role</Text>
            <Text style={styles.profileValue}>Platform Administrator</Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Access Level</Text>
            <Text style={styles.profileValue}>Full System Access</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={() => setShowSignOutModal(true)}
      >
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDark ? '#060912' : '#F8FAFC' }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#708F96" />
          <Text style={styles.loadingText}>Loading master dashboard...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDark ? '#060912' : '#F8FAFC' }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {weather && <WeatherBackground condition={manualCondition || weather.condition} />}

      {/* Top Navigation — clean, floating style */}
      <View style={styles.topNav}>
        <View style={{ flex: 1 }}>
          <Text style={styles.topNavTitle}>Master Control</Text>
          <Text style={styles.topNavSubtitle}>System Administration</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {weather && (
            <WeatherBadge
              condition={manualCondition || weather.condition}
              temperature={weather.temperature}
              locationName={weather.locationName}
              onChange={setManualCondition}
            />
          )}
          <TouchableOpacity
            style={styles.topNavButton}
            onPress={() => setShowSignOutModal(true)}
          >
            <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.60)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'organizations' && renderOrganizationsTab()}
      {activeTab === 'users' && renderUsersTab()}
      {activeTab === 'tickets' && renderTicketsTab()}
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
          onPress={() => setActiveTab('organizations')}
        >
          <Ionicons
            name={activeTab === 'organizations' ? 'business' : 'business-outline'}
            size={24}
            color={activeTab === 'organizations' ? '#708F96' : 'rgba(255,255,255,0.40)'}
          />
          <Text style={[styles.navText, activeTab === 'organizations' && styles.navTextActive]}>Orgs</Text>
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

      {/* Create Organization Modal */}
      <Modal
        visible={showCreateOrgModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateOrgModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Organization</Text>
              <TouchableOpacity onPress={() => setShowCreateOrgModal(false)}>
                <Ionicons name="close" size={24} color="rgba(255,255,255,0.40)" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Organization Name</Text>
            <TextInput
              style={styles.input}
              value={newOrgName}
              onChangeText={setNewOrgName}
              placeholder="e.g., Acme Corporation"
              placeholderTextColor="rgba(255,255,255,0.40)"
            />

            <Text style={styles.inputLabel}>Organization Code</Text>
            <TextInput
              style={styles.input}
              value={newOrgCode}
              onChangeText={setNewOrgCode}
              placeholder="e.g., acme-corp"
              placeholderTextColor="rgba(255,255,255,0.40)"
              autoCapitalize="none"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreateOrgModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, (!newOrgName.trim() || !newOrgCode.trim()) && styles.saveButtonDisabled]}
                onPress={handleCreateOrg}
                disabled={!newOrgName.trim() || !newOrgCode.trim() || isCreatingOrg}
              >
                {isCreatingOrg ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
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
  header: {
    padding: 20,
    backgroundColor: 'transparent',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
      },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
      },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  statCardBlue: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderColor: 'rgba(59,130,246,0.25)',
  },
  statCardGreen: {
    backgroundColor: 'rgba(76,175,80,0.12)',
    borderColor: 'rgba(76,175,80,0.25)',
  },
  statCardPurple: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderColor: 'rgba(139,92,246,0.25)',
  },
  statCardRed: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.25)',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
      },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
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
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  quickActionBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
      },
  orgCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
  },
  orgCardDeleted: {
    opacity: 0.6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  orgIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  orgIconText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
      },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
      },
  orgNameDeleted: {
    textDecorationLine: 'line-through',
    color: 'rgba(255,255,255,0.40)',
  },
  orgCode: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
      },
  orgProperties: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.40)',
    marginTop: 4,
      },
  orgMeta: {
    alignItems: 'flex-end',
  },
  activeBadge: {
    backgroundColor: 'rgba(76,175,80,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.25)',
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4CAF50',
    textTransform: 'uppercase',
      },
  deletedBadge: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  deletedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
    textTransform: 'uppercase',
      },
  orgActions: {
    marginLeft: 12,
  },
  deleteButton: {
    padding: 8,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  restoreButton: {
    padding: 8,
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 15,
    color: 'rgba(255,255,255,0.40)',
    fontWeight: '500',
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
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(112,143,150,0.85)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
      },
  listContainer: {
    padding: 20,
    paddingTop: 0,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.70)',
      },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
      },
  userEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
      },
  masterBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(139,92,246,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
  },
  masterBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#8B5CF6',
    letterSpacing: 0.5,
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
  profileCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    margin: 20,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 4,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  profileAvatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
      },
  profileBadge: {
    backgroundColor: 'rgba(112,143,150,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(112,143,150,0.25)',
  },
  profileBadgeText: {
    fontSize: 12,
    fontWeight: '700',
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
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6,9,18,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderTopWidth: 1,
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
    color: '#FFFFFF',
      },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 8,
    textTransform: 'uppercase',
      },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 16,
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
      },
  saveButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(112,143,150,0.85)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
      },
});
