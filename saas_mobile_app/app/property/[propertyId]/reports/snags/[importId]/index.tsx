import React, { useEffect, useState } from 'react';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { ArrowLeft } from 'lucide-react-native';
import { queryKeys } from '@/utils/queryKeys';
import { getSnagReport, SnagReportResponse, SnagTicket } from '@/utils/api/mobileApi';
import { BarChart, KPICard } from '@/components/shared/ReportCharts';

const STATUS_COLORS: Record<string, string> = {
  open: '#F97316',
  in_progress: '#3B82F6',
  pending_validation: '#A855F7',
  resolved: '#22C55E',
  closed: '#22C55E',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#708F96';
  return (
    <View style={[styles.badge, { backgroundColor: color + '18' }]}>
      <Text style={[styles.badgeText, { color }]}>{status.replace(/_/g, ' ').toUpperCase()}</Text>
    </View>
  );
}

function TicketRow({ ticket }: { ticket: SnagTicket }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const bg = isDark ? '#1E2535' : '#FFFFFF';
  const border = isDark ? '#2D3748' : '#E2E8F0';

  return (
    <View style={[styles.ticketRow, { backgroundColor: bg, borderColor: border }]}>
      <View style={styles.ticketLeft}>
        <View style={styles.ticketNumRow}>
          <Text style={[styles.ticketNum, { color: isDark ? '#708F96' : '#708F96' }]}>
            {ticket.ticketNumberDisplay}
          </Text>
          <StatusBadge status={ticket.status} />
        </View>
        <Text style={[styles.ticketTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]} numberOfLines={1}>
          {ticket.title || ticket.description?.slice(0, 60) || 'Untitled'}
        </Text>
        <Text style={[styles.ticketMeta, { color: isDark ? '#708F96' : '#708F96' }]}>
          {ticket.category} · {ticket.floorLabel} · {ticket.spocName}
        </Text>
      </View>
    </View>
  );
}

export default function SnagReportDetailScreen() {
  const { propertyId, importId } = useLocalSearchParams<{ propertyId: string; importId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';

  const [data, setData] = useState<SnagReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const result = await getSnagReport(importId);
    setData(result as SnagReportResponse);
    setLoading(false);
    setRefreshing(false);
  };

  const { refetch } = useDashboardFetch(queryKeys.reports.reportsSnagDetail(importId), load, {
    staleTime: 1000 * 60 * 5,
  });

  const onRefresh = () => { setRefreshing(true); refetch().then(() => setRefreshing(false)); };

  const bg = isDark ? '#151B2B' : '#F8FAFC';
  const cardBg = isDark ? '#1E2535' : '#FFFFFF';

  return (
    <View style={[styles.container, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#708F96" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <ArrowLeft
              size={20}
              color={isDark ? '#F8FAFC' : '#1A2332'}
              strokeWidth={2}
              onPress={() => router.back()}
            />
            <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
              Snag Report
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#708F96" />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading report…</Text>
          </View>
        ) : data?.error ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.errorText}>{data.error}</Text>
          </View>
        ) : data ? (
          <>
            {/* Import info */}
            <View style={styles.importBanner}>
              <Text style={styles.importFilename}>{data.import.filename}</Text>
              <Text style={styles.importMeta}>
                {data.import.totalRows} rows imported · {data.import.validRows} valid ·{' '}
                {data.import.completedAt
                  ? `Completed ${new Date(data.import.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : 'Processing'}
              </Text>
            </View>

            {/* KPIs */}
            <View style={styles.kpiGrid}>
              <KPICard
                label="Total Snags"
                value={data.kpis.totalSnags}
                sub="imported"
                color="#1A2332"
              />
              <KPICard
                label="Closed"
                value={data.kpis.closedSnags}
                sub={`${data.kpis.closureRate}% closure`}
                color="#22C55E"
              />
            </View>
            <View style={styles.kpiGrid}>
              <KPICard
                label="Open"
                value={data.kpis.openSnags}
                sub="pending"
                color="#F97316"
              />
            </View>

            {/* Floor Chart */}
            {data.charts.floor.labels.length > 0 && (
              <View style={[styles.card, { backgroundColor: cardBg }]}>
                <Text style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
                  By Floor
                </Text>
                <BarChart data={{
                  labels: data.charts.floor.labels,
                  series: [{ label: 'Snags', data: data.charts.floor.data, color: '#F97316' }],
                }} />
              </View>
            )}

            {/* Department Chart */}
            {data.charts.department.labels.length > 0 && (
              <View style={[styles.card, { backgroundColor: cardBg }]}>
                <Text style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
                  By Category
                </Text>
                <BarChart data={{
                  labels: data.charts.department.labels.map(l => l.length > 10 ? l.slice(0, 9) + '…' : l),
                  series: [
                    { label: 'Open', data: data.charts.department.open || [], color: '#F97316' },
                    { label: 'Closed', data: data.charts.department.closed || [], color: '#22C55E' },
                  ],
                }} />
              </View>
            )}

            {/* Ticket List */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
                Snags ({data.tickets.length})
              </Text>
              {data.tickets.length === 0 ? (
                <Text style={[styles.emptyText, { color: isDark ? '#708F96' : '#708F96' }]}>
                  No snags in this import.
                </Text>
              ) : (
                data.tickets.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} />
                ))
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 40 },
  loadingText: { fontFamily: 'Urbanist-Regular', fontSize: 13 },
  errorText: { color: '#EF4444', fontFamily: 'Urbanist-Regular', fontSize: 14 },
  header: { marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 22, fontFamily: 'Poppins-Bold' },
  importBanner: { backgroundColor: '#F9731618', borderRadius: 14, padding: 16, marginBottom: 12 },
  importFilename: { fontFamily: 'Poppins-Bold', fontSize: 14, color: '#F97316', marginBottom: 4 },
  importMeta: { fontFamily: 'Urbanist-Regular', fontSize: 12, color: '#708F96' },
  kpiGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: { borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTitle: { fontFamily: 'Poppins-Bold', fontSize: 14, marginBottom: 12 },
  emptyText: { fontFamily: 'Urbanist-Regular', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  ticketRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  ticketLeft: { flex: 1 },
  ticketNumRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  ticketNum: { fontFamily: 'Urbanist-Regular', fontSize: 11 },
  ticketTitle: { fontFamily: 'Poppins-Medium', fontSize: 13, marginBottom: 2 },
  ticketMeta: { fontFamily: 'Urbanist-Regular', fontSize: 11 },
  badge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontFamily: 'Urbanist-Bold', fontSize: 9, letterSpacing: 0.5 },
});
