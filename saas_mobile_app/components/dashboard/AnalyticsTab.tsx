import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createClient } from '@/utils/supabase/client';
import { serverApi } from '@/lib/serverApi';
import { SPACING, CARD_SURFACES } from '@/constants/designSystem';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';

interface AnalyticsUser {
  user_id: string;
  full_name: string;
  email: string;
  sessions_this_week: number;
  avg_duration_minutes: number;
  total_sessions: number;
  last_active: string | null;
}

interface AnalyticsData {
  global: {
    active_users_7d: number;
    avg_session_duration_minutes: number;
    total_sessions_logged: number;
    total_user_base: number;
  };
  users: AnalyticsUser[];
}

const fontSans = 'System';
const fontDisplay = 'System';

function KPICard({ title, value, icon, accentColor }: { title: string; value: string | number; icon: keyof typeof Ionicons.glyphMap; accentColor: string }) {
  return (
    <View style={kpiStyles.card}>
      <View style={[kpiStyles.iconWrap, { borderColor: accentColor + '30' }]}>
        <Ionicons name={icon} size={16} color={accentColor} />
      </View>
      <Text style={kpiStyles.value}>{value}</Text>
      <Text style={kpiStyles.label}>{title}</Text>
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    backgroundColor: CARD_SURFACES.cardBg,
    padding: 16,
    alignItems: 'center',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  value: {
        fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  label: {
        fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
    textAlign: 'center',
  },
});

export default function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await serverApi.rpc('get_usage_metrics');
      if (res.error) throw new Error(res.error.message);
      setData(res.data as AnalyticsData);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const { refetch } = useDashboardFetch(queryKeys.analytics.analyticsTab(), fetchData, {
    staleTime: 1000 * 60 * 5,
  });

  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remaining = mins % 60;
    return `${hours}h ${remaining}m`;
  };

  const filteredUsers = data?.users.filter(u =>
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#708F96" />
        <Text style={styles.loadingText}>Analyzing Engagement Data...</Text>
      </View>
    );
  }

  const getRankColor = (idx: number) => {
    if (idx === 0) return '#F59E0B';
    if (idx === 1) return '#3B82F6';
    if (idx === 2) return '#F97316';
    return 'rgba(255,255,255,0.40)';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={styles.title}>User Engagement Analytics</Text>
      <Text style={styles.subtitle}>Real-time insights on user adoption and session performance.</Text>

      {/* KPI Row */}
      <View style={styles.kpiGrid}>
        <KPICard title="Active Users (7D)" value={data?.global.active_users_7d || 0} icon="people-outline" accentColor="#6366F1" />
        <KPICard title="Session Duration" value={formatDuration(data?.global.avg_session_duration_minutes || 0)} icon="time-outline" accentColor="#3B82F6" />
        <KPICard title="Total Sessions" value={data?.global.total_sessions_logged || 0} icon="flash-outline" accentColor="#F59E0B" />
        <KPICard title="Total Users" value={data?.global.total_user_base || 0} icon="pulse-outline" accentColor="#10B981" />
      </View>

      {/* Power Users */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconContainer}>
            <Ionicons name="trending-up-outline" size={18} color="#6366F1" />
          </View>
          <Text style={styles.sectionTitle}>Top Power Users</Text>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={14} color="rgba(255,255,255,0.45)" />
          <TextInput
            style={styles.searchInput}
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search users..."
            placeholderTextColor="rgba(255,255,255,0.35)"
          />
        </View>

        {/* User list */}
        {filteredUsers.length === 0 ? (
          <Text style={styles.emptyText}>No usage data available.</Text>
        ) : (
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.user_id}
            scrollEnabled={false}
            renderItem={({ item, index }) => (
              <View style={styles.userRow}>
                <Text style={[styles.rank, { color: getRankColor(index) }]}>#{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{item.full_name || 'System User'}</Text>
                  <Text style={styles.userEmail}>{item.email}</Text>
                </View>
                <View style={styles.statsCol}>
                  <Text style={styles.statValue}>{item.sessions_this_week}</Text>
                  <Text style={styles.statLabel}>This week</Text>
                </View>
                <View style={styles.statsCol}>
                  <Text style={styles.statValue}>{formatDuration(item.avg_duration_minutes)}</Text>
                  <Text style={styles.statLabel}>Avg time</Text>
                </View>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingVertical: 80 },
  loadingText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  title: {  fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  subtitle: {  fontSize: 13, color: 'rgba(255,255,255,0.50)', marginTop: 4 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  section: {
    backgroundColor: CARD_SURFACES.cardBg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    padding: 20,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(99,102,241,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {  fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '500', color: '#FFFFFF', },
  emptyText: { textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 13, padding: 32, },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rank: { fontSize: 13, fontWeight: '900', width: 32, },
  userName: { fontSize: 13, fontWeight: '900', color: '#FFFFFF', },
  userEmail: { fontSize: 11, color: 'rgba(255,255,255,0.45)', },
  statsCol: { alignItems: 'center', minWidth: 52 },
  statValue: { fontSize: 13, fontWeight: '900', color: 'rgba(255,255,255,0.80)', },
  statLabel: { fontSize: 9, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: 0.5, },
});
