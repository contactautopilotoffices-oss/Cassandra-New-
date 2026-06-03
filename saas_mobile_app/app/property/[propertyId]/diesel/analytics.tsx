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
  Fuel,
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

interface Generator {
  id: string;
  name: string;
  capacity_kva?: number;
  tank_capacity_litres?: number;
  status: string;
}

interface DGTariff {
  id: string;
  generator_id: string;
  cost_per_litre: number;
  effective_from: string;
  effective_to: string | null;
  created_by?: string;
  created_at: string;
}

interface DieselReading {
  id: string;
  generator_id: string;
  opening_hours: number;
  closing_hours: number;
  opening_diesel_level: number;
  closing_diesel_level: number;
  diesel_added_litres: number;
  computed_consumed_litres?: number;
  computed_cost?: number;
  tariff_rate?: number;
  tariff_rate_used?: number;
  reading_date?: string;
  created_at: string;
}

interface TrendPoint {
  date: string;
  cost: number;
  litres: number;
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
const fmtLitres = (val: number) => val > 0 ? `${Math.round(val).toLocaleString()} L` : '—';

// ─── Glass Card ───────────────────────────────────────────────────────────────

function GlassCard({ children, style, intensity = 40 }: { children: React.ReactNode; style?: any; intensity?: number }) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  return (
    <SafeBlurView intensity={intensity} tint="dark" style={[styles.glassCard, { borderColor: colors.glassBorder }, style]}>
      <LinearGradient
        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.08)']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.glassCardInner}>{children}</View>
    </SafeBlurView>
  );
}

// ─── Segmented Control ────────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  activeColor = '#708F96',
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  activeColor?: string;
}) {
  return (
    <View style={styles.segmentedRow}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segmentBtn, active && { backgroundColor: activeColor }]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Bar Chart with Gradient ──────────────────────────────────────────────────

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
    <GlassCard style={[styles.metricTile, { borderTopWidth: 2, borderTopColor: accentColor + '60' }]}>
      <View style={styles.metricHeader}>
        <View style={[styles.metricIconWrap, { backgroundColor: accentColor + '20' }]}>
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
        <Text style={[styles.metricValue, { color: '#E6EBEE' }]}>{value}</Text>
        {unit && <Text style={[styles.metricUnit, { color: '#94A3B8' }]}>{unit}</Text>}
      </View>
      <View style={[styles.metricAccentLine, { backgroundColor: accentColor }]} />
      {subtitle && <Text style={[styles.metricSub, { color: '#64748B' }]}>{subtitle}</Text>}
      <Text style={[styles.metricLabel, { color: '#94A3B8' }]}>{label}</Text>
    </GlassCard>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DieselAnalyticsScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();

  // UI State
  const [viewMode, setViewMode] = useState<'combined' | 'generator'>('combined');
  const [selectedGenId, setSelectedGenId] = useState<string>('all');
  const [costTimeframe, setCostTimeframe] = useState<'today' | 'month'>('month');
  const [litresTimeframe, setLitresTimeframe] = useState<'today' | 'month'>('month');
  const [trendMetric, setTrendMetric] = useState<'cost' | 'litres'>('cost');
  const [trendPeriod, setTrendPeriod] = useState<'7D' | '30D'>('7D');
  const [isCustomRange, setIsCustomRange] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGenPicker, setShowGenPicker] = useState(false);

  // Data State
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [rawReadings, setRawReadings] = useState<{
    today: DieselReading[];
    month: DieselReading[];
    prevMonth: DieselReading[];
    trend: DieselReading[];
    custom: DieselReading[];
  }>({ today: [], month: [], prevMonth: [], trend: [], custom: [] });
  const [activeTariff, setActiveTariff] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    setIsLoading(true);
    try {
      const gensRes = await supabase
        .from('generators')
        .select('*')
        .eq('property_id', propertyId)
        .order('name');
      const gens = (gensRes.data as Generator[]) || [];
      setGenerators(gens);

      // Tariff
      if (gens.length > 0) {
        const { data: tariffData } = await supabase
          .from('dg_tariffs')
          .select('*')
          .in('generator_id', gens.map((g) => g.id))
          .is('effective_to', null)
          .limit(1);
        const tariffs = tariffData as DGTariff[] | null;
        if (tariffs && tariffs.length > 0) {
          setActiveTariff(tariffs[0].cost_per_litre || 0);
        }
      }

      const todayStart = todayStr;
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const prevMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0];
      const prevMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0];
      const trendStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const baseFilters = [{ op: 'eq' as const, column: 'property_id', value: propertyId }];

      const [todayR, monthR, prevMonthR, trendR] = await Promise.all([
        serverApi.query<DieselReading[]>({ table: 'diesel_readings', action: 'select', filters: [...baseFilters, { op: 'eq', column: 'reading_date', value: todayStart }] }),
        serverApi.query<DieselReading[]>({ table: 'diesel_readings', action: 'select', filters: [...baseFilters, { op: 'gte', column: 'reading_date', value: monthStart }] }),
        serverApi.query<DieselReading[]>({ table: 'diesel_readings', action: 'select', filters: [...baseFilters, { op: 'gte', column: 'reading_date', value: prevMonthStart }, { op: 'lte', column: 'reading_date', value: prevMonthEnd }] }),
        serverApi.query<DieselReading[]>({ table: 'diesel_readings', action: 'select', filters: [...baseFilters, { op: 'gte', column: 'reading_date', value: trendStart }] }),
      ]);

      let customR: any = { data: [] };
      if (isCustomRange && dateFrom && dateTo) {
        customR = await serverApi.query<DieselReading[]>({
          table: 'diesel_readings',
          action: 'select',
          filters: [...baseFilters, { op: 'gte', column: 'reading_date', value: dateFrom }, { op: 'lte', column: 'reading_date', value: dateTo }],
        });
      }

      setRawReadings({
        today: (todayR.data as DieselReading[]) || [],
        month: (monthR.data as DieselReading[]) || [],
        prevMonth: (prevMonthR.data as DieselReading[]) || [],
        trend: (trendR.data as DieselReading[]) || [],
        custom: (customR.data as DieselReading[]) || [],
      });
    } catch (e) {
      console.error('Diesel analytics fetch error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [propertyId, isCustomRange, dateFrom, dateTo]);

  const { refetch } = useDashboardFetch(queryKeys.property.dieselAnalytics(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5,
  });

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch().finally(() => setIsRefreshing(false));
  }, [refetch]);

  // Derived Metrics
  const metrics = useMemo(() => {
    const filterFn = (r: DieselReading) => {
      if (viewMode === 'combined') return true;
      return r.generator_id === selectedGenId;
    };

    const calc = (readings: DieselReading[]) => {
      return readings.filter(filterFn).reduce(
        (acc, r) => {
          let cost = r.computed_cost || 0;
          const rate = r.tariff_rate || r.tariff_rate_used || activeTariff || 0;
          if (cost === 0 && rate > 0) {
            cost = (r.computed_consumed_litres || 0) * rate;
          }
          return {
            cost: acc.cost + cost,
            litres: acc.litres + (r.computed_consumed_litres || 0),
          };
        },
        { cost: 0, litres: 0 }
      );
    };

    const today = calc(rawReadings.today);
    const month = calc(rawReadings.month);
    const prevMonth = calc(rawReadings.prevMonth);
    const custom = calc(rawReadings.custom);

    const avgCalc = (readings: DieselReading[]) => {
      const uniqueDays = new Set(readings.filter(filterFn).map((r) => r.reading_date)).size || 1;
      const totals = calc(readings);
      return { cost: totals.cost / uniqueDays, litres: totals.litres / uniqueDays };
    };

    const monthAvgs = avgCalc(rawReadings.month);
    const customAvgs = isCustomRange ? avgCalc(rawReadings.custom) : monthAvgs;

    return { today, month, prevMonth, custom, averages: isCustomRange ? customAvgs : monthAvgs };
  }, [rawReadings, viewMode, selectedGenId, isCustomRange, activeTariff]);

  // Chart Data
  const chartData = useMemo(() => {
    const filterFn = (r: DieselReading) => {
      if (viewMode === 'combined') return true;
      return r.generator_id === selectedGenId;
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
            const rate = r.tariff_rate || r.tariff_rate_used || activeTariff || 0;
            if (cost === 0 && rate > 0) cost = (r.computed_consumed_litres || 0) * rate;
            return { cost: acc.cost + cost, litres: acc.litres + (r.computed_consumed_litres || 0) };
          },
          { cost: 0, litres: 0 }
        );
        result.push({ date: label, cost: Math.round(dayTotals.cost), litres: Math.round(dayTotals.litres) });
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
          const rate = r.tariff_rate || r.tariff_rate_used || activeTariff || 0;
          if (cost === 0 && rate > 0) cost = (r.computed_consumed_litres || 0) * rate;
          return { cost: acc.cost + cost, litres: acc.litres + (r.computed_consumed_litres || 0) };
        },
        { cost: 0, litres: 0 }
      );
      result.push({ date: label, cost: Math.round(dayTotals.cost), litres: Math.round(dayTotals.litres) });
    }
    return result;
  }, [rawReadings.trend, rawReadings.custom, trendPeriod, viewMode, selectedGenId, isCustomRange, dateFrom, dateTo, activeTariff]);

  const trendChartData = useMemo(() => {
    return chartData.map((d) => ({ label: d.date, value: trendMetric === 'cost' ? d.cost : d.litres }));
  }, [chartData, trendMetric]);

  const displayCost = isCustomRange ? metrics.custom.cost : costTimeframe === 'today' ? metrics.today.cost : metrics.month.cost;
  const displayLitres = isCustomRange ? metrics.custom.litres : litresTimeframe === 'today' ? metrics.today.litres : metrics.month.litres;

  // Per-gen totals
  const perGenTotals = useMemo(() => {
    const m: Record<string, number> = {};
    generators.forEach((g) => { m[g.id] = 0; });
    rawReadings.month.forEach((r) => { m[r.generator_id] = (m[r.generator_id] ?? 0) + (r.computed_consumed_litres ?? 0); });
    return m;
  }, [rawReadings.month, generators]);

  // Low fuel alerts
  const latestPerGen: Record<string, DieselReading> = {};
  rawReadings.month.forEach((r) => { if (!latestPerGen[r.generator_id]) latestPerGen[r.generator_id] = r; });
  const lowFuelAlerts = generators.filter((g) => {
    const latest = latestPerGen[g.id];
    const level = latest?.closing_diesel_level ?? 0;
    const cap = g.tank_capacity_litres ?? 1000;
    return level < cap * 0.2;
  });

  const selectedGenName = generators.find((g) => g.id === selectedGenId)?.name || 'All Generators';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Gradient Background */}
      <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={StyleSheet.absoluteFillObject} />

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
          <Text style={styles.headerTitle}>DG Power Analytics</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Tariff Badge */}
        {activeTariff > 0 ? (
          <View style={[styles.tariffBadge, { backgroundColor: 'rgba(52,199,89,0.15)', borderColor: 'rgba(52,199,89,0.25)' }]}>
            <Text style={[styles.tariffText, { color: '#34C759' }]}>Active Tariff: ₹{activeTariff}/L</Text>
          </View>
        ) : (
          <View style={[styles.tariffBadge, { backgroundColor: 'rgba(255,159,10,0.15)', borderColor: 'rgba(255,159,10,0.25)' }]}>
            <AlertTriangle size={12} color="#FF9F0A" />
            <Text style={[styles.tariffText, { color: '#FF9F0A' }]}>No Tariff Configured</Text>
          </View>
        )}

        {/* View Mode + Date Range */}
        <View style={styles.headerControls}>
          <View style={styles.scopeToggle}>
            <TouchableOpacity
              onPress={() => { setViewMode('combined'); setSelectedGenId('all'); }}
              style={[styles.scopeBtn, viewMode === 'combined' && styles.scopeBtnActive]}
            >
              <Text style={[styles.scopeText, viewMode === 'combined' && styles.scopeTextActive]}>Combined</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setViewMode('generator'); if (generators.length) setSelectedGenId(generators[0].id); }}
              style={[styles.scopeBtn, viewMode === 'generator' && styles.scopeBtnActive]}
            >
              <Text style={[styles.scopeText, viewMode === 'generator' && styles.scopeTextActive]}>
                Generator
              </Text>
              {viewMode === 'generator' && <ChevronDown size={12} color="#E6EBEE" />}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.dateRangeBtn} onPress={() => setShowDatePicker(true)}>
            <Calendar size={14} color="#94A3B8" />
            <Text style={styles.dateRangeText}>
              {isCustomRange ? `${dateFrom} → ${dateTo}` : 'Date Range'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Generator Selector */}
        {viewMode === 'generator' && (
          <TouchableOpacity style={styles.genSelector} onPress={() => setShowGenPicker(true)}>
            <Text style={styles.genSelectorText}>{selectedGenName}</Text>
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
              label="DIESEL COST"
              value={fmtCost(displayCost)}
              accentColor="#10B981"
              icon={<IndianRupee size={18} color="#10B981" />}
              subtitle={isCustomRange ? `${dateFrom} to ${dateTo}` : costTimeframe === 'today' ? 'Total today' : 'Total this month'}
              timeframe={isCustomRange ? undefined : costTimeframe}
              onTimeframeChange={isCustomRange ? undefined : setCostTimeframe}
              isCustom={isCustomRange}
            />
            <MetricTile
              label="LITRES CONSUMED"
              value={fmtLitres(displayLitres)}
              accentColor="#F59E0B"
              icon={<Fuel size={18} color="#F59E0B" />}
              subtitle={isCustomRange ? `${dateFrom} to ${dateTo}` : litresTimeframe === 'today' ? 'Consumed today' : 'Consumed this month'}
              timeframe={isCustomRange ? undefined : litresTimeframe}
              onTimeframeChange={isCustomRange ? undefined : setLitresTimeframe}
              isCustom={isCustomRange}
            />
          </View>

          {/* Daily Average */}
          <GlassCard style={styles.averageCard}>
            <View style={styles.averageHeader}>
              <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(249,115,22,0.15)' }]}>
                <BarChart3 size={18} color="#F97316" />
              </View>
              <Text style={[styles.metricLabel, { color: '#94A3B8', marginTop: 0 }]}>DAILY AVERAGE</Text>
            </View>
            <View style={styles.averageValues}>
              <View>
                <Text style={[styles.metricValue, { color: '#E6EBEE' }]}>{fmtCost(Math.round(metrics.averages.cost))}</Text>
                <View style={[styles.miniLine, { backgroundColor: '#F97316' }]} />
              </View>
              <View>
                <Text style={[styles.averageValueSecondary, { color: '#94A3B8' }]}>{fmtLitres(Math.round(metrics.averages.litres))}</Text>
                <View style={[styles.miniLine, { backgroundColor: '#FDBA74' }]} />
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
                  style={[styles.chartToggleBtn, trendMetric === 'cost' && { backgroundColor: 'rgba(16,185,129,0.15)' }]}
                >
                  <IndianRupee size={12} color={trendMetric === 'cost' ? '#10B981' : '#64748B'} />
                  <Text style={[styles.chartToggleText, { color: trendMetric === 'cost' ? '#10B981' : '#64748B' }]}>Cost</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setTrendMetric('litres')}
                  style={[styles.chartToggleBtn, trendMetric === 'litres' && { backgroundColor: 'rgba(100,116,139,0.15)' }]}
                >
                  <Fuel size={12} color={trendMetric === 'litres' ? '#E6EBEE' : '#64748B'} />
                  <Text style={[styles.chartToggleText, { color: trendMetric === 'litres' ? '#E6EBEE' : '#64748B' }]}>Litres</Text>
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
                color={trendMetric === 'cost' ? '#10B981' : '#64748B'}
                labelColor="#64748B"
                formatValue={(v) => (trendMetric === 'cost' ? `₹${v}` : `${v}L`)}
                fillGradient={trendMetric === 'cost' ? ['#10B981', '#064E3B'] : ['#64748B', '#1E293B']}
              />
            )}
          </GlassCard>

          {/* Generator Comparison */}
          <GlassCard style={styles.chartCard}>
            <Text style={[styles.chartTitle, { color: '#E6EBEE' }]}>Generator Comparison</Text>
            <Text style={[styles.chartSub, { color: '#64748B', marginBottom: 12 }]}>Total litres consumed</Text>
            {generators.map((g) => {
              const total = perGenTotals[g.id] ?? 0;
              const maxTotal = Math.max(...Object.values(perGenTotals), 1);
              const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
              return (
                <View key={g.id} style={styles.genCompareRow}>
                  <View style={styles.genCompareLeft}>
                    <Text style={[styles.genCompareName, { color: '#E6EBEE' }]}>{g.name}</Text>
                    <Text style={[styles.genCompareMeta, { color: '#64748B' }]}>{g.capacity_kva ?? '?'} KVA</Text>
                  </View>
                  <View style={styles.genCompareBarWrap}>
                    <View style={[styles.genCompareTrack, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                      <View style={[styles.genCompareFill, { width: `${pct}%`, backgroundColor: '#708F96' }]} />
                    </View>
                  </View>
                  <Text style={[styles.genCompareValue, { color: '#E6EBEE' }]}>{total.toFixed(0)} L</Text>
                </View>
              );
            })}
          </GlassCard>

          {/* Low Fuel Alerts */}
          {lowFuelAlerts.length > 0 && (
            <GlassCard style={[styles.chartCard, { borderColor: 'rgba(255,159,10,0.20)' }]}>
              <Text style={[styles.chartTitle, { color: '#E6EBEE', marginBottom: 10 }]}>Low Fuel Alerts</Text>
              {lowFuelAlerts.map((g) => (
                <View key={g.id} style={[styles.alertRow, { backgroundColor: 'rgba(255,159,10,0.10)', borderColor: 'rgba(255,159,10,0.20)' }]}>
                  <AlertTriangle size={14} color="#FF9F0A" />
                  <Text style={[styles.alertText, { color: '#FF9F0A' }]}>
                    {g.name}: fuel level below 20%
                  </Text>
                </View>
              ))}
            </GlassCard>
          )}

          {/* Generator Summary Table */}
          <GlassCard style={styles.chartCard}>
            <Text style={[styles.chartTitle, { color: '#E6EBEE', marginBottom: 10 }]}>Generator Summary</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableH, { color: '#64748B', flex: 2 }]}>Generator</Text>
              <Text style={[styles.tableH, { color: '#64748B', textAlign: 'right' }]}>Total L</Text>
              <Text style={[styles.tableH, { color: '#64748B', textAlign: 'right' }]}>Avg/Day</Text>
            </View>
            {generators.map((g) => {
              const total = perGenTotals[g.id] ?? 0;
              const days = isCustomRange && dateFrom && dateTo
                ? Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (24 * 60 * 60 * 1000)) + 1)
                : 30;
              return (
                <View key={g.id} style={[styles.tableRow, { borderColor: 'rgba(255,255,255,0.06)' }]}>
                  <View style={{ flex: 2 }}>
                    <Text style={[styles.tableName, { color: '#E6EBEE' }]}>{g.name}</Text>
                    <Text style={[styles.tableMeta, { color: '#64748B' }]}>
                      {g.capacity_kva ?? '?'} KVA · {g.tank_capacity_litres ?? '?'} L tank
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
                {/* Using text representation for date — native date pickers can be added */}
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

      {/* Generator Picker Modal */}
      <Modal visible={showGenPicker} transparent animationType="slide">
        <SafeBlurView intensity={60} tint="dark" style={styles.modalOverlay}>
          <GlassCard style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: '#E6EBEE' }]}>Select Generator</Text>
              <TouchableOpacity onPress={() => setShowGenPicker(false)}>
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            {generators.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[styles.genOption, selectedGenId === g.id && { backgroundColor: 'rgba(112,143,150,0.15)' }]}
                onPress={() => { setSelectedGenId(g.id); setShowGenPicker(false); }}
              >
                <Text style={[styles.genOptionText, { color: '#E6EBEE' }]}>{g.name}</Text>
                {selectedGenId === g.id && <View style={styles.genOptionDot} />}
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
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  glassCardInner: { padding: 16, position: 'relative', zIndex: 1 },

  // Header
  headerCard: { margin: 16, marginBottom: 8, marginTop: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontFamily: 'Poppins-Bold', color: '#E6EBEE' },

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

  genSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  genSelectorText: { fontSize: 13, fontFamily: 'Poppins-Bold', color: '#E6EBEE' },

  // Tiles
  tilesRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  metricTile: { flex: 1, padding: 0, overflow: 'hidden' },
  metricHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  metricIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  customBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  customBadgeText: { fontSize: 10, fontFamily: 'Urbanist-Bold' },
  metricToggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 2 },
  metricToggleBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  metricToggleText: { fontSize: 10, fontFamily: 'Urbanist-Bold' },
  metricValueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 4 },
  metricValue: { fontSize: 22, fontFamily: 'Poppins-Bold', letterSpacing: -0.5 },
  metricUnit: { fontSize: 11, fontFamily: 'Urbanist-Medium' },
  metricAccentLine: { height: 3, width: 24, borderRadius: 2, marginBottom: 6 },
  metricSub: { fontSize: 10, fontFamily: 'Urbanist-Medium', marginBottom: 2 },
  metricLabel: { fontSize: 10, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Average Card
  averageCard: { marginBottom: 10 },
  averageHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  averageValues: { flexDirection: 'row', gap: 24 },
  averageValueSecondary: { fontSize: 18, fontFamily: 'Poppins-Bold' },
  miniLine: { height: 2, width: 16, borderRadius: 1, marginTop: 4 },

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

  // Generator Comparison
  genCompareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  genCompareLeft: { width: 100 },
  genCompareName: { fontSize: 13, fontFamily: 'Poppins-Bold' },
  genCompareMeta: { fontSize: 10, fontFamily: 'Urbanist-Medium', marginTop: 1 },
  genCompareBarWrap: { flex: 1, paddingHorizontal: 8 },
  genCompareTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  genCompareFill: { height: '100%', borderRadius: 3 },
  genCompareValue: { fontSize: 12, fontFamily: 'Poppins-Bold', width: 50, textAlign: 'right' },

  // Alerts
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  alertText: { fontSize: 12, fontFamily: 'Urbanist-Medium', flex: 1 },

  // Table
  tableHeader: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 4 },
  tableH: { fontSize: 10, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase', letterSpacing: 0.3 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  tableName: { fontSize: 13, fontFamily: 'Poppins-Bold' },
  tableMeta: { fontSize: 10, fontFamily: 'Urbanist-Medium', marginTop: 1 },
  tableVal: { fontSize: 13, fontFamily: 'Poppins-Bold', flex: 1 },

  // Segmented
  segmentedRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 3, gap: 2 },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8 },
  segmentText: { fontSize: 12, fontFamily: 'Urbanist-Bold', color: '#94A3B8' },
  segmentTextActive: { color: '#FFFFFF' },

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

  genOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4 },
  genOptionText: { fontSize: 14, fontFamily: 'Poppins-Bold' },
  genOptionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#708F96' },
});
