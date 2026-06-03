import React, { useEffect, useState, useCallback } from 'react';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { queryKeys } from '@/utils/queryKeys';
import { getRequestsReport, RequestsReportResponse, SnagTicket } from '@/utils/api/mobileApi';
import { BarChart, KPICard } from '@/components/shared/ReportCharts';

const MONTHS = [
  '2026-03', '2026-02', '2026-01',
  '2025-12', '2025-11', '2025-10',
];

const MONTH_LABELS: Record<string, string> = {
  '2026-03': 'Mar 2026', '2026-02': 'Feb 2026', '2026-01': 'Jan 2026',
  '2025-12': 'Dec 2025', '2025-11': 'Nov 2025', '2025-10': 'Oct 2025',
};

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
      <Text style={[styles.badgeText, { color }]}>
        {status.replace(/_/g, ' ').toUpperCase()}
      </Text>
    </View>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const color = priority === 'critical' ? '#EF4444'
    : priority === 'urgent' ? '#F97316'
    : priority === 'high' ? '#EAB308'
    : '#708F96';
  return <View style={[styles.priorityDot, { backgroundColor: color }]} />;
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
          <PriorityDot priority={ticket.priority} />
          <Text style={[styles.ticketNum, { color: isDark ? '#708F96' : '#708F96' }]}>
            {ticket.ticketNumberDisplay}
          </Text>
          <StatusBadge status={ticket.status} />
        </View>
        <Text style={[styles.ticketTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}
          numberOfLines={1}>
          {ticket.title || ticket.description?.slice(0, 60) || 'Untitled'}
        </Text>
        <Text style={[styles.ticketMeta, { color: isDark ? '#708F96' : '#708F96' }]}>
          {ticket.category} · {ticket.floorLabel} · {ticket.spocName}
        </Text>
      </View>
    </View>
  );
}

export default function RequestsReportScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';

  const [monthIdx, setMonthIdx] = useState(0);
  const [data, setData] = useState<RequestsReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const selectedMonth = MONTHS[monthIdx];

  const load = useCallback(async (month: string) => {
    const result = await getRequestsReport(propertyId, month);
    setData(result as RequestsReportResponse);
    setLoading(false);
    setRefreshing(false);
  }, [propertyId]);

  const { refetch } = useDashboardFetch(queryKeys.property.reportsRequests(propertyId, selectedMonth), () => load(selectedMonth), {
    staleTime: 1000 * 60 * 5,
  });

  const onRefresh = () => { setRefreshing(true); refetch().then(() => setRefreshing(false)); };

  const prevMonth = () => { if (monthIdx < MONTHS.length - 1) setMonthIdx(m => m + 1); };
  const nextMonth = () => { if (monthIdx > 0) setMonthIdx(m => m - 1); };

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
              Requests Report
            </Text>
          </View>
        </View>

        {/* Month Picker */}
        <View style={[styles.monthPicker, { backgroundColor: cardBg }]}>
          <TouchableOpacity onPress={prevMonth} disabled={monthIdx >= MONTHS.length - 1}>
            <ChevronLeft size={20} color={monthIdx >= MONTHS.length - 1 ? '#CBD5E1' : '#708F96'} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={[styles.monthLabel, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
            {MONTH_LABELS[selectedMonth] || selectedMonth}
          </Text>
          <TouchableOpacity onPress={nextMonth} disabled={monthIdx <= 0}>
            <ChevronRight size={20} color={monthIdx <= 0 ? '#CBD5E1' : '#708F96'} strokeWidth={2} />
          </TouchableOpacity>
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
            {/* Property */}
            <Text style={[styles.propertyName, { color: isDark ? '#708F96' : '#708F96' }]}>
              {data.property?.name} · {data.property?.code}
            </Text>

            {/* KPIs */}
            <View style={styles.kpiGrid}>
              <KPICard
                label="Total"
                value={data.kpis.totalSnags}
                sub="requests"
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
                sub="in progress"
                color="#F97316"
              />
              <KPICard
                label="Closure Rate"
                value={`${data.kpis.closureRate}%`}
                sub="completion"
                color="#22C55E"
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
                  series: [{ label: 'Requests', data: data.charts.floor.data, color: '#708F96' }],
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
                Tickets ({data.tickets.length})
              </Text>
              {data.tickets.length === 0 ? (
                <Text style={[styles.emptyText, { color: isDark ? '#708F96' : '#708F96' }]}>
                  No tickets found for this period.
                </Text>
              ) : (
                data.tickets.slice(0, 30).map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} />
                ))
              )}
              {data.tickets.length > 30 && (
                <Text style={[styles.moreText, { color: '#708F96' }]}>
                  +{data.tickets.length - 30} more tickets — view full report on web
                </Text>
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
  monthPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  monthLabel: { fontFamily: 'Poppins-Bold', fontSize: 15 },
  propertyName: { fontFamily: 'Urbanist-Regular', fontSize: 12, marginBottom: 16 },
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
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  moreText: { fontFamily: 'Urbanist-Regular', fontSize: 12, textAlign: 'center', paddingTop: 8 },
});
