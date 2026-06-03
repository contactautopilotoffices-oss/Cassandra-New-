'use client';

/**
 * ApplePropertyDashboard — Per-property glass dashboard
 *
 * Design: Apple Weather aesthetic
 * - Clean sky gradient background (no clouds)
 * - Glass cards with generous transparency
 * - Full-width edge-to-edge cards with 22px radius
 * - Tappable ticket cards → detail view with history, analysis
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { createClient } from '@/utils/supabase/client';
import AppleWeatherBackground from '@/components/dashboard/AppleWeatherBackground';
import ParticleOrb from '@/components/dashboard/ParticleOrb';
import { useWeather } from '@/hooks/useWeather';
import { useTheme } from '@/context';
import { AuroraBackground } from '@/components/shared/AuroraBackground';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';

const { width: SCREEN_W } = Dimensions.get('window');
const fontSans = Platform.OS === 'ios' ? 'System' : 'sans-serif';

// ---- Icons ----
const Icons = {
  Back: ({ size = 20, color = '#fff' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  ),
  Bell: ({ size = 20, color = '#fff' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  ),
  Sun: ({ size = 22, color = '#FFD700' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <Circle cx="12" cy="12" r="5" fill={color} fillOpacity="0.3" />
      <Circle cx="12" cy="12" r="5" />
      <Path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </Svg>
  ),
  Moon: ({ size = 22, color = 'rgba(255,255,255,0.8)' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Svg>
  ),
  Home: ({ size = 24, color = '#fff' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Path d="M9 22V12h6v10" />
    </Svg>
  ),
  Building: ({ size = 24, color = 'rgba(255,255,255,0.5)' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <Path d="M3 21h18" />
      <Path d="M5 21V7l8-4 8 4v14" />
      <Path d="M9 21v-6h6v6" />
    </Svg>
  ),
  Chart: ({ size = 24, color = 'rgba(255,255,255,0.5)' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <Path d="M18 20V10M12 20V4M6 20v-6" />
    </Svg>
  ),
  User: ({ size = 24, color = 'rgba(255,255,255,0.5)' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </Svg>
  ),
  ArrowRight: ({ size = 16, color = 'rgba(255,255,255,0.5)' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <Path d="M5 12h14M12 5l7 7-7 7" />
    </Svg>
  ),
  Check: ({ size = 16, color = '#34C759' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 6L9 17l-5-5" />
    </Svg>
  ),
  Wrench: ({ size = 18, color = '#fff' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <Path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Svg>
  ),
  Package: ({ size = 18, color = '#fff' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <Path d="M16.5 9.4 7.5 4.21" />
      <Path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <Path d="M3.27 6.96 12 12.01l8.73-5.05" />
      <Path d="M12 22.08V12" />
    </Svg>
  ),
  Sparkles: ({ size = 18, color = '#fff' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <Path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364-1.414-1.414M6.05 6.05 4.636 4.636m12.728 0-1.414 1.414M6.05 17.95l-1.414 1.414" />
      <Circle cx="12" cy="12" r="4" />
    </Svg>
  ),
  Close: ({ size = 20, color = '#fff' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <Path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  ),
  Search: ({ size = 18, color = 'rgba(255,255,255,0.5)' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <Circle cx="11" cy="11" r="8" />
      <Path d="m21 21-4.3-4.3" />
    </Svg>
  ),
};

// ---- Status Dot ----
const StatusDot = ({ status }: { status: 'good' | 'warning' | 'critical' }) => {
  const colors = { good: '#34C759', warning: '#FF9F0A', critical: '#FF3B30' };
  return <View style={[styles.statusDot, { backgroundColor: colors[status] || colors.good }]} />;
};

// ---- Glass Card ----
const GlassCard = ({ children, style, onPress }: { children: React.ReactNode; style?: object; onPress?: () => void }) => {
  const card = <View style={[styles.glassCard, style]}>{children}</View>;
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {card}
      </TouchableOpacity>
    );
  }
  return card;
};

// ---- Mini Bar Chart ----
function MiniBarChart({ data, highlightIndex = -1 }: { data: number[]; highlightIndex?: number }) {
  const max = Math.max(...data, 1);
  return (
    <View style={styles.miniChart}>
      {data.map((val, i) => (
        <View
          key={i}
          style={[
            styles.miniBar,
            {
              height: `${(val / max) * 100}%`,
              backgroundColor: i === highlightIndex ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.18)',
            },
          ]}
        />
      ))}
    </View>
  );
}

// ---- Ticket Detail Modal ----
function TicketDetailModal({
  visible,
  onClose,
  propertyName,
  openTickets,
  resolvedTickets,
  inProgressTickets,
}: {
  visible: boolean;
  onClose: () => void;
  propertyName: string;
  openTickets: number;
  resolvedTickets: number;
  inProgressTickets: number;
}) {
  const insets = useSafeAreaInsets();

  // Mock 7-day history data
  const historyData = useMemo(() => {
    const base = Math.max(1, Math.round((openTickets + resolvedTickets) / 7));
    return Array.from({ length: 7 }, () => Math.max(0, base + Math.floor(Math.random() * 6) - 3));
  }, [openTickets, resolvedTickets]);

  const total = openTickets + inProgressTickets + resolvedTickets;
  const avgDaily = total > 0 ? (total / 30).toFixed(1) : '0.0';
  const todayRaised = Math.max(0, Math.round(Number(avgDaily) + Math.random() * 3 - 1));

  // AI analysis
  const analysis = useMemo(() => {
    if (openTickets > 20) return 'Ticket volume is critically high. Recommend immediate staff reallocation and priority triage. Resolution rate is below optimal threshold.';
    if (openTickets > 10) return 'Elevated ticket volume detected. Consider reviewing recurring issue patterns and preventive maintenance schedules.';
    if (resolvedTickets > openTickets * 3) return 'Excellent operational health. Resolution velocity is strong. Continue current maintenance practices.';
    return 'Steady operations. Ticket flow is balanced. Monitor for any seasonal spikes in the coming weeks.';
  }, [openTickets, resolvedTickets]);

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={[styles.modalOverlay, { paddingTop: insets.top + 12 }]}>
        <View style={styles.modalContent}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{propertyName}</Text>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} activeOpacity={0.8}>
              <Icons.Close size={20} color="#1D1D1F" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
            {/* Summary Numbers */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{todayRaised}</Text>
                <Text style={styles.summaryLabel}>Raised today</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{avgDaily}</Text>
                <Text style={styles.summaryLabel}>Daily avg</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{total}</Text>
                <Text style={styles.summaryLabel}>Total</Text>
              </View>
            </View>

            {/* History Graph */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>7-Day History</Text>
              <View style={styles.historyChart}>
                {historyData.map((val, i) => {
                  const max = Math.max(...historyData, 1);
                  const height = (val / max) * 100;
                  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                  return (
                    <View key={i} style={styles.historyBarCol}>
                      <View style={styles.historyBarWrap}>
                        <View style={[styles.historyBar, { height: `${height}%` }]} />
                      </View>
                      <Text style={styles.historyBarLabel}>{dayLabels[i]}</Text>
                      <Text style={styles.historyBarValue}>{val}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Breakdown */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Status Breakdown</Text>
              <View style={styles.breakdownList}>
                <BreakdownRow label="Open" value={openTickets} color="#FF9F0A" />
                <BreakdownRow label="In Progress" value={inProgressTickets} color="#2997FF" />
                <BreakdownRow label="Resolved" value={resolvedTickets} color="#34C759" />
              </View>
            </View>

            {/* AI Analysis */}
            <View style={[styles.sectionCard, { backgroundColor: '#F5F7FA' }]}>
              <View style={styles.aiHeader}>
                <Icons.Sparkles size={16} color="#708F96" />
                <Text style={styles.aiTitle}>AI Analysis</Text>
              </View>
              <Text style={styles.aiText}>{analysis}</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function BreakdownRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.breakdownLeft}>
        <View style={[styles.breakdownDot, { backgroundColor: color }]} />
        <Text style={styles.breakdownLabel}>{label}</Text>
      </View>
      <Text style={[styles.breakdownValue, { color }]}>{value}</Text>
    </View>
  );
}

// ---- Bottom Nav ----
const BottomNav = () => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <TouchableOpacity style={styles.navItem} activeOpacity={0.7}>
        <Icons.Home size={24} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} activeOpacity={0.7}>
        <Icons.Building size={24} />
      </TouchableOpacity>
      <View style={styles.orbNavItem}>
        <ParticleOrb size={72} />
      </View>
      <TouchableOpacity style={styles.navItem} activeOpacity={0.7}>
        <Icons.Chart size={24} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} activeOpacity={0.7}>
        <Icons.User size={24} />
      </TouchableOpacity>
    </View>
  );
};

// ---- Main Dashboard ----
export default function ApplePropertyDashboard() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { weather } = useWeather();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [propertyName, setPropertyName] = useState('Property');
  const [propertyCode, setPropertyCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [openTickets, setOpenTickets] = useState(0);
  const [inProgressTickets, setInProgressTickets] = useState(0);
  const [resolvedTickets, setResolvedTickets] = useState(0);
  const [checklistDone, setChecklistDone] = useState(7);
  const [checklistTotal] = useState(100);
  const [energyKwh, setEnergyKwh] = useState(1240);

  const [ticketDetailOpen, setTicketDetailOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    const supabase = createClient();

    const { data: propertyData } = await supabase
      .from('properties')
      .select('id, name, code')
      .eq('id', propertyId)
      .single();

    const property = propertyData as { name: string; code: string } | null;
    if (property) {
      setPropertyName(property.name);
      setPropertyCode(property.code);
    }

    const { count: openCount } = await supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .neq('status', 'resolved');

    const { count: totalCount } = await supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('property_id', propertyId);

    const total = totalCount ?? 0;
    const open = openCount ?? 0;
    const resolved = Math.max(0, Math.floor(total * 0.82));
    const inProgress = Math.max(0, total - open - resolved);

    setOpenTickets(open);
    setInProgressTickets(inProgress);
    setResolvedTickets(resolved);
    setChecklistDone(Math.floor(50 + Math.random() * 40));
    setEnergyKwh(Math.floor(800 + Math.random() * 800));

    setIsLoading(false);
    setIsRefreshing(false);
  }, [propertyId]);

  const { refetch } = useDashboardFetch(queryKeys.property.appleDashboard(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5,
  });

  const onRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const isNight = weather?.period === 'night';

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? '#0f1628' : '#F8FAFC' }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ActivityIndicator size="large" color="#708F96" />
      </View>
    );
  }

  const totalTickets = openTickets + inProgressTickets + resolvedTickets;
  const checklistPct = Math.round((checklistDone / checklistTotal) * 100);
  const healthStatus: 'good' | 'warning' | 'critical' = openTickets > 20 ? 'critical' : openTickets > 10 ? 'warning' : 'good';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0f1628' : '#F8FAFC' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Background */}
      {isDark ? <AppleWeatherBackground /> : (weather && <AuroraBackground colors={weather.auroraColors} />)}

      {/* Ticket Detail Modal */}
      <TicketDetailModal
        visible={ticketDetailOpen}
        onClose={() => setTicketDetailOpen(false)}
        propertyName={propertyName}
        openTickets={openTickets}
        resolvedTickets={resolvedTickets}
        inProgressTickets={inProgressTickets}
      />

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="rgba(255,255,255,0.6)"
            progressBackgroundColor="rgba(255,255,255,0.08)"
          />
        }
      >
        {/* Header — compact, layout already handles safe area */}
        <View style={[styles.header, { paddingTop: 12 }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} activeOpacity={0.8}>
              <Icons.Back size={18} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {propertyName}
              </Text>
              <Text style={styles.headerSubtitle}>{propertyCode ? `${propertyCode} · ` : ''}{dateStr}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.weatherBadge}>
              {isNight ? <Icons.Moon size={20} /> : <Icons.Sun size={20} />}
              <Text style={styles.weatherTemp}>{weather?.temperature ?? '--'}°</Text>
            </View>
            <TouchableOpacity style={styles.headerButton} activeOpacity={0.8}>
              <Icons.Bell size={18} />
              <View style={styles.notificationDot} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Icons.Search size={16} />
          <Text style={styles.searchPlaceholder}>Search tickets, staff...</Text>
        </View>

        {/* Large Ticket Summary Card — full width, tappable */}
        <Animated.View entering={FadeInUp.delay(100).duration(500)}>
          <GlassCard style={styles.heroCard} onPress={() => setTicketDetailOpen(true)}>
            <View style={styles.heroCardTop}>
              <View>
                <Text style={styles.heroCardLabel}>Tickets</Text>
                <Text style={styles.heroCardValue}>{totalTickets}</Text>
                <Text style={styles.heroCardSub}>
                  {openTickets} open · {inProgressTickets} in progress
                </Text>
              </View>
              <MiniBarChart data={[35, 55, 25, 70, 45, 60, 40]} highlightIndex={3} />
            </View>
            <View style={styles.heroCardBottom}>
              <View style={styles.heroStat}>
                <StatusDot status={healthStatus} />
                <Text style={styles.heroStatText}>
                  {healthStatus === 'good' ? 'Healthy' : healthStatus === 'warning' ? 'Attention needed' : 'Critical'}
                </Text>
              </View>
              <View style={styles.heroArrow}>
                <Icons.ArrowRight size={14} color="rgba(255,255,255,0.5)" />
              </View>
            </View>
          </GlassCard>
        </Animated.View>

        {/* Checklist & Health Row */}
        <View style={styles.rowContainer}>
          <Animated.View entering={FadeInUp.delay(200).duration(500)} style={{ flex: 1 }}>
            <GlassCard style={styles.checklistCard}>
              <View style={styles.cardHeader}>
                <Icons.Check size={16} />
                <Text style={styles.cardTitle}>Checklist</Text>
              </View>
              <View style={styles.checklistValue}>
                <Text style={styles.checklistNumber}>{checklistDone}</Text>
                <Text style={styles.checklistTotal}>/ {checklistTotal}</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${checklistPct}%`, backgroundColor: '#34C759' }]} />
              </View>
              <Text style={styles.checklistPct}>{checklistPct}% completed</Text>
            </GlassCard>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(250).duration(500)} style={{ flex: 1.5 }}>
            <GlassCard style={styles.ppmCard}>
              <View style={styles.cardHeader}>
                <Icons.Wrench size={16} />
                <Text style={styles.cardTitle}>Health</Text>
              </View>
              <Text style={[styles.ppmDate, { color: healthStatus === 'critical' ? '#FF3B30' : healthStatus === 'warning' ? '#FF9F0A' : '#34C759' }]}>
                {openTickets > 20 ? 'Critical' : openTickets > 10 ? 'Warning' : 'Optimal'}
              </Text>
              <Text style={styles.ppmTask}>{openTickets} open tickets</Text>
              <View style={styles.ppmStatus}>
                <StatusDot status={healthStatus} />
                <Text style={styles.ppmStatusText}>Live</Text>
              </View>
            </GlassCard>
          </Animated.View>
        </View>

        {/* Energy Card — full width */}
        <Animated.View entering={FadeInUp.delay(300).duration(500)}>
          <GlassCard style={styles.dsrCard}>
            <View style={styles.dsrHeader}>
              <Icons.Package size={18} />
              <Text style={styles.dsrTitle}>Energy Usage</Text>
            </View>
            <View style={styles.dsrContent}>
              <View>
                <Text style={styles.dsrNumber}>{Math.floor(energyKwh / 1000)}</Text>
                <Text style={styles.dsrUnit}>kWh</Text>
              </View>
              <View style={styles.barChart}>
                {[35, 55, 25, 70, 45].map((h, i) => (
                  <View
                    key={i}
                    style={[styles.bar, { height: `${h}%`, backgroundColor: i === 3 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.2)' }]}
                  />
                ))}
              </View>
            </View>
            <View style={styles.dsrFooter}>
              <Text style={styles.dsrFooterText}>Grid + DG consumption</Text>
              <View style={styles.dsrTrend}>
                <StatusDot status="good" />
                <Text style={styles.dsrTrendText}>+12%</Text>
              </View>
            </View>
          </GlassCard>
        </Animated.View>
      </ScrollView>

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1628',
  },
  scrollView: {
    flex: 1,
    zIndex: 10,
  },
  scrollContent: {
    paddingTop: 0,
    paddingHorizontal: 16,
  },

  // Glass Card — updated to 12% bg / 12% border, 22px radius
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  searchPlaceholder: {
        fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
        fontSize: 24,
    fontWeight: '300',
    color: '#fff',
    letterSpacing: -0.5,
    maxWidth: 180,
  },
  headerSubtitle: {
        fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  weatherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  weatherTemp: {
        fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    backgroundColor: '#FF3B30',
    borderRadius: 4,
  },

  // Status Dot
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Hero Card — full width ticket summary
  heroCard: {
    padding: 20,
    marginBottom: 20,
  },
  heroCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroCardLabel: {
        fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroCardValue: {
        fontSize: 48,
    fontWeight: '200',
    color: '#fff',
    letterSpacing: -1.5,
    lineHeight: 52,
  },
  heroCardSub: {
        fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  heroCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  heroStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroStatText: {
        fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  heroArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Mini Chart
  miniChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    height: 50,
    width: 80,
    paddingBottom: 4,
  },
  miniBar: {
    flex: 1,
    borderRadius: 2,
  },

  // Row Container
  rowContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },

  // Checklist
  checklistCard: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
        fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  checklistValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  checklistNumber: {
        fontSize: 32,
    fontWeight: '300',
    color: '#fff',
  },
  checklistTotal: {
        fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
  },
  checklistPct: {
        fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
  },
  progressBarBg: {
    marginTop: 10,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Health / PPM
  ppmCard: {
    padding: 16,
  },
  ppmDate: {
        fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  ppmTask: {
        fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  ppmStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ppmStatusText: {
        fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },

  // Energy / DSR
  dsrCard: {
    padding: 20,
    marginBottom: 20,
  },
  dsrHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  dsrTitle: {
        fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dsrContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  dsrNumber: {
        fontSize: 36,
    fontWeight: '300',
    color: '#fff',
  },
  dsrUnit: {
        fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginLeft: 4,
  },
  barChart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 50,
    paddingBottom: 8,
  },
  bar: {
    flex: 1,
    borderRadius: 3,
  },
  dsrFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dsrFooterText: {
        fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  dsrTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dsrTrendText: {
        fontSize: 12,
    color: '#34C759',
  },

  // Bottom Navigation
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingTop: 10,
    backgroundColor: 'rgba(15, 22, 40, 0.25)',
    zIndex: 50,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  navItem: {
    alignItems: 'center',
    paddingTop: 6,
    flex: 1,
  },
  orbNavItem: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -15,
    width: 70,
    flex: 1,
  },

  // ---- Ticket Detail Modal ----
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    minHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  modalTitle: {
        fontSize: 22,
    color: '#1D1D1F',
    letterSpacing: -0.3,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScroll: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E8E8ED',
  },
  summaryValue: {
        fontSize: 28,
    color: '#1D1D1F',
    letterSpacing: -0.5,
  },
  summaryLabel: {
        fontSize: 12,
    color: '#86868B',
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E8E8ED',
    padding: 20,
  },
  sectionTitle: {
        fontSize: 16,
    color: '#1D1D1F',
    marginBottom: 16,
    letterSpacing: -0.2,
  },
  historyChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    gap: 8,
  },
  historyBarCol: {
    flex: 1,
    alignItems: 'center',
  },
  historyBarWrap: {
    width: '100%',
    height: 90,
    justifyContent: 'flex-end',
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    overflow: 'hidden',
  },
  historyBar: {
    width: '100%',
    backgroundColor: '#708F96',
    borderRadius: 8,
    minHeight: 4,
  },
  historyBarLabel: {
        fontSize: 10,
    color: '#86868B',
    marginTop: 6,
  },
  historyBarValue: {
        fontSize: 11,
    color: '#1D1D1F',
    marginTop: 2,
  },
  breakdownList: {
    gap: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  breakdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  breakdownLabel: {
        fontSize: 14,
    color: '#1D1D1F',
  },
  breakdownValue: {
        fontSize: 16,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  aiTitle: {
        fontSize: 14,
    color: '#708F96',
  },
  aiText: {
        fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
});
