import React, { useEffect, useState } from 'react';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react-native';
import { queryKeys } from '@/utils/queryKeys';
import { getExecutiveReport, ExecutiveReportResponse } from '@/utils/api/mobileApi';
import { BarChart, LineChart, KPICard } from '@/components/shared/ReportCharts';

function TrendBadge({ value }: { value: number }) {
  const isUp = value > 0;
  return (
    <View style={[styles.badge, { backgroundColor: isUp ? '#22C55E18' : '#EF444418' }]}>
      {isUp
        ? <TrendingUp size={12} color="#22C55E" strokeWidth={2} />
        : <TrendingDown size={12} color="#EF4444" strokeWidth={2} />
      }
      <Text style={[styles.badgeText, { color: isUp ? '#22C55E' : '#EF4444' }]}>
        {isUp ? '+' : ''}{value}%
      </Text>
    </View>
  );
}

function StatusRow({ label, count, color }: { label: string; count: number; color: string }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusLabel, { color: isDark ? '#E2E8F0' : '#475569' }]}>{label}</Text>
      <Text style={[styles.statusCount, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>{count}</Text>
    </View>
  );
}

export default function ExecutiveSummaryScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';

  const [data, setData] = useState<ExecutiveReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const result = await getExecutiveReport(propertyId);
    setData(result as ExecutiveReportResponse);
    setLoading(false);
    setRefreshing(false);
  };

  const { refetch } = useDashboardFetch(queryKeys.property.reportsExecutive(propertyId), load, {
    staleTime: 1000 * 60 * 5,
  });

  const onRefresh = () => { setRefreshing(true); refetch().then(() => setRefreshing(false)); };

  const bg = isDark ? '#151B2B' : '#F8FAFC';

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.loadingWrap}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading executive summary…</Text>
        </View>
      </View>
    );
  }

  if (data?.error || !data) {
    return (
      <View style={[styles.container, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.loadingWrap}>
          <Text style={styles.errorText}>{data?.error || 'Failed to load report'}</Text>
        </View>
      </View>
    );
  }

  const { property, allTimeTotal, prevMonth, currMonth, topCategories, trends } = data;

  const closureDiff = currMonth.closureRate - prevMonth.closureRate;
  const ticketDiff = prevMonth.total > 0
    ? Math.round(((currMonth.total - prevMonth.total) / prevMonth.total) * 100)
    : 0;

  const monthBarData = {
    labels: [prevMonth.label.split(' ')[0], currMonth.label.split(' ')[0]],
    series: [
      { label: 'Total', data: [prevMonth.total, currMonth.total], color: '#475569' },
      { label: 'Closed', data: [prevMonth.closed, currMonth.closed], color: '#22C55E' },
      { label: 'Open', data: [prevMonth.open, currMonth.open], color: '#F97316' },
    ],
  };

  const makeLabels = (days: number) =>
    Array.from({ length: days }, (_, i) => (i % 5 === 0 ? `${i + 1}` : ''));

  const trendData = {
    labels: makeLabels(trends.curr.length),
    series: [
      { label: currMonth.label.split(' ')[0], data: trends.curr, color: '#708F96' },
      { label: prevMonth.label.split(' ')[0], data: trends.prev, color: '#CBD5E1' },
    ],
  };

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
              Executive Summary
            </Text>
          </View>
          <Text style={[styles.subtitle, { color: isDark ? '#708F96' : '#708F96' }]}>
            {property.name} · {property.code}
          </Text>
        </View>

        {/* All-time banner */}
        <View style={styles.banner}>
          <Text style={styles.bannerLabel}>ALL-TIME TICKETS</Text>
          <Text style={styles.bannerValue}>{allTimeTotal.toLocaleString()}</Text>
        </View>

        {/* KPI Cards */}
        <View style={styles.kpiGrid}>
          <KPICard
            label="This Month"
            value={currMonth.total}
            sub="requests created"
            color="#1A2332"
            trend={{ value: ticketDiff, label: 'vs last month' }}
          />
          <KPICard
            label="Closure Rate"
            value={`${currMonth.closureRate}%`}
            sub="requests closed"
            color="#22C55E"
            trend={{ value: Math.round(closureDiff), label: 'vs last month' }}
          />
        </View>
        <View style={styles.kpiGrid}>
          <KPICard
            label="Closed"
            value={currMonth.closed}
            sub="this month"
            color="#22C55E"
          />
          <KPICard
            label="Open"
            value={currMonth.open}
            sub="active requests"
            color="#F97316"
          />
        </View>

        {/* Status Breakdown */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1E2535' : '#FFFFFF' }]}>
          <Text style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
            This Month Breakdown
          </Text>
          <StatusRow label="Created" count={currMonth.total} color="#475569" />
          <StatusRow label="Closed" count={currMonth.closed} color="#22C55E" />
          <StatusRow label="Open" count={currMonth.open} color="#F97316" />
        </View>

        {/* Month-over-Month Bar Chart */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1E2535' : '#FFFFFF' }]}>
          <Text style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
            Monthly Volume Comparison
          </Text>
          <BarChart data={monthBarData} />
        </View>

        {/* 30-Day Trend */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1E2535' : '#FFFFFF' }]}>
          <Text style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
            30-Day Request Trend
          </Text>
          <LineChart data={trendData} />
        </View>

        {/* Top Categories */}
        {topCategories.length > 0 && (
          <View style={[styles.card, { backgroundColor: isDark ? '#1E2535' : '#FFFFFF' }]}>
            <Text style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
              Top Categories (All Time)
            </Text>
            {topCategories.map((cat, i) => (
              <View key={i} style={styles.catRow}>
                <View style={styles.catRank}>
                  <Text style={styles.catRankText}>{i + 1}</Text>
                </View>
                <Text style={[styles.catName, { color: isDark ? '#E2E8F0' : '#475569' }]}>{cat.name}</Text>
                <Text style={[styles.catCount, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>{cat.count}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Previous Month Stats */}
        <View style={[styles.prevCard, { backgroundColor: isDark ? '#1E2535' : '#FFFFFF' }]}>
          <Text style={[styles.cardTitle, { color: isDark ? '#708F96' : '#708F96' }]}>
            {prevMonth.label} — Previous Month
          </Text>
          <Text style={[styles.miniStat, { color: isDark ? '#E2E8F0' : '#475569' }]}>
            {prevMonth.total} created · {prevMonth.closed} closed · {prevMonth.closureRate}% closure rate
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontFamily: 'Urbanist-Regular', fontSize: 14 },
  errorText: { color: '#EF4444', fontFamily: 'Urbanist-Regular', fontSize: 14 },
  header: { marginBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  title: { fontSize: 22, fontFamily: 'Poppins-Bold' },
  subtitle: { fontSize: 13, fontFamily: 'Urbanist-Regular', marginLeft: 32 },
  banner: { backgroundColor: '#708F9618', borderRadius: 14, padding: 16, marginBottom: 16, alignItems: 'center' },
  bannerLabel: { fontFamily: 'Poppins-Bold', fontSize: 10, letterSpacing: 1, color: '#708F96' },
  bannerValue: { fontFamily: 'Poppins-Bold', fontSize: 36, color: '#708F96', marginTop: 4 },
  kpiGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: { borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTitle: { fontFamily: 'Poppins-Bold', fontSize: 14, marginBottom: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { flex: 1, fontFamily: 'Urbanist-Regular', fontSize: 13 },
  statusCount: { fontFamily: 'Poppins-Bold', fontSize: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontFamily: 'Poppins-Bold', fontSize: 11 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(112,143,150,0.12)' },
  catRank: { width: 22, height: 22, borderRadius: 6, justifyContent: 'center', alignItems: 'center', backgroundColor: '#708F9618' },
  catRankText: { fontFamily: 'Poppins-Bold', fontSize: 11, color: '#708F96' },
  catName: { flex: 1, fontFamily: 'Urbanist-Medium', fontSize: 13 },
  catCount: { fontFamily: 'Poppins-Bold', fontSize: 14 },
  prevCard: { borderRadius: 14, padding: 16, marginBottom: 12, opacity: 0.8 },
  miniStat: { fontFamily: 'Urbanist-Regular', fontSize: 13, paddingVertical: 4 },
});
