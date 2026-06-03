import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/utils/supabase/client';
import { serverApi } from '@/lib/serverApi';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  Zap,
  TrendingUp,
  AlertTriangle,
  ArrowLeft,
  IndianRupee,
  BarChart3,
  Activity,
  ChevronDown,
  Calendar,
  X,
} from 'lucide-react-native';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

interface ElectricityMeter {
  id: string;
  name: string;
  meter_number?: string;
  meter_type?: string;
  max_load_kw?: number;
  status: string;
}

interface GridTariff {
  id: string;
  property_id: string;
  rate_per_unit: number;
  effective_from: string;
  effective_to: string | null;
  created_by?: string;
  created_at: string;
}

interface ElectricityReading {
  id: string;
  meter_id: string;
  opening_reading: number;
  closing_reading: number;
  computed_units?: number;
  final_units?: number;
  computed_cost?: number;
  tariff_rate_used?: number;
  multiplier_value_used?: number;
  multiplier_value?: number;
  reading_date?: string;
  created_at: string;
}

interface TrendPoint {
  date: string;
  cost: number;
  units: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPeriodDates(days: number): { start: string; days: number } {
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return { start: d.toISOString().split('T')[0], days };
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const fmtCost = (val: number) => val > 0 ? `₹${Math.round(val).toLocaleString()}` : '—';
const fmtUnits = (val: number) => {
  if (val === 0 || !val) return '—';
  return `${val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kVAh`;
};

// ─── Glass Card ───────────────────────────────────────────────────────────────

function GlassCard({ children, style, intensity = 50 }: { children: React.ReactNode; style?: any; intensity?: number }) {
  return (
    <SafeBlurView intensity={intensity} tint="dark" style={[styles.glassCard, { borderColor: 'rgba(255,255,255,0.1)' }, style]}>
      <LinearGradient
        colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.15)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.glassCardInner}>{children}</View>
    </SafeBlurView>
  );
}

// ─── Trend Chart ──────────────────────────────────────────────────────────────

function TrendChart({
  data,
  height = 200,
  color,
  labelColor,
  formatValue,
  fillGradient,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color: string;
  labelColor: string;
  formatValue?: (v: number) => string;
  fillGradient?: readonly [string, string, ...string[]];
}) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const chartW = SCREEN_W - 72;
  const barW = Math.max(6, (chartW - 32) / data.length - 3);

  return (
    <View style={{ height }}>
      <View style={[styles.barChartInner, { height: height - 24 }]}>
        <View style={styles.barChartYAxis}>
          <Text style={[styles.barChartYLabel, { color: labelColor }]}>{formatValue ? formatValue(maxVal) : maxVal.toFixed(0)}</Text>
          <Text style={[styles.barChartYLabel, { color: labelColor }]}>{formatValue ? formatValue(maxVal / 2) : (maxVal / 2).toFixed(0)}</Text>
          <Text style={[styles.barChartYLabel, { color: labelColor }]}>0</Text>
        </View>
        <View style={styles.barChartBars}>
          {data.map((d, i) => {
            const pct = maxVal > 0 ? (d.value / maxVal) * 100 : 0;
            return (
              <View key={i} style={[styles.barWrapper, { width: barW }]}>
                <View style={[styles.barChartTrack, { backgroundColor: color + '18' }]}>
                  <View
                    style={[
                      styles.barChartBar,
                      { backgroundColor: color, height: `${Math.max(pct, 1)}%` },
                    ]}
                  />
                  {fillGradient && (
                    <LinearGradient
                      colors={fillGradient as readonly [string, string, ...string[]]}
                      style={[StyleSheet.absoluteFillObject, { opacity: 0.25, borderRadius: 4 }]}
                    />
                  )}
                </View>
                {data.length <= 14 && (
                  <Text style={[styles.barChartXLabel, { color: labelColor }]} numberOfLines={1}>
                    {d.label}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── Metric Tile ──────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  unit,
  icon,
  accentColor,
  subtitle,
  timeframe,
  onTimeframeChange,
  isCustom,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: React.ReactNode;
  accentColor: string;
  subtitle?: string;
  timeframe?: 'today' | 'month';
  onTimeframeChange?: (t: 'today' | 'month') => void;
  isCustom?: boolean;
}) {
  return (
    <View style={{ flex: 1, borderRadius: 24, overflow: 'hidden', marginBottom: 12 }}>
      <SafeBlurView intensity={60} tint="dark" style={[styles.glassCard, { borderColor: accentColor + '30', borderWidth: 1, margin: 0, padding: 0, flex: 1 }]}>
        <LinearGradient colors={[accentColor + '15', 'transparent']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.glassCardInner}>
          <View style={styles.metricHeader}>
            <View style={[styles.metricIconWrap, { backgroundColor: accentColor + '25', shadowColor: accentColor, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 5 }]}>
              {icon}
            </View>
            {isCustom ? (
              <View style={[styles.customBadge, { backgroundColor: accentColor + '18' }]}>
                <Text style={[styles.customBadgeText, { color: accentColor }]}>Custom</Text>
              </View>
            ) : onTimeframeChange ? (
              <View style={styles.metricToggle}>
                <TouchableOpacity
                  onPress={() => onTimeframeChange('today')}
                  style={[styles.metricToggleBtn, timeframe === 'today' && { backgroundColor: accentColor + '25' }]}
                >
                  <Text style={[styles.metricToggleText, { color: timeframe === 'today' ? accentColor : '#94A3B8' }]}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onTimeframeChange('month')}
                  style={[styles.metricToggleBtn, timeframe === 'month' && { backgroundColor: accentColor + '25' }]}
                >
                  <Text style={[styles.metricToggleText, { color: timeframe === 'month' ? accentColor : '#94A3B8' }]}>Month</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          <View style={styles.metricValueWrap}>
            <Text style={[styles.metricValue, { color: '#FFFFFF' }]}>{value}</Text>
            {unit && <Text style={[styles.metricUnit, { color: '#94A3B8' }]}>{unit}</Text>}
          </View>
          <Text style={[styles.metricSub, { color: '#94A3B8', marginBottom: 4 }]}>{subtitle}</Text>
          <Text style={[styles.metricLabel, { color: '#64748B' }]}>{label}</Text>
        </View>
      </SafeBlurView>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ElectricityAnalyticsScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();

  // UI State
  const [viewMode, setViewMode] = useState<'combined' | 'meter'>('combined');
  const [selectedMeterId, setSelectedMeterId] = useState<string>('all');
  const [costTimeframe, setCostTimeframe] = useState<'today' | 'month'>('month');
  const [unitsTimeframe, setUnitsTimeframe] = useState<'today' | 'month'>('month');
  const [trendMetric, setTrendMetric] = useState<'cost' | 'units'>('cost');
  const [trendPeriod, setTrendPeriod] = useState<'7D' | '30D'>('7D');
  const [isCustomRange, setIsCustomRange] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMeterPicker, setShowMeterPicker] = useState(false);

  // Data State
  const [meters, setMeters] = useState<ElectricityMeter[]>([]);
  const [rawReadings, setRawReadings] = useState<{
    today: ElectricityReading[];
    month: ElectricityReading[];
    prevMonth: ElectricityReading[];
    trend: ElectricityReading[];
    custom: ElectricityReading[];
  }>({ today: [], month: [], prevMonth: [], trend: [], custom: [] });
  const [activeTariff, setActiveTariff] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    setIsLoading(true);
    try {
      const [metersRes] = await Promise.all([
        supabase
          .from('electricity_meters')
          .select('*')
          .eq('property_id', propertyId)
          .is('deleted_at', null)
          .order('name'),
      ]);
      const mts = (metersRes.data as ElectricityMeter[]) || [];
      setMeters(mts);

      // Tariff
      const { data: tariffData } = await (supabase as any)
        .rpc('get_active_grid_tariff', { p_property_id: propertyId, p_date: todayStr });
      const rpcTariffs = (tariffData || []) as GridTariff[];
      if (rpcTariffs.length > 0) {
        setActiveTariff(rpcTariffs[0].rate_per_unit || 0);
      } else {
        const { data: allTariffs } = await supabase
          .from('grid_tariffs')
          .select('*')
          .eq('property_id', propertyId)
          .order('effective_from', { ascending: false })
          .limit(1);
        const tariffs = (allTariffs || []) as GridTariff[];
        if (tariffs.length > 0) {
          setActiveTariff(tariffs[0].rate_per_unit || 0);
        }
      }

      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const prevMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0];
      const prevMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0];
      const trendStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const baseFilters = [{ op: 'eq' as const, column: 'property_id', value: propertyId }];

      const [todayR, monthR, prevMonthR, trendR] = await Promise.all([
        serverApi.query<ElectricityReading[]>({ table: 'electricity_readings', action: 'select', filters: [...baseFilters, { op: 'eq', column: 'reading_date', value: todayStr }] }),
        serverApi.query<ElectricityReading[]>({ table: 'electricity_readings', action: 'select', filters: [...baseFilters, { op: 'gte', column: 'reading_date', value: monthStart }] }),
        serverApi.query<ElectricityReading[]>({ table: 'electricity_readings', action: 'select', filters: [...baseFilters, { op: 'gte', column: 'reading_date', value: prevMonthStart }, { op: 'lte', column: 'reading_date', value: prevMonthEnd }] }),
        serverApi.query<ElectricityReading[]>({ table: 'electricity_readings', action: 'select', filters: [...baseFilters, { op: 'gte', column: 'reading_date', value: trendStart }] }),
      ]);

      let customR: any = { data: [] };
      if (isCustomRange && dateFrom && dateTo) {
        customR = await serverApi.query<ElectricityReading[]>({
          table: 'electricity_readings',
          action: 'select',
          filters: [...baseFilters, { op: 'gte', column: 'reading_date', value: dateFrom }, { op: 'lte', column: 'reading_date', value: dateTo }],
        });
      }

      setRawReadings({
        today: (todayR.data as ElectricityReading[]) || [],
        month: (monthR.data as ElectricityReading[]) || [],
        prevMonth: (prevMonthR.data as ElectricityReading[]) || [],
        trend: (trendR.data as ElectricityReading[]) || [],
        custom: (customR.data as ElectricityReading[]) || [],
      });
    } catch (e) {
      console.error('Electricity analytics fetch error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [propertyId, isCustomRange, dateFrom, dateTo]);

  const { refetch } = useDashboardFetch(queryKeys.property.electricityAnalytics(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5,
  });

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch().finally(() => setIsRefreshing(false));
  }, [refetch]);

  // Derived Metrics
  const metrics = useMemo(() => {
    const filterFn = (r: ElectricityReading) => {
      if (viewMode === 'combined') return true;
      return r.meter_id === selectedMeterId;
    };

    const calc = (readings: ElectricityReading[]) => {
      return readings.filter(filterFn).reduce(
        (acc, r) => {
          let cost = r.computed_cost || 0;
          const units = r.final_units ?? r.computed_units ?? 0;
          if (cost === 0 && activeTariff > 0) {
            cost = units * activeTariff;
          }
          return { cost: acc.cost + cost, units: acc.units + units };
        },
        { cost: 0, units: 0 }
      );
    };

    const today = calc(rawReadings.today);
    const month = calc(rawReadings.month);
    const prevMonth = calc(rawReadings.prevMonth);
    const custom = calc(rawReadings.custom);

    const avgCalc = (readings: ElectricityReading[]) => {
      const uniqueDays = new Set(readings.filter(filterFn).map((r) => r.reading_date)).size || 1;
      const totals = calc(readings);
      return { cost: totals.cost / uniqueDays, units: totals.units / uniqueDays };
    };

    const monthAvgs = avgCalc(rawReadings.month);
    const customAvgs = isCustomRange ? avgCalc(rawReadings.custom) : monthAvgs;

    return { today, month, prevMonth, custom, averages: isCustomRange ? customAvgs : monthAvgs };
  }, [rawReadings, viewMode, selectedMeterId, isCustomRange, activeTariff]);

  // Chart Data
  const chartData = useMemo(() => {
    const filterFn = (r: ElectricityReading) => {
      if (viewMode === 'combined') return true;
      return r.meter_id === selectedMeterId;
    };

    if (isCustomRange && dateFrom && dateTo) {
      const result: TrendPoint[] = [];
      const relevant = rawReadings.custom.filter(filterFn);
      const start = new Date(dateFrom);
      const end = new Date(dateTo);
      const dayMs = 24 * 60 * 60 * 1000;
      const totalDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(start.getTime() + i * dayMs);
        const dateStr = d.toISOString().split('T')[0];
        const label = formatDateLabel(dateStr);
        const dayReadings = relevant.filter((r) => r.reading_date === dateStr);
        const dayTotals = dayReadings.reduce(
          (acc, r) => {
            let cost = r.computed_cost || 0;
            const units = r.final_units ?? r.computed_units ?? 0;
            if (cost === 0 && activeTariff > 0) cost = units * activeTariff;
            return { cost: acc.cost + cost, units: acc.units + units };
          },
          { cost: 0, units: 0 }
        );
        result.push({ date: label, cost: dayTotals.cost, units: dayTotals.units });
      }
      return result;
    }

    const days = trendPeriod === '7D' ? 7 : 30;
    const result: TrendPoint[] = [];
    const now = new Date();
    const relevant = rawReadings.trend.filter(filterFn);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = formatDateLabel(dateStr);
      const dayReadings = relevant.filter((r) => r.reading_date === dateStr);
      const dayTotals = dayReadings.reduce(
        (acc, r) => {
          let cost = r.computed_cost || 0;
          const units = r.final_units ?? r.computed_units ?? 0;
          if (cost === 0 && activeTariff > 0) cost = units * activeTariff;
          return { cost: acc.cost + cost, units: acc.units + units };
        },
        { cost: 0, units: 0 }
      );
      result.push({ date: label, cost: dayTotals.cost, units: dayTotals.units });
    }
    return result;
  }, [rawReadings.trend, rawReadings.custom, trendPeriod, viewMode, selectedMeterId, isCustomRange, dateFrom, dateTo, activeTariff]);

  const trendChartData = useMemo(() => {
    return chartData.map((d) => ({ label: d.date, value: trendMetric === 'cost' ? d.cost : d.units }));
  }, [chartData, trendMetric]);

  const displayCost = isCustomRange ? metrics.custom.cost : costTimeframe === 'today' ? metrics.today.cost : metrics.month.cost;
  const displayUnits = isCustomRange ? metrics.custom.units : unitsTimeframe === 'today' ? metrics.today.units : metrics.month.units;

  // Per-meter totals
  const perMeterTotals = useMemo(() => {
    const m: Record<string, number> = {};
    meters.forEach((mt) => { m[mt.id] = 0; });
    rawReadings.month.forEach((r) => { m[r.meter_id] = (m[r.meter_id] ?? 0) + (r.final_units ?? r.computed_units ?? 0); });
    return m;
  }, [rawReadings.month, meters]);

  // Daily stats
  const dailyStats = useMemo(() => {
    const buckets: Record<string, number[]> = {};
    const now = new Date();
    const days = trendPeriod === '7D' ? 7 : 30;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets[d.toISOString().split('T')[0]] = [];
    }
    rawReadings.trend.forEach((r) => {
      const d = r.reading_date;
      if (d && buckets[d]) {
        buckets[d].push(r.final_units ?? r.computed_units ?? 0);
      }
    });
    const dailyTotals = Object.values(buckets).map((vals) => vals.reduce((a, b) => a + b, 0));
    if (dailyTotals.length === 0) return { peak: 0, avg: 0, low: 0 };
    return {
      peak: Math.max(...dailyTotals),
      avg: dailyTotals.reduce((a, b) => a + b, 0) / dailyTotals.length,
      low: Math.min(...dailyTotals.filter((v) => v > 0)) || 0,
    };
  }, [rawReadings.trend, trendPeriod]);

  const selectedMeterName = meters.find((m) => m.id === selectedMeterId)?.name || 'All Meters';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Gradient Background */}
      <LinearGradient colors={['#090E17', '#13112E', '#090E17']} style={StyleSheet.absoluteFillObject} />

      {/* Header */}
      <GlassCard intensity={60} style={styles.headerCard}>
        <LinearGradient
          colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.1)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={20} color="#E6EBEE" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Grid Power Analytics</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Tariff Badge */}
        {activeTariff > 0 ? (
          <View style={[styles.tariffBadge, { backgroundColor: 'rgba(52,199,89,0.15)', borderColor: 'rgba(52,199,89,0.25)' }]}>
            <Text style={[styles.tariffText, { color: '#34C759' }]}>Active Tariff: ₹{activeTariff}/kVAh</Text>
          </View>
        ) : (
          <View style={[styles.tariffBadge, { backgroundColor: 'rgba(255,159,10,0.15)', borderColor: 'rgba(255,159,10,0.25)' }]}>
            <AlertTriangle size={12} color="#FF9F0A" />
            <Text style={[styles.tariffText, { color: '#FF9F0A' }]}>No Active Tariff</Text>
          </View>
        )}

        {/* View Mode + Date Range */}
        <View style={styles.headerControls}>
          <View style={styles.scopeToggle}>
            <TouchableOpacity
              onPress={() => { setViewMode('combined'); setSelectedMeterId('all'); }}
              style={[styles.scopeBtn, viewMode === 'combined' && styles.scopeBtnActive]}
            >
              <Text style={[styles.scopeText, viewMode === 'combined' && styles.scopeTextActive]}>Combined</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setViewMode('meter'); if (meters.length) setSelectedMeterId(meters[0].id); }}
              style={[styles.scopeBtn, viewMode === 'meter' && styles.scopeBtnActive]}
            >
              <Text style={[styles.scopeText, viewMode === 'meter' && styles.scopeTextActive]}>Meter</Text>
              {viewMode === 'meter' && <ChevronDown size={12} color="#E6EBEE" />}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.dateRangeBtn} onPress={() => setShowDatePicker(true)}>
            <Calendar size={14} color="#94A3B8" />
            <Text style={styles.dateRangeText}>
              {isCustomRange ? `${dateFrom} → ${dateTo}` : 'Date Range'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Meter Selector */}
        {viewMode === 'meter' && (
          <TouchableOpacity style={styles.meterSelector} onPress={() => setShowMeterPicker(true)}>
            <Text style={styles.meterSelectorText}>{selectedMeterName}</Text>
            <ChevronDown size={14} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </GlassCard>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#708F96" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#708F96" />}
        >
          {/* Summary Tiles */}
          <View style={styles.tilesRow}>
            <MetricTile
              label="ELECTRICITY COST"
              value={fmtCost(displayCost)}
              accentColor="#2DD4BF"
              icon={<IndianRupee size={18} color="#2DD4BF" />}
              subtitle={isCustomRange ? `${dateFrom} to ${dateTo}` : costTimeframe === 'today' ? 'Total today' : 'Total this month'}
              timeframe={isCustomRange ? undefined : costTimeframe}
              onTimeframeChange={isCustomRange ? undefined : setCostTimeframe}
              isCustom={isCustomRange}
            />
            <MetricTile
              label="UNITS CONSUMED"
              value={fmtUnits(displayUnits)}
              accentColor="#60A5FA"
              icon={<Zap size={18} color="#60A5FA" />}
              subtitle={isCustomRange ? `${dateFrom} to ${dateTo}` : unitsTimeframe === 'today' ? 'Total today' : 'Total this month'}
              timeframe={isCustomRange ? undefined : unitsTimeframe}
              onTimeframeChange={isCustomRange ? undefined : setUnitsTimeframe}
              isCustom={isCustomRange}
            />
          </View>

          {/* Daily Average */}
          <GlassCard style={[styles.averageCard, { borderColor: '#F59E0B' + '30', borderWidth: 1 }]} intensity={60}>
            <LinearGradient colors={['rgba(245,158,11,0.05)', 'transparent']} style={StyleSheet.absoluteFillObject} />
            <View style={styles.averageHeader}>
              <View style={[styles.metricIconWrap, { backgroundColor: '#F59E0B' + '25', shadowColor: '#F59E0B', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 5 }]}>
                <BarChart3 size={18} color="#FBBF24" />
              </View>
              <Text style={[styles.metricLabel, { color: '#94A3B8', marginTop: 0 }]}>DAILY AVERAGE</Text>
            </View>
            <View style={styles.averageValues}>
              <View>
                <Text style={[styles.metricValue, { color: '#FFFFFF', fontSize: 24 }]}>{fmtCost(Math.round(metrics.averages.cost))}</Text>
                <View style={[styles.miniLine, { backgroundColor: '#FBBF24', width: 24, height: 3 }]} />
              </View>
              <View>
                <Text style={[styles.averageValueSecondary, { color: '#E2E8F0', fontSize: 20 }]}>{fmtUnits(Math.round(metrics.averages.units))}</Text>
                <View style={[styles.miniLine, { backgroundColor: '#FCD34D', width: 24, height: 3 }]} />
              </View>
            </View>
          </GlassCard>

          {/* Daily Stats */}
          <GlassCard style={styles.statsCard}>
            <Text style={[styles.chartTitle, { color: '#FFFFFF', marginBottom: 12 }]}>Daily Usage Summary</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statLabel, { color: '#94A3B8' }]}>Peak Day</Text>
                <Text style={[styles.statValue, { color: '#F87171' }]}>{dailyStats.peak.toFixed(1)}</Text>
                <Text style={[styles.statUnit, { color: '#64748B' }]}>kVAh</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statLabel, { color: '#94A3B8' }]}>Average</Text>
                <Text style={[styles.statValue, { color: '#38BDF8' }]}>{dailyStats.avg.toFixed(1)}</Text>
                <Text style={[styles.statUnit, { color: '#64748B' }]}>kVAh</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statLabel, { color: '#94A3B8' }]}>Lowest</Text>
                <Text style={[styles.statValue, { color: '#34D399' }]}>{dailyStats.low.toFixed(1)}</Text>
                <Text style={[styles.statUnit, { color: '#64748B' }]}>kVAh</Text>
              </View>
            </View>
          </GlassCard>

          {/* Trend Chart */}
          <GlassCard style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View>
                <Text style={[styles.chartTitle, { color: '#E6EBEE' }]}>Consumption Trends</Text>
                <Text style={[styles.chartSub, { color: '#64748B' }]}>
                  {isCustomRange ? `${dateFrom} to ${dateTo}` : 'Analyze usage patterns over time'}
                </Text>
              </View>
            </View>

            {/* Metric Toggle */}
            <View style={styles.chartToggles}>
              <View style={styles.metricToggleRow}>
                <TouchableOpacity
                  onPress={() => setTrendMetric('cost')}
                  style={[styles.chartToggleBtn, trendMetric === 'cost' && { backgroundColor: 'rgba(45,212,191,0.2)' }]}
                >
                  <IndianRupee size={12} color={trendMetric === 'cost' ? '#2DD4BF' : '#64748B'} />
                  <Text style={[styles.chartToggleText, { color: trendMetric === 'cost' ? '#2DD4BF' : '#64748B' }]}>Cost</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setTrendMetric('units')}
                  style={[styles.chartToggleBtn, trendMetric === 'units' && { backgroundColor: 'rgba(96,165,250,0.2)' }]}
                >
                  <Zap size={12} color={trendMetric === 'units' ? '#60A5FA' : '#64748B'} />
                  <Text style={[styles.chartToggleText, { color: trendMetric === 'units' ? '#60A5FA' : '#64748B' }]}>Units</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.periodToggleRow}>
                <TouchableOpacity
                  onPress={() => setTrendPeriod('7D')}
                  style={[styles.periodToggleBtn, trendPeriod === '7D' && styles.periodToggleBtnActive]}
                >
                  <Text style={[styles.periodToggleText, trendPeriod === '7D' && styles.periodToggleTextActive]}>7 Days</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setTrendPeriod('30D')}
                  style={[styles.periodToggleBtn, trendPeriod === '30D' && styles.periodToggleBtnActive]}
                >
                  <Text style={[styles.periodToggleText, trendPeriod === '30D' && styles.periodToggleTextActive]}>30 Days</Text>
                </TouchableOpacity>
              </View>
            </View>

            {trendChartData.every((d) => d.value === 0) ? (
              <View style={styles.chartEmpty}>
                <TrendingUp size={32} color="#334155" />
                <Text style={[styles.chartEmptyText, { color: '#64748B' }]}>No data logged for selected period</Text>
              </View>
            ) : (
              <TrendChart
                data={trendChartData}
                height={200}
                color={trendMetric === 'cost' ? '#2DD4BF' : '#60A5FA'}
                labelColor="#94A3B8"
                formatValue={(v) => (trendMetric === 'cost' ? `₹${v}` : `${v}`)}
                fillGradient={trendMetric === 'cost' ? ['#2DD4BF', '#0F766E'] : ['#60A5FA', '#1D4ED8']}
              />
            )}
          </GlassCard>

          {/* Cost Breakdown */}
          {activeTariff > 0 && (
            <GlassCard style={styles.chartCard}>
              <Text style={[styles.chartTitle, { color: '#E6EBEE' }]}>Cost Breakdown</Text>
              <Text style={[styles.chartSub, { color: '#64748B', marginBottom: 12 }]}>By meter</Text>
              {meters.map((m) => {
                const units = perMeterTotals[m.id] ?? 0;
                const cost = units * activeTariff;
                const pct = displayUnits > 0 ? (units / displayUnits) * 100 : 0;
                return (
                  <View key={m.id} style={styles.costRow}>
                    <View style={styles.costLeft}>
                      <Text style={[styles.costName, { color: '#E6EBEE' }]}>{m.name}</Text>
                      <View style={[styles.costBarTrack, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                        <View style={[styles.costBarFill, { width: `${pct}%`, backgroundColor: '#708F96' }]} />
                      </View>
                    </View>
                    <View style={styles.costRight}>
                      <Text style={[styles.costAmount, { color: '#10B981' }]}>{cost > 0 ? `₹${cost.toFixed(0)}` : '-'}</Text>
                      <Text style={[styles.costPct, { color: '#64748B' }]}>{pct.toFixed(0)}%</Text>
                    </View>
                  </View>
                );
              })}
              <View style={[styles.costTotalRow, { borderColor: 'rgba(255,255,255,0.08)' }]}>
                <Text style={[styles.costTotalLabel, { color: '#E6EBEE' }]}>Total Estimated Cost</Text>
                <Text style={[styles.costTotalAmount, { color: '#708F96' }]}>
                  ₹{((isCustomRange ? metrics.custom.cost : metrics.month.cost) || 0).toFixed(0)}
                </Text>
              </View>
            </GlassCard>
          )}

          {/* Meter Comparison */}
          <GlassCard style={styles.chartCard}>
            <Text style={[styles.chartTitle, { color: '#E6EBEE' }]}>Meter Comparison</Text>
            <Text style={[styles.chartSub, { color: '#64748B', marginBottom: 12 }]}>Total kVAh consumed</Text>
            {meters.map((m) => {
              const total = perMeterTotals[m.id] ?? 0;
              const maxTotal = Math.max(...Object.values(perMeterTotals), 1);
              const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
              return (
                <View key={m.id} style={styles.meterCompareRow}>
                  <View style={styles.meterCompareLeft}>
                    <Text style={[styles.meterCompareName, { color: '#E6EBEE' }]}>{m.name}</Text>
                    <Text style={[styles.meterCompareMeta, { color: '#64748B' }]}>{m.meter_type || 'Meter'}</Text>
                  </View>
                  <View style={styles.meterCompareBarWrap}>
                    <View style={[styles.meterCompareTrack, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                      <View style={[styles.meterCompareFill, { width: `${pct}%`, backgroundColor: '#3B82F6' }]} />
                    </View>
                  </View>
                  <Text style={[styles.meterCompareValue, { color: '#E6EBEE' }]}>{total.toFixed(0)}</Text>
                </View>
              );
            })}
          </GlassCard>

          {/* Meter Summary Table */}
          <GlassCard style={styles.chartCard}>
            <Text style={[styles.chartTitle, { color: '#E6EBEE', marginBottom: 10 }]}>Meter Summary</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableH, { color: '#64748B', flex: 2 }]}>Meter</Text>
              <Text style={[styles.tableH, { color: '#64748B', textAlign: 'right' }]}>Total kVAh</Text>
              <Text style={[styles.tableH, { color: '#64748B', textAlign: 'right' }]}>Avg/Day</Text>
            </View>
            {meters.map((m) => {
              const total = perMeterTotals[m.id] ?? 0;
              const days = isCustomRange && dateFrom && dateTo
                ? Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (24 * 60 * 60 * 1000)) + 1)
                : 30;
              return (
                <View key={m.id} style={[styles.tableRow, { borderColor: 'rgba(255,255,255,0.06)' }]}>
                  <View style={{ flex: 2 }}>
                    <Text style={[styles.tableName, { color: '#E6EBEE' }]}>{m.name}</Text>
                    <Text style={[styles.tableMeta, { color: '#64748B' }]}>
                      {m.meter_type || 'Meter'} · {m.meter_number || 'No #'}
                    </Text>
                  </View>
                  <Text style={[styles.tableVal, { color: '#E6EBEE', textAlign: 'right' }]}>{total.toFixed(0)}</Text>
                  <Text style={[styles.tableVal, { color: '#94A3B8', textAlign: 'right' }]}>{(total / days).toFixed(1)}</Text>
                </View>
              );
            })}
          </GlassCard>

          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* Date Range Modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <SafeBlurView intensity={60} tint="dark" style={styles.modalOverlay}>
          <GlassCard style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: '#E6EBEE' }]}>Select Date Range</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <View style={styles.dateInputs}>
              <View style={[styles.dateInputWrap, { borderColor: 'rgba(255,255,255,0.12)' }]}>
                <Text style={[styles.dateInputLabel, { color: '#64748B' }]}>From</Text>
                <Text style={[styles.dateInputValue, { color: '#E6EBEE' }]}>{dateFrom || 'YYYY-MM-DD'}</Text>
              </View>
              <View style={[styles.dateInputWrap, { borderColor: 'rgba(255,255,255,0.12)' }]}>
                <Text style={[styles.dateInputLabel, { color: '#64748B' }]}>To</Text>
                <Text style={[styles.dateInputValue, { color: '#E6EBEE' }]}>{dateTo || 'YYYY-MM-DD'}</Text>
              </View>
            </View>
            <View style={styles.presetRow}>
              {[
                { label: 'Last 7 Days', from: getPeriodDates(7).start, to: todayStr },
                { label: 'Last 30 Days', from: getPeriodDates(30).start, to: todayStr },
                { label: 'This Month', from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], to: todayStr },
              ].map((preset) => (
                <TouchableOpacity
                  key={preset.label}
                  style={[styles.presetBtn, { borderColor: 'rgba(255,255,255,0.12)' }]}
                  onPress={() => { setDateFrom(preset.from); setDateTo(preset.to); }}
                >
                  <Text style={[styles.presetText, { color: '#94A3B8' }]}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: 'rgba(255,255,255,0.08)' }]}
                onPress={() => { setIsCustomRange(false); setDateFrom(''); setDateTo(''); setShowDatePicker(false); }}
              >
                <Text style={[styles.modalBtnText, { color: '#94A3B8' }]}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#708F96' }]}
                onPress={() => { if (dateFrom && dateTo) setIsCustomRange(true); setShowDatePicker(false); }}
              >
                <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Apply</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </SafeBlurView>
      </Modal>

      {/* Meter Picker Modal */}
      <Modal visible={showMeterPicker} transparent animationType="slide">
        <SafeBlurView intensity={60} tint="dark" style={styles.modalOverlay}>
          <GlassCard style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: '#E6EBEE' }]}>Select Meter</Text>
              <TouchableOpacity onPress={() => setShowMeterPicker(false)}>
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            {meters.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.meterOption, selectedMeterId === m.id && { backgroundColor: 'rgba(112,143,150,0.15)' }]}
                onPress={() => { setSelectedMeterId(m.id); setShowMeterPicker(false); }}
              >
                <Text style={[styles.meterOptionText, { color: '#E6EBEE' }]}>{m.name}</Text>
                {selectedMeterId === m.id && <View style={styles.meterOptionDot} />}
              </TouchableOpacity>
            ))}
          </GlassCard>
        </SafeBlurView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16, paddingTop: 8, paddingBottom: 100 },

  // Glass Card
  glassCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  glassCardInner: { padding: 16, position: 'relative', zIndex: 1 },

  // Header
  headerCard: { margin: 16, marginBottom: 8, marginTop: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },

  tariffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 10,
  },
  tariffText: { fontSize: 11, fontFamily: 'Urbanist-Bold' },

  headerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  scopeToggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 3 },
  scopeBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  scopeBtnActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  scopeText: { fontSize: 11, fontFamily: 'Urbanist-Bold', color: '#94A3B8' },
  scopeTextActive: { color: '#E6EBEE' },

  dateRangeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  dateRangeText: { fontSize: 11, fontFamily: 'Urbanist-Bold', color: '#94A3B8' },

  meterSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  meterSelectorText: { fontSize: 13, fontFamily: 'Poppins-Bold', color: '#E6EBEE' },

  // Tiles
  tilesRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  metricTile: { flex: 1, padding: 0, overflow: 'hidden' },
  metricHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  metricIconWrap: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  customBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  customBadgeText: { fontSize: 10, fontFamily: 'Urbanist-Bold' },
  metricToggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 2 },
  metricToggleBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  metricToggleText: { fontSize: 10, fontFamily: 'Urbanist-Bold' },
  metricValueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 4 },
  metricValue: { fontSize: 24, fontFamily: 'Poppins-Bold', letterSpacing: -0.5 },
  metricUnit: { fontSize: 12, fontFamily: 'Urbanist-Medium' },
  metricAccentLine: { height: 3, width: 24, borderRadius: 2, marginBottom: 6 },
  metricSub: { fontSize: 10, fontFamily: 'Urbanist-Medium', marginBottom: 2 },
  metricLabel: { fontSize: 10, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Average Card
  averageCard: { marginBottom: 10 },
  averageHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  averageValues: { flexDirection: 'row', gap: 24 },
  averageValueSecondary: { fontSize: 18, fontFamily: 'Poppins-Bold' },
  miniLine: { height: 2, width: 16, borderRadius: 1, marginTop: 4 },

  // Stats Card
  statsCard: { marginBottom: 10 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statItem: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 10, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase', letterSpacing: 0.3 },
  statValue: { fontSize: 22, fontFamily: 'Poppins-Bold', marginTop: 4 },
  statUnit: { fontSize: 10, fontFamily: 'Urbanist-Medium', marginTop: 2 },
  statDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.08)' },

  // Chart
  chartCard: { marginBottom: 10 },
  chartHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  chartTitle: { fontSize: 16, fontFamily: 'Poppins-Bold' },
  chartSub: { fontSize: 12, fontFamily: 'Urbanist-Medium', marginTop: 2 },
  chartToggles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  metricToggleRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 3, gap: 2 },
  chartToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  chartToggleText: { fontSize: 11, fontFamily: 'Urbanist-Bold' },
  periodToggleRow: { flexDirection: 'row', gap: 6 },
  periodToggleBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  periodToggleBtnActive: { backgroundColor: '#E6EBEE', borderColor: '#E6EBEE' },
  periodToggleText: { fontSize: 11, fontFamily: 'Urbanist-Bold', color: '#94A3B8' },
  periodToggleTextActive: { color: '#0F172A' },

  chartEmpty: { height: 160, justifyContent: 'center', alignItems: 'center', gap: 8 },
  chartEmptyText: { fontSize: 13, fontFamily: 'Urbanist-Medium' },

  // Bar Chart
  barChartInner: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 36 },
  barChartYAxis: { position: 'absolute', left: 0, top: 0, bottom: 20, justifyContent: 'space-between', paddingVertical: 4 },
  barChartYLabel: { fontSize: 9, fontFamily: 'Urbanist-Medium', textAlign: 'right', width: 30 },
  barChartBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingRight: 4 },
  barWrapper: { alignItems: 'center', justifyContent: 'flex-end' },
  barChartTrack: { width: '100%', borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end', height: '100%' },
  barChartBar: { width: '100%', borderRadius: 4 },
  barChartXLabel: { fontSize: 9, fontFamily: 'Urbanist-Medium', marginTop: 4, textAlign: 'center', width: '100%' },

  // Cost Breakdown
  costRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  costLeft: { flex: 1, paddingRight: 12 },
  costName: { fontSize: 13, fontFamily: 'Poppins-Bold', marginBottom: 4 },
  costBarTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  costBarFill: { height: '100%', borderRadius: 2 },
  costRight: { alignItems: 'flex-end', minWidth: 70 },
  costAmount: { fontSize: 13, fontFamily: 'Poppins-Bold' },
  costPct: { fontSize: 11, fontFamily: 'Urbanist-Medium', marginTop: 2 },
  costTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1 },
  costTotalLabel: { fontSize: 14, fontFamily: 'Poppins-Bold' },
  costTotalAmount: { fontSize: 18, fontFamily: 'Poppins-Bold' },

  // Meter Comparison
  meterCompareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  meterCompareLeft: { width: 100 },
  meterCompareName: { fontSize: 13, fontFamily: 'Poppins-Bold' },
  meterCompareMeta: { fontSize: 10, fontFamily: 'Urbanist-Medium', marginTop: 1 },
  meterCompareBarWrap: { flex: 1, paddingHorizontal: 8 },
  meterCompareTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  meterCompareFill: { height: '100%', borderRadius: 3 },
  meterCompareValue: { fontSize: 12, fontFamily: 'Poppins-Bold', width: 50, textAlign: 'right' },

  // Table
  tableHeader: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 4 },
  tableH: { fontSize: 10, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase', letterSpacing: 0.3 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  tableName: { fontSize: 13, fontFamily: 'Poppins-Bold' },
  tableMeta: { fontSize: 10, fontFamily: 'Urbanist-Medium', marginTop: 1 },
  tableVal: { fontSize: 13, fontFamily: 'Poppins-Bold', flex: 1 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { margin: 16, marginBottom: 40, borderRadius: 24, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontFamily: 'Poppins-Bold' },
  dateInputs: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  dateInputWrap: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1 },
  dateInputLabel: { fontSize: 11, fontFamily: 'Urbanist-Bold', marginBottom: 4, textTransform: 'uppercase' },
  dateInputValue: { fontSize: 14, fontFamily: 'Poppins-Bold' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  presetBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  presetText: { fontSize: 12, fontFamily: 'Urbanist-Bold' },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  modalBtnText: { fontSize: 14, fontFamily: 'Poppins-Bold' },

  meterOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4 },
  meterOptionText: { fontSize: 14, fontFamily: 'Poppins-Bold' },
  meterOptionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#708F96' },
});
