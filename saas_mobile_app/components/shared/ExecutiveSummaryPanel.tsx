import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createClient } from '@/utils/supabase/client';

interface TicketData {
  id: string;
  category: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

interface ExecutiveSummaryPanelProps {
  propertyId: string;
}

function formatMonthYear(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function formatShortMonth(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short' });
}

export default function ExecutiveSummaryPanel({ propertyId }: ExecutiveSummaryPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);

  const currentDate = new Date();
  const currentMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const previousMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const currMonthLabel = formatMonthYear(currentMonthDate);
  const prevMonthLabel = formatMonthYear(previousMonthDate);
  const shortCurrMonth = formatShortMonth(currentMonthDate);
  const shortPrevMonth = formatShortMonth(previousMonthDate);

  useEffect(() => {
    if (!propertyId) return;
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data: tickets, error: ticketsError } = await supabase
          .from('tickets')
          .select('id, category, status, created_at, resolved_at, issue_category:category_id(name)')
          .eq('property_id', propertyId)
          .eq('is_internal', false)
          .order('created_at', { ascending: false });

        if (ticketsError) throw new Error(ticketsError.message);

        const { data: property } = await supabase
          .from('properties')
          .select('id, name, code')
          .eq('id', propertyId)
          .single();

        const normalised: TicketData[] = (tickets || []).map((t: any) => ({
          id: t.id,
          category: t.issue_category?.name || t.category || 'Other',
          status: t.status,
          created_at: t.created_at,
          resolved_at: t.resolved_at ?? null,
        }));

        processData(normalised, property);
      } catch (err: any) {
        setError(err.message || 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [propertyId]);

  const processData = (tickets: TicketData[], property: any) => {
    const allTimeTotal = tickets.length;

    const prevTickets = tickets.filter(t => {
      const d = new Date(t.created_at);
      return d.getMonth() === previousMonthDate.getMonth() && d.getFullYear() === previousMonthDate.getFullYear();
    });
    const currTickets = tickets.filter(t => {
      const d = new Date(t.created_at);
      return d.getMonth() === currentMonthDate.getMonth() && d.getFullYear() === currentMonthDate.getFullYear();
    });

    const getStats = (tickArr: TicketData[]) => {
      const total = tickArr.length;
      const closed = tickArr.filter(t => t.status === 'resolved' || t.status === 'closed').length;
      const open = total - closed;
      const rate = total > 0 ? (closed / total) * 100 : 0;
      const cats: Record<string, number> = {};
      tickArr.forEach(t => { const c = t.category || 'Other'; cats[c] = (cats[c] || 0) + 1; });
      const topCategories = Object.entries(cats).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
      return { total, closed, open, rate, topCategories };
    };

    setDashboardData({
      property,
      prevStats: getStats(prevTickets),
      currStats: getStats(currTickets),
      allTimeTotal,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Generating Executive Summary...</Text>
      </View>
    );
  }

  if (error || !dashboardData) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
        <Text style={styles.errorTitle}>Could not load dashboard</Text>
        <Text style={styles.errorText}>{error || 'No data available'}</Text>
      </View>
    );
  }

  const { property, prevStats, currStats, allTimeTotal } = dashboardData;
  const volumeChange = prevStats.total > 0 ? ((currStats.total - prevStats.total) / prevStats.total) * 100 : 0;
  const topCurrCat = currStats.topCategories[0] || { name: 'N/A', count: 0 };
  const topPrevCat = prevStats.topCategories[0] || { name: 'N/A', count: 0 };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      {/* Title */}
      <Text style={styles.title}>FMS Executive Impact Dashboard</Text>
      <Text style={styles.subtitle}>{property?.name} • {shortPrevMonth}–{shortCurrMonth} {currentDate.getFullYear()}</Text>

      {/* KPI Cards */}
      <View style={styles.kpiRow}>
        <KPIBox color="#1E3A8A" label="TOTAL MANAGED" value={allTimeTotal} sub="All time" />
        <KPIBox color="#22C55E" label={`${shortPrevMonth} CLOSURE`} value={`${prevStats.rate.toFixed(1)}%`} sub={`${prevStats.closed}/${prevStats.total}`} />
      </View>
      <View style={styles.kpiRow}>
        <KPIBox color="#EAB308" label={`${shortCurrMonth} CLOSURE`} value={`${currStats.rate.toFixed(1)}%`} sub={`${currStats.closed}/${currStats.total}`} />
        <KPIBox color="#F97316" label={`OPEN (${shortCurrMonth.toUpperCase()})`} value={currStats.open} sub="Needs attention" />
      </View>

      {/* Summary Table */}
      <Text style={styles.sectionTitle}>Monthly Performance Summary</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { flex: 2 }]}>Month</Text>
        <Text style={styles.th}>Total</Text>
        <Text style={styles.th}>Closed</Text>
        <Text style={styles.th}>Open</Text>
        <Text style={styles.th}>Rate</Text>
      </View>
      {[
        { month: shortPrevMonth, ...prevStats },
        { month: shortCurrMonth, ...currStats },
      ].map((row, idx) => (
        <View key={idx} style={[styles.tableRow, idx === 0 && { borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }]}>
          <Text style={[styles.td, { flex: 2, fontWeight: '700' }]}>{row.month}</Text>
          <Text style={styles.td}>{row.total}</Text>
          <Text style={styles.td}>{row.closed}</Text>
          <Text style={styles.td}>{row.open}</Text>
          <Text style={[styles.td, { fontWeight: '700' }]}>{row.rate.toFixed(1)}%</Text>
        </View>
      ))}

      {/* Insights */}
      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Key Insights</Text>
      {[
        { color: '#22C55E', text: `${shortPrevMonth}: ${prevStats.rate.toFixed(1)}% closure rate — ${prevStats.rate >= 90 ? 'excellent' : 'moderate'} performance` },
        { color: '#EAB308', text: `${shortCurrMonth}: ${currStats.total} tickets ${volumeChange > 0 ? `(${volumeChange.toFixed(0)}% increase)` : `(${Math.abs(volumeChange).toFixed(0)}% decrease)`}` },
        { color: '#EF4444', text: `${currStats.open} open tickets in ${shortCurrMonth} need immediate resolution` },
        { color: '#3B82F6', text: `Top category — ${topCurrCat.name} (${topCurrCat.count} tickets in ${shortCurrMonth})` },
        { color: '#8B5CF6', text: `${topPrevCat.name} prominent in ${shortPrevMonth} (${topPrevCat.count} tickets)` },
      ].map((item, idx) => (
        <View key={idx} style={styles.insightRow}>
          <View style={[styles.dot, { backgroundColor: item.color }]} />
          <Text style={styles.insightText}>{item.text}</Text>
        </View>
      ))}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerBrand}>FMS Impact Report • {property?.name}</Text>
        <Text style={styles.footerDate}>
          Generated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </Text>
      </View>
    </ScrollView>
  );
}

function KPIBox({ color, label, value, sub }: { color: string; label: string; value: string | number; sub: string }) {
  return (
    <View style={[styles.kpiBox, { borderTopColor: color }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingText: { fontSize: 14, color: '#64748B', marginTop: 12 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#EF4444', marginTop: 12 },
  errorText: { fontSize: 13, color: '#64748B', marginTop: 4, textAlign: 'center' },
  title: { fontSize: 18, fontWeight: '900', color: '#1E3A8A', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#64748B', textAlign: 'center', marginBottom: 20 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  kpiBox: { flex: 1, backgroundColor: '#F8FAFC', borderTopWidth: 3, borderWidth: 1, borderColor: '#E2E8F0', padding: 12 },
  kpiLabel: { fontSize: 9, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 },
  kpiValue: { fontSize: 28, fontWeight: '900', lineHeight: 32, marginTop: 4 },
  kpiSub: { fontSize: 9, color: '#94A3B8', marginTop: 2 },
  sectionTitle: { fontSize: 12, fontWeight: '900', color: '#1E3A8A', marginBottom: 8, marginTop: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1E3A8A', paddingVertical: 8, paddingHorizontal: 10, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  th: { flex: 1, fontSize: 10, fontWeight: '700', color: '#FFF' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#FFF' },
  td: { flex: 1, fontSize: 11, color: '#64748B' },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  insightText: { flex: 1, fontSize: 12, color: '#475569', lineHeight: 18 },
  footer: { marginTop: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'space-between' },
  footerBrand: { fontSize: 9, fontWeight: '700', color: '#1E3A8A' },
  footerDate: { fontSize: 9, color: '#94A3B8' },
});
