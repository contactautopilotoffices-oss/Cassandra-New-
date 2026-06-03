import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createClient } from '@/utils/supabase/client';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';

interface OrgUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  joined_at: string;
}

export default function UserManagement({ orgId }: { orgId: string }) {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const supabase = useMemo(() => createClient(), []);

  const fetchOrgUsersWrapper = useCallback(async () => {
    await fetchOrgUsers();
  }, [orgId]);

  const { refetch } = useDashboardFetch(queryKeys.org.orgUsers(orgId), fetchOrgUsersWrapper, {
    staleTime: 1000 * 60 * 5,
  });

  const fetchOrgUsers = async () => {
    setIsLoading(true);
    const { data, error } = await (supabase
      .from('organization_memberships')
      .select('role, is_active, created_at, users(id, full_name, email)')
      .eq('organization_id', orgId) as any);

    if (!error && data) {
      const formatted: OrgUser[] = data.map((item: any) => ({
        id: item.users.id,
        full_name: item.users.full_name,
        email: item.users.email,
        role: item.role,
        is_active: item.is_active,
        joined_at: item.created_at,
      })).sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));
      setUsers(formatted);
    }
    setIsLoading(false);
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    Alert.alert(
      currentStatus ? 'Suspend User?' : 'Activate User?',
      currentStatus ? 'This will suspend the user.' : 'This will reactivate the user.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: currentStatus ? 'destructive' : 'default',
          onPress: async () => {
            await (supabase as any)
              .from('organization_memberships')
              .update({ is_active: !currentStatus })
              .eq('user_id', userId)
              .eq('organization_id', orgId);
            fetchOrgUsers();
          },
        },
      ]
    );
  };

  const formatRole = (role: string) => {
    let r = role === 'tenant' ? 'client' : role;
    return r.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const filteredUsers = users.filter(u =>
    u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={styles.pageTitle}>User Management</Text>
      <Text style={styles.pageSubtitle}>Manage permissions and access for your members.</Text>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={16} color="#94A3B8" style={{ marginLeft: 14 }} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name or email..."
          placeholderTextColor="#64748B"
        />
      </View>

      {/* User list */}
      {isLoading ? (
        <View style={styles.emptyState}><ActivityIndicator size="small" color="#708F96" /></View>
      ) : filteredUsers.length === 0 ? (
        <View style={styles.emptyState}><Text style={styles.emptyText}>No members found.</Text></View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <View style={styles.userCard}>
              {/* Avatar */}
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {item.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>

              {/* Info */}
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.full_name}</Text>
                <Text style={styles.userEmail}>{item.email}</Text>
                <View style={styles.metaRow}>
                  <View style={[styles.badge, item.is_active ? styles.badgeActive : styles.badgeSuspended]}>
                    <Text style={[styles.badgeText, item.is_active ? { color: '#10B981' } : { color: '#F43F5E' }]}>
                      {item.is_active ? 'Active' : 'Suspended'}
                    </Text>
                  </View>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{formatRole(item.role)}</Text>
                  </View>
                </View>
              </View>

              {/* Toggle */}
              <TouchableOpacity
                style={[styles.actionBtn, item.is_active ? styles.suspendBtn : styles.activateBtn]}
                onPress={() => handleToggleStatus(item.id, item.is_active)}
              >
                <Ionicons
                  name={item.is_active ? 'close-circle-outline' : 'shield-checkmark-outline'}
                  size={18}
                  color={item.is_active ? '#F43F5E' : '#10B981'}
                />
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  pageTitle: { fontSize: 24, fontWeight: '900', color: '#1A2332', marginBottom: 4 },
  pageSubtitle: { fontSize: 13, color: '#64748B', marginBottom: 16 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', height: 44,
    borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 16,
  },
  searchInput: { flex: 1, paddingHorizontal: 10, fontSize: 13, fontWeight: '500', color: '#1A2332' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 13, color: '#94A3B8' },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 16, backgroundColor: '#FFF',
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#708F96',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  userName: { fontSize: 14, fontWeight: '700', color: '#1A2332' },
  userEmail: { fontSize: 11, color: '#94A3B8' },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  badgeActive: { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)' },
  badgeSuspended: { backgroundColor: 'rgba(244,63,94,0.08)', borderColor: 'rgba(244,63,94,0.2)' },
  badgeText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: '#E2E8F0' },
  roleBadgeText: { fontSize: 9, fontWeight: '700', color: '#475569', textTransform: 'uppercase' },
  actionBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  suspendBtn: { borderColor: 'rgba(244,63,94,0.2)', backgroundColor: 'rgba(244,63,94,0.04)' },
  activateBtn: { borderColor: 'rgba(16,185,129,0.2)', backgroundColor: 'rgba(16,185,129,0.04)' },
});
