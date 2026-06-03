import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fontSans,
  fontDisplay,
  GLASS_BG,
  GLASS_BORDER,
  LOVABLE_EMAIL,
} from './constants';
import { Org, SystemUser, Tab } from './types';

// ─── Overview Tab ────────────────────────────────────────────────────────────
export function OverviewTab({
  stats,
  organizations,
  onSeeAllOrgs,
}: {
  stats: { orgs: number; properties: number; users: number; tickets: number };
  organizations: Org[];
  onSeeAllOrgs: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.tabContent}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
    >
      <View style={styles.consoleHeader}>
        <Text style={styles.consoleTitle}>Lovable Control</Text>
        <Text style={styles.consoleSubtitle}>Super Admin Overview</Text>
      </View>

      {/* Stats grid — unified glass-morphism */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { borderColor: 'rgba(59,130,246,0.30)' }]}>
            <Ionicons name="business" size={20} color="#3B82F6" />
          </View>
          <Text style={styles.statNumber}>{stats.orgs}</Text>
          <Text style={styles.statLabel}>Organizations</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { borderColor: 'rgba(76,175,80,0.30)' }]}>
            <Ionicons name="grid" size={20} color="#4CAF50" />
          </View>
          <Text style={styles.statNumber}>{stats.properties}</Text>
          <Text style={styles.statLabel}>Properties</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { borderColor: 'rgba(139,92,246,0.30)' }]}>
            <Ionicons name="people" size={20} color="#8B5CF6" />
          </View>
          <Text style={styles.statNumber}>{stats.users}</Text>
          <Text style={styles.statLabel}>Users</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { borderColor: 'rgba(239,68,68,0.30)' }]}>
            <Ionicons name="ticket" size={20} color="#EF4444" />
          </View>
          <Text style={styles.statNumber}>{stats.tickets}</Text>
          <Text style={styles.statLabel}>Open Tickets</Text>
        </View>
      </View>

      {/* Recent orgs */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Organizations</Text>
          <TouchableOpacity onPress={onSeeAllOrgs}>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>
        {organizations.slice(0, 3).map((org) => (
          <View key={org.id} style={styles.orgCard}>
            <View style={styles.orgIcon}>
              <Text style={styles.orgIconText}>{org.name.substring(0, 2).toUpperCase()}</Text>
            </View>
            <View style={styles.orgInfo}>
              <Text style={styles.orgName}>{org.name}</Text>
              <Text style={styles.orgCode}>/{org.code}</Text>
            </View>
            <View style={org.is_deleted ? styles.deletedBadge : styles.activeBadge}>
              <Text style={org.is_deleted ? styles.deletedText : styles.activeText}>
                {org.is_deleted ? 'Cooling' : 'Active'}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Organizations Tab ───────────────────────────────────────────────────────
export function OrganizationsTab({
  organizations,
  searchQuery,
  setSearchQuery,
}: {
  organizations: Org[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const filtered = useMemo(() => {
    if (!searchQuery) return organizations;
    const q = searchQuery.toLowerCase();
    return organizations.filter(
      (o) =>
        o.name?.toLowerCase().includes(q) || o.code?.toLowerCase().includes(q)
    );
  }, [organizations, searchQuery]);

  return (
    <ScrollView
      style={styles.tabContent}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
    >
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="rgba(255,255,255,0.45)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search organizations..."
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.45)" />
          </TouchableOpacity>
        )}
      </View>

      {filtered.map((org) => (
        <View key={org.id} style={styles.orgCard}>
          <View style={styles.orgIcon}>
            <Text style={styles.orgIconText}>{org.name.substring(0, 2).toUpperCase()}</Text>
          </View>
          <View style={styles.orgInfo}>
            <Text style={styles.orgName}>{org.name}</Text>
            <Text style={styles.orgCode}>/{org.code}</Text>
            <Text style={styles.orgMeta}>{org.properties?.[0]?.count ?? 0} Properties</Text>
          </View>
          <View style={org.is_deleted ? styles.deletedBadge : styles.activeBadge}>
            <Text style={org.is_deleted ? styles.deletedText : styles.activeText}>
              {org.is_deleted ? 'Cooling' : 'Active'}
            </Text>
          </View>
        </View>
      ))}
      {filtered.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={40} color="rgba(255,255,255,0.30)" />
          <Text style={styles.emptyText}>No organizations found</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Users Tab ───────────────────────────────────────────────────────────────
export function UsersTab({
  users,
  searchQuery,
  setSearchQuery,
}: {
  users: SystemUser[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const filtered = useMemo(() => {
    if (!searchQuery) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  return (
    <ScrollView
      style={styles.tabContent}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
    >
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="rgba(255,255,255,0.45)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users..."
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.45)" />
          </TouchableOpacity>
        )}
      </View>

      {filtered.map((u) => (
        <View key={u.id} style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {u.full_name?.substring(0, 2).toUpperCase() ??
                u.email.substring(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{u.full_name || 'Unknown'}</Text>
            <Text style={styles.userEmail}>{u.email}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.30)" />
        </View>
      ))}
      {filtered.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={40} color="rgba(255,255,255,0.30)" />
          <Text style={styles.emptyText}>No users found</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────
export function ProfileTab({ 
  onSignOut,
  user,
}: { 
  onSignOut: () => void,
  user?: { email?: string; full_name?: string; phone?: string | null } | null,
}) {
  const insets = useSafeAreaInsets();
  const displayName = user?.full_name || 'Super Admin';
  const displayEmail = user?.email || 'sanyog@gmail.com';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <ScrollView
      style={styles.tabContent}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
    >
      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{initial}</Text>
          </View>
          <View style={styles.profileBadge}>
            <Text style={styles.profileBadgeText}>SUPER ADMIN</Text>
          </View>
        </View>
        <View style={styles.profileInfo}>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Name</Text>
            <Text style={styles.profileValue}>{displayName}</Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Email</Text>
            <Text style={styles.profileValue}>{displayEmail}</Text>
          </View>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Role</Text>
            <Text style={styles.profileValue}>Super Admin</Text>
          </View>
          <View style={[styles.profileRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.profileLabel}>Access Level</Text>
            <Text style={styles.profileValue}>Full Organization Access</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={onSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabContent: { flex: 1, zIndex: 10 },
  consoleHeader: { padding: 20, paddingBottom: 8 },
  consoleTitle: {
        fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  consoleSubtitle: {
        fontSize: 13,
    color: 'rgba(255,255,255,0.50)',
    marginTop: 2,
  },
  statsGrid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    paddingHorizontal: 16, 
    gap: 12, 
    marginBottom: 8 
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
    padding: 16,
    alignItems: 'center',
  },
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statNumber: {
        fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 8,
  },
  statLabel: {
        fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
  },
  section: { padding: 20, paddingTop: 8 },
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
  seeAll: { 
     
    fontSize: 13, 
    fontWeight: '600', 
    color: '#708F96' 
  },
  orgCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 14,
    marginBottom: 12,
  },
  orgIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(112,143,150,0.20)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  orgIconText: {
        fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  orgInfo: { flex: 1 },
  orgName: { 
     
    fontSize: 15, 
    fontWeight: '600', 
    color: '#FFFFFF' 
  },
  orgCode: { 
     
    fontSize: 12, 
    color: 'rgba(255,255,255,0.55)', 
    marginTop: 2 
  },
  orgMeta: { 
     
    fontSize: 12, 
    color: 'rgba(255,255,255,0.40)', 
    marginTop: 4 
  },
  activeBadge: {
    backgroundColor: 'rgba(76,175,80,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.25)',
  },
  activeText: {
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
  deletedText: {
        fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
    textTransform: 'uppercase',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 14,
    marginBottom: 12,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  userAvatarText: {
        fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.70)',
  },
  userInfo: { flex: 1 },
  userName: { 
     
    fontSize: 15, 
    fontWeight: '600', 
    color: '#FFFFFF' 
  },
  userEmail: { 
     
    fontSize: 13, 
    color: 'rgba(255,255,255,0.55)', 
    marginTop: 2 
  },
  profileCard: {
    backgroundColor: GLASS_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    margin: 20,
    alignItems: 'center',
    padding: 24,
  },
  profileHeader: { alignItems: 'center', marginBottom: 24 },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(112,143,150,0.25)',
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
    backgroundColor: 'rgba(112,143,150,0.20)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(112,143,150,0.30)',
  },
  profileBadgeText: {
        fontSize: 11,
    fontWeight: '800',
    color: '#708F96',
    letterSpacing: 1,
  },
  profileInfo: { width: '100%' },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
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
    color: '#FFFFFF' 
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  signOutText: { 
     
    fontSize: 15, 
    fontWeight: '600', 
    color: '#FF3B30' 
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
        paddingVertical: 0,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
        fontSize: 15,
    color: 'rgba(255,255,255,0.45)', // Fixed Issue #14: was rgba(0,0,0,0.35)
    marginTop: 12,
  },
});
