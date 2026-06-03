'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  withDelay,
  interpolate,
  Extrapolate,
  FadeInDown,
  FadeInUp,
  FadeIn,
  ZoomIn,
  runOnJS,
} from 'react-native-reanimated';
import Svg, {
  Circle as SvgCircle,
  Path as SvgPath,
  G,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Rect as SvgRect,
} from 'react-native-svg';
import { useAuth } from '@/hooks/useAuth';
import { useWeather, type WeatherCondition } from '@/hooks/useWeather';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import WeatherBadge from '@/components/dashboard/WeatherBadge';
import { createClient } from '@/utils/supabase/client';
import { TenantGlassHeader } from '@/components/tenant/TenantGlassHeader';
import { TenantStatsCard } from '@/components/tenant/TenantStatsCard';
import { TenantTicketCard } from '@/components/tenant/TenantTicketCard';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/context';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import FloatingMenu from '@/components/ui/FloatingMenu';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Types
export type TabKey = 'dashboard' | 'requests' | 'daily-board' | 'flow-map' | 'visitors' | 'diesel' | 'electricity' | 'checklist' | 'settings' | 'profile';

interface Ticket {
  id: string;
  ticket_number?: string;
  title?: string;
  description?: string;
  status: string;
  priority: string;
  created_at: string;
  assigned_to?: string | null;
  assignee?: {
    full_name?: string;
    email?: string;
    user_photo_url?: string | null;
  } | null;
  sla_due_at?: string;
  department?: string;
}

interface MSTStats {
  total: number;
  active: number;
  completed: number;
  myActive: number;
  myCompleted: number;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  property: string;
  score: number;
  avatar?: string;
  user_id: string;
}

interface MstDashboardProps {
  propertyId: string;
}

// ============ SVG GRAPHICS COMPONENTS ============

// Animated Circular Progress with SVG + Reanimated
function SkiaCircularProgress({
  progress,
  size = 50,
  strokeWidth = 4,
  color = '#708F96',
  bgColor = '#E2E8F0'
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * Math.min(progress, 1);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <SvgCircle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={0}
          strokeLinecap="round"
          rotation={-90}
          origin={`${center}, ${center}`}
        />
        {/* Progress circle */}
        <SvgCircle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={[dash, circumference]}
          strokeDashoffset={0}
          strokeLinecap="round"
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
    </View>
  );
}

// Donut Chart for Stats
function DonutChart({
  data,
  size = 100,
  strokeWidth = 14
}: {
  data: { value: number; color: string; label: string }[];
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, item) => sum + item.value, 0);

  let currentOffset = 0;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        {data.map((item, index) => (
          <SvgGradient key={index} id={`grad${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={item.color} />
            <Stop offset="100%" stopColor={item.color} stopOpacity={0.7} />
          </SvgGradient>
        ))}
      </Defs>
      {data.map((item, index) => {
        const percentage = item.value / total;
        const strokeDasharray = [circumference * percentage, circumference];
        const strokeDashoffset = -currentOffset * circumference;
        currentOffset += percentage;

        return (
          <SvgCircle
            key={index}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#grad${index})`}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${center}, ${center}`}
          />
        );
      })}
    </Svg>
  );
}

// Sparkline Chart
function Sparkline({ 
  data, 
  width = 200, 
  height = 60, 
  color = '#708F96',
  fillColor = 'rgba(112, 143, 150, 0.1)'
}: { 
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((value, index) => ({
    x: (index / (data.length - 1)) * width,
    y: height - ((value - min) / range) * height,
  }));

  const pathD = points.reduce((acc, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const prev = points[index - 1];
    const cp1x = prev.x + (point.x - prev.x) / 3;
    const cp2x = prev.x + (2 * (point.x - prev.x)) / 3;
    return `${acc} C ${cp1x} ${prev.y}, ${cp2x} ${point.y}, ${point.x} ${point.y}`;
  }, '');

  const fillPathD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGradient id="sparklineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <SvgPath d={fillPathD} fill="url(#sparklineGrad)" />
      <SvgPath d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// ============ REANIMATED PREMIUM COMPONENTS ============

// Premium KPI Card with Gradient + Blur
function PremiumKPICard({ 
  value, 
  label, 
  color, 
  delay = 0,
  icon,
  trend,
  chartData
}: { 
  value: number; 
  label: string; 
  color: string; 
  delay?: number;
  icon: string;
  trend?: number;
  chartData?: number[];
}) {
  const scale = useSharedValue(0.9);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(delay, withSpring(1, { damping: 15 }));
    glowOpacity.value = withDelay(delay + 200, withTiming(1, { duration: 500 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()} style={[styles.kpiCardContainer, animatedStyle]}>
      {/* Glow Effect */}
      <Animated.View style={[styles.kpiGlow, { backgroundColor: color }, glowStyle]} />
      
      {/* Card */}
      <SafeBlurView intensity={20} tint="dark" style={styles.kpiBlurCard}>
        <LinearGradient
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.05)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.kpiGradient}
        >
          <View style={styles.kpiContent}>
            <View style={styles.kpiHeader}>
              <View style={[styles.kpiIconContainer, { backgroundColor: `${color}15` }]}>
                <Ionicons name={icon as any} size={20} color={color} />
              </View>
              {trend !== undefined && (
                <View style={[styles.trendBadge, trend >= 0 ? styles.trendUp : styles.trendDown]}>
                  <Ionicons name={trend >= 0 ? 'trending-up' : 'trending-down'} size={12} color={trend >= 0 ? '#10B981' : '#EF4444'} />
                  <Text style={[styles.trendText, { color: trend >= 0 ? '#10B981' : '#EF4444' }]}>
                    {Math.abs(trend)}%
                  </Text>
                </View>
              )}
            </View>
            
            <Text style={[styles.kpiValue, { color }]}>{value.toLocaleString()}</Text>
            <Text style={styles.kpiLabel}>{label}</Text>
            
            {chartData && (
              <View style={styles.sparklineContainer}>
                <Sparkline data={chartData} width={120} height={40} color={color} />
              </View>
            )}
          </View>
        </LinearGradient>
      </SafeBlurView>
    </Animated.View>
  );
}

// Animated Ticket Card with Skia effects
function PremiumTicketCard({ ticket, onPress, index }: { ticket: Ticket; onPress: () => void; index: number }) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const translateY = useSharedValue(50);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.95);
  const elevation = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(index * 80, withSpring(0, { damping: 20 }));
    opacity.value = withDelay(index * 80, withTiming(1, { duration: 400 }));
    scale.value = withDelay(index * 80, withSpring(1, { damping: 15 }));
    elevation.value = withDelay(index * 80 + 200, withTiming(1, { duration: 300 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  const getPriorityColor = () => {
    switch (ticket.priority?.toLowerCase()) {
      case 'urgent':
      case 'critical':
        return { bg: 'rgba(239,68,68,0.15)', text: '#EF4444', gradient: ['#EF4444', '#F87171'] };
      case 'high':
        return { bg: 'rgba(249,115,22,0.15)', text: '#F97316', gradient: ['#F97316', '#FB923C'] };
      case 'medium':
        return { bg: 'rgba(71,85,105,0.10)', text: '#475569', gradient: ['#475569', '#64748B'] };
      default:
        return { bg: 'rgba(100,116,139,0.15)', text: '#94A3B8', gradient: ['#94A3B8', '#CBD5E1'] };
    }
  };

  const priorityColors = getPriorityColor();
  
  const slaTime = ticket.sla_due_at 
    ? new Date(ticket.sla_due_at).getTime() - Date.now()
    : null;
  const slaHours = slaTime ? Math.floor(slaTime / (1000 * 60 * 60)) : 0;
  const slaMinutes = slaTime ? Math.floor((slaTime % (1000 * 60 * 60)) / (1000 * 60)) : 0;
  const isSlaWarning = slaTime && slaTime < 1000 * 60 * 60 * 2;

  return (
    <AnimatedTouchable 
      style={[styles.ticketCardContainer, animatedStyle]} 
      onPress={onPress}
      activeOpacity={0.95}
    >
      {/* Shadow/Glow Layer */}
      <View style={styles.ticketCardShadow} />
      
      {/* Card Content */}
      <SafeBlurView intensity={40} tint="dark" style={styles.ticketBlurCard}>
        <LinearGradient
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.05)']}
          locations={[0, 1]}
          style={styles.ticketGradient}
        >
          {/* Priority Indicator Strip */}
          <LinearGradient
            colors={priorityColors.gradient as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.priorityStrip}
          />
          
          {/* Header */}
          <View style={styles.ticketHeader}>
            <View style={styles.ticketTitleRow}>
              <Text style={styles.ticketTitle} numberOfLines={2}>{ticket.title}</Text>
              <View style={styles.ticketActions}>
                <TouchableOpacity style={styles.iconButton}>
                  <Ionicons name="create-outline" size={16} color="rgba(255,255,255,0.45)" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Badges */}
          <View style={styles.ticketBadges}>
            <View style={[styles.priorityBadge, { backgroundColor: priorityColors.bg }]}>
              <LinearGradient
                colors={[(priorityColors.gradient as [string, string])[0] + '20', (priorityColors.gradient as [string, string])[0] + '20']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
              />
              <Text style={[styles.priorityBadgeText, { color: priorityColors.text }]}>
                {ticket.priority?.toUpperCase()}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.25)' }]}>
              <View style={[styles.statusDot, { backgroundColor: '#8B5CF6' }]} />
              <Text style={[styles.statusBadgeText, { color: '#8B5CF6' }]}>ASSIGNED</Text>
            </View>
          </View>

          {/* Assignee with Avatar */}
          <View style={styles.assigneeRow}>
            <View style={styles.assigneeAvatar}>
              <LinearGradient
                colors={[colors.primary, colors.primaryLight]}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <Text style={styles.assigneeInitials}>
                {ticket.assignee?.full_name?.[0] || 'M'}
              </Text>
            </View>
            <View style={styles.assigneeInfo}>
              <Text style={[styles.assigneeName, { color: '#FFFFFF' }]}>{ticket.assignee?.full_name || 'Unassigned'}</Text>
              <Text style={styles.assigneeEmail}>{ticket.assignee?.email || 'mst@ssplaza.com'}</Text>
            </View>
          </View>

          {/* SLA with animated warning */}
          {slaTime && (
            <View style={[styles.slaRow, isSlaWarning ? styles.slaWarning : undefined]}>
              <Ionicons name="time-outline" size={14} color={isSlaWarning ? '#EF4444' : '#64748B'} />
              <Text style={[styles.slaText, isSlaWarning ? styles.slaWarningText : undefined, { color: isSlaWarning ? '#EF4444' : 'rgba(255,255,255,0.55)' }]}>
                {slaHours}h {slaMinutes}m remaining
              </Text>
            </View>
          )}

          {/* Footer */}
          <View style={styles.ticketFooter}>
            <Text style={[styles.ticketNumber, { color: 'rgba(255,255,255,0.40)' }]}>{ticket.ticket_number}</Text>
            <TouchableOpacity style={styles.viewButton} onPress={onPress}>
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.viewButtonGradient}
              >
                <Text style={styles.viewButtonText}>View</Text>
                <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </SafeBlurView>
    </AnimatedTouchable>
  );
}

// Premium Leaderboard Entry
function PremiumLeaderboardEntry({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const translateX = useSharedValue(-30);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  useEffect(() => {
    translateX.value = withDelay(index * 100, withSpring(0, { damping: 18 }));
    opacity.value = withDelay(index * 100, withTiming(1, { duration: 400 }));
    scale.value = withDelay(index * 100, withSpring(1, { damping: 15 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  const getRankStyle = () => {
    switch (entry.rank) {
      case 1: return { 
        bg: ['#708F96', '#475569'] as [string, string], 
        shadow: '#708F9640',
        text: '#1A2332',
        icon: 'trophy'
      };
      case 2: return { 
        bg: ['#E8E8E8', '#C0C0C0'] as [string, string], 
        shadow: '#C0C0C040',
        text: '#1A2332',
        icon: 'medal'
      };
      case 3: return { 
        bg: ['#CD7F32', '#A0522D'] as [string, string], 
        shadow: '#CD7F3240',
        text: '#FFFFFF',
        icon: 'medal'
      };
      default: return { 
        bg: ['#F1F5F9', '#E2E8F0'] as [string, string], 
        shadow: '#94A3B820',
        text: '#64748B',
        icon: null
      };
    }
  };

  const rankStyle = getRankStyle();
  const isTop3 = entry.rank <= 3;

  return (
    <Animated.View style={[styles.leaderboardEntryContainer, animatedStyle]}>
      <SafeBlurView intensity={30} tint="dark" style={styles.leaderboardBlur}>
        <LinearGradient
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.05)']}
          style={styles.leaderboardGradient}
        >
          {/* Rank Badge */}
          <View style={[styles.rankBadgeContainer, { shadowColor: rankStyle.shadow }]}>
            <LinearGradient
              colors={rankStyle.bg}
              style={styles.rankBadgeGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {rankStyle.icon && (
                <Ionicons name={rankStyle.icon as any} size={14} color={rankStyle.text} />
              )}
              <Text style={[styles.rankText, { color: rankStyle.text }]}>{entry.rank}</Text>
            </LinearGradient>
          </View>

          {/* Avatar */}
          <View style={styles.leaderboardAvatarContainer}>
            <LinearGradient
              colors={['#708F96', '#8AA5AC']}
              style={styles.leaderboardAvatarGradient}
            >
              <Text style={styles.leaderboardAvatarText}>{entry.name[0]}</Text>
            </LinearGradient>
          </View>

          {/* Info */}
          <View style={styles.leaderboardInfo}>
            <Text style={styles.leaderboardName}>{entry.name}</Text>
            <Text style={styles.leaderboardProperty}>{entry.property}</Text>
          </View>

          {/* Score with Animation */}
          <View style={styles.scoreContainer}>
            <SkiaCircularProgress 
              progress={Math.min(entry.score / 1000, 1)} 
              size={50} 
              strokeWidth={4}
              color={entry.rank === 1 ? '#708F96' : entry.rank === 2 ? '#86868B' : entry.rank === 3 ? '#475569' : '#A1A1AA'}
            />
            <Text style={styles.leaderboardScore}>{entry.score.toLocaleString()}</Text>
          </View>
        </LinearGradient>
      </SafeBlurView>
    </Animated.View>
  );
}

// Premium Countdown Timer
function PremiumCountdown({ countdown }: { countdown: string }) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 500 }),
        withTiming(1, { duration: 500 })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <Animated.View entering={FadeInUp.springify()} style={styles.countdownContainer}>
      <SafeBlurView intensity={60} tint="dark" style={styles.countdownBlur}>
        <LinearGradient
          colors={['rgba(112, 143, 150, 0.15)', 'rgba(112, 143, 150, 0.05)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.countdownGradient}
        >
          <Text style={styles.countdownLabel}>RESET IN</Text>
          <Animated.Text style={[styles.countdownValue, pulseStyle]}>
            {countdown}
          </Animated.Text>
          <View style={styles.countdownBar}>
            <Animated.View style={styles.countdownProgress}>
              <LinearGradient
                colors={[colors.primary, colors.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
              />
            </Animated.View>
          </View>
        </LinearGradient>
      </SafeBlurView>
    </Animated.View>
  );
}

// ============ MAIN DASHBOARD ============

// ─── Fuzzy Search Helper ──────────────────────────────────────────────────────
function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (lower.includes(q)) return true;
  const textWords = lower.split(/\s+/);
  const queryWords = q.split(/\s+/);
  for (const qw of queryWords) {
    if (qw.length < 2) continue;
    if (textWords.some(word => word.startsWith(qw))) return true;
  }
  let ti = 0;
  for (const ch of q) {
    const idx = lower.indexOf(ch, ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}

export default function PremiumMstDashboard({ propertyId }: MstDashboardProps) {
  const { user } = useAuth();
  const { weather } = useWeather();
  const [manualCondition, setManualCondition] = useState<WeatherCondition | null>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const isMobile = width < 768;
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<MSTStats>({
    total: 0,
    active: 0,
    completed: 0,
    myActive: 0,
    myCompleted: 0,
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [property, setProperty] = useState<{ name: string } | null>(null);
  const [countdown, setCountdown] = useState('12:45:01');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    await Promise.all([
      fetchProperty(),
      fetchTickets(),
      fetchStats(),
      fetchLeaderboard(),
    ]);
  }, [propertyId, user?.id]);

  const { refetch } = useDashboardFetch(queryKeys.property.mstDashboardPremium(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5,
  });

  const fetchProperty = async () => {
    const { data } = await supabase
      .from('properties')
      .select('name')
      .eq('id', propertyId)
      .maybeSingle();
    if (data) setProperty(data);
  };

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchTickets = async () => {
    const { data, error } = await (supabase
      .from('tickets')
      .select(`
        *,
        assignee:users!assigned_to(id, full_name, email, user_photo_url)
      `)
      .eq('property_id', propertyId)

      .order('created_at', { ascending: false })
      .limit(20) as any);

    if (!error && data) {
      setTickets(data);
    }
    setIsLoading(false);
  };

  const fetchStats = async () => {
    // Fetch all tickets for the property once, then compute counts client-side
    // Supabase count() returns { count: number } in the response
    const [{ data: allData }, { data: activeData }, { data: completedData }] = await Promise.all([
      supabase
        .from('tickets')
        .select('id, status, assigned_to')
        .eq('property_id', propertyId),
      supabase
        .from('tickets')
        .select('id, assigned_to')
        .eq('property_id', propertyId)
        .not('status', 'in', '(resolved,closed)'),
      supabase
        .from('tickets')
        .select('id, assigned_to')
        .eq('property_id', propertyId)
        .in('status', ['resolved', 'closed']),
    ]);

    const all = allData || [];
    const active = activeData || [];
    const completed = completedData || [];
    const uid = user?.id;

    setStats({
      total: all.length,
      active: active.length,
      completed: completed.length,
      myActive: uid ? active.filter((t: any) => t.assigned_to === uid).length : 0,
      myCompleted: uid ? completed.filter((t: any) => t.assigned_to === uid).length : 0,
    });
  };

  const fetchLeaderboard = async () => {
    // Get staff members for this property
    const { data: staffData, error } = await supabase
      .from('property_memberships')
      .select(`
        user_id,
        users:user_id(full_name, user_photo_url)
      `)
      .eq('property_id', propertyId)
      .in('role', ['mst', 'staff']);

    if (error || !staffData || staffData.length === 0) {
      setLeaderboard([]);
      return;
    }

    // Compute score = count of resolved+closed tickets per staff member
    const userIds = staffData.map((s: any) => s.user_id);
    const { data: resolvedTickets } = await supabase
      .from('tickets')
      .select('assigned_to')
      .eq('property_id', propertyId)
      .in('status', ['resolved', 'closed'])
      .in('assigned_to', userIds);

    const scoreMap: Record<string, number> = {};
    if (resolvedTickets) {
      resolvedTickets.forEach((t: any) => {
        if (t.assigned_to) {
          scoreMap[t.assigned_to] = (scoreMap[t.assigned_to] || 0) + 1;
        }
      });
    }

    const ranked = staffData
      .map((staff: any) => ({
        rank: 0,
        name: staff.users?.full_name || 'Staff Member',
        property: property?.name || 'Property',
        score: scoreMap[staff.user_id] || 0,
        user_id: staff.user_id,
      }))
      .sort((a: LeaderboardEntry, b: LeaderboardEntry) => b.score - a.score)
      .map((entry: LeaderboardEntry, index: number) => ({ ...entry, rank: index + 1 }));

    setLeaderboard(ranked);
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const filteredTickets = useMemo(() => {
    if (!searchQuery) return tickets;
    return tickets.filter(t =>
      fuzzyMatch(t.title ?? '', searchQuery) ||
      fuzzyMatch(t.ticket_number ?? '', searchQuery)
    );
  }, [tickets, searchQuery]);

  const getGridColumns = () => {
    if (width < 640) return 1;
    if (width < 1024) return 2;
    return 3;
  };

  // Chart data computed from real stats

  const renderDashboardContent = () => (
    <ScrollView
      style={styles.contentScroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* Glassmorphism Header */}
      <TenantGlassHeader
        propertyName={property?.name || 'Property'}
        userName={user?.user_metadata?.full_name || 'MST Staff'}
      />

      {/* Stats Row */}
      <View style={styles.mstStatsRow}>
        <View style={styles.mstStatItem}>
          <TenantStatsCard
            value={stats.total}
            label="Total Tickets"
            color="#708F96"
            icon="ticket"
            trend="neutral"
          />
        </View>
        <View style={styles.mstStatItem}>
          <TenantStatsCard
            value={stats.active}
            label="Active"
            color="#475569"
            icon="alert"
            trend="up"
          />
        </View>
        <View style={styles.mstStatItem}>
          <TenantStatsCard
            value={stats.completed}
            label="Completed"
            color="#10B981"
            icon="check"
            trend="up"
          />
        </View>
      </View>

      {/* My Performance */}
      <View style={styles.mstSectionHeader}>
        <Text style={styles.mstSectionTitle}>MY PERFORMANCE</Text>
      </View>
      <View style={styles.mstStatsRow}>
        <View style={styles.mstStatItem}>
          <TenantStatsCard
            value={stats.myActive}
            label="My Active"
            color="#F97316"
            icon="clock"
            trend="neutral"
          />
        </View>
        <View style={styles.mstStatItem}>
          <TenantStatsCard
            value={stats.myCompleted}
            label="My Completed"
            color="#4CAF50"
            icon="trending"
            trend="up"
          />
        </View>
      </View>

      {/* Tickets Section */}
      <View style={styles.mstSectionHeader}>
        <Text style={styles.mstSectionTitle}>RECENT TICKETS</Text>
        {tickets.length > 0 && (
          <Text style={styles.mstSectionCount}>{tickets.length} total</Text>
        )}
      </View>

      {filteredTickets.length === 0 ? (
        <View style={styles.mstEmptyState}>
          <Ionicons name="checkmark-done-circle-outline" size={40} color="rgba(255,255,255,0.25)" />
          <Text style={styles.mstEmptyText}>No tickets found</Text>
        </View>
      ) : (
        <View style={styles.mstTicketsList}>
          {filteredTickets.slice(0, 10).map((ticket, index) => (
            <View key={ticket.id} style={styles.mstTicketItem}>
              <TenantTicketCard
                ticket={ticket as any}
                onPress={() => router.push(`/property/${propertyId}/tickets/${ticket.id}` as any)}
              />
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderRequestsContent = () => (
    <ScrollView
      style={styles.contentScroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      <Animated.View entering={FadeInDown} style={styles.pageHeader}>
        <View>
          <Text style={[styles.pageTitle, { color: '#FFFFFF' }]}>Property Requests</Text>
          <Text style={styles.pageSubtitle}>
            {filteredTickets.length} request{filteredTickets.length !== 1 ? 's' : ''} for {property?.name || 'Property'}
          </Text>
        </View>
      </Animated.View>

      {/* Search */}
      <Animated.View entering={FadeInDown.delay(100)} style={styles.searchContainer}>
        <SafeBlurView intensity={30} tint="dark" style={styles.searchBlur}>
          <Ionicons name="search" size={20} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search requests..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </SafeBlurView>
      </Animated.View>

      {/* Filter Chips */}
      <Animated.View entering={FadeInDown.delay(150)} style={styles.filterChips}>
        {(['all', 'open', 'in_progress'] as const).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
            onPress={() => {}}
          >
            <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>
              {filter === 'all' ? 'All' : filter === 'in_progress' ? 'In Progress' : 'Open'}
            </Text>
          </TouchableOpacity>
        ))}
      </Animated.View>

      {/* Tickets */}
      {filteredTickets.length === 0 ? (
        <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#CBD5E1" />
          <Text style={styles.emptyStateText}>No requests found</Text>
        </Animated.View>
      ) : (
        filteredTickets.map((ticket, index) => (
          <View key={ticket.id} style={{ paddingHorizontal: 0, paddingVertical: 8 }}>
            <PremiumTicketCard
              ticket={ticket}
              index={index}
              onPress={() => router.push(`/property/${propertyId}/tickets/${ticket.id}` as any)}
            />
          </View>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderDailyBoardContent = () => (
    <ScrollView
      style={styles.contentScroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      <Animated.View entering={FadeInDown} style={styles.pageHeader}>
        <View>
          <Text style={[styles.pageTitle, { color: '#FFFFFF' }]}>Daily Top MSTs</Text>
          <Text style={styles.pageSubtitle}>Resets at Midnight: 12:00 AM local time</Text>
        </View>
      </Animated.View>

      <PremiumCountdown countdown={countdown} />

      <View style={styles.leaderboardContainer}>
        {leaderboard.map((entry, index) => (
          <PremiumLeaderboardEntry key={entry.user_id} entry={entry} index={index} />
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderFlowMapContent = () => (
    <ScrollView
      style={styles.contentScroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      <Animated.View entering={FadeInDown} style={styles.pageHeader}>
        <View>
          <Text style={[styles.pageTitle, { color: '#FFFFFF' }]}>Live Flow Map</Text>
          <Text style={styles.pageSubtitle}>Weekly Champion & Property Flow</Text>
        </View>
      </Animated.View>

      <Animated.View entering={ZoomIn.delay(200)} style={styles.championCard}>
        <SafeBlurView intensity={40} tint="dark" style={styles.championBlur}>
          <LinearGradient
            colors={['rgba(255, 215, 0, 0.1)', 'rgba(255, 215, 0, 0.02)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.championGradient}
          >
            <View style={styles.championHeader}>
              <Text style={styles.championLabel}>WEEKLY CHAMPION</Text>
              <Ionicons name="star" size={20} color="#708F96" />
            </View>
            <View style={styles.championContent}>
              <View style={styles.championAvatar}>
                <LinearGradient
                  colors={['#708F96', '#475569']}
                  style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <Text style={styles.championAvatarText}>
                  {leaderboard[0]?.name?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
              <View>
                <Text style={[styles.championName, { color: '#FFFFFF' }]}>{leaderboard[0]?.name || 'No champion yet'}</Text>
                <Text style={[styles.championScore, { color: '#708F96' }]}>
                  {leaderboard[0]?.score > 0 ? `${leaderboard[0].score.toLocaleString()} pts` : '—'}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </SafeBlurView>
      </Animated.View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDark ? '#0F172a' : '#F8FAFC' }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#708F96" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </View>
    );
  }

  const renderProfileContent = () => (
    <ScrollView
      style={styles.contentScroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      <Animated.View entering={FadeInDown} style={styles.pageHeader}>
        <Text style={[styles.pageTitle, { color: '#FFFFFF' }]}>My Profile</Text>
        <Text style={styles.pageSubtitle}>{property?.name || 'Property'}</Text>
      </Animated.View>

      {/* Profile Card */}
      <Animated.View entering={FadeInDown.delay(100)}>
        <SafeBlurView intensity={30} tint="dark" style={styles.profileCardBlur}>
          <LinearGradient
            colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.05)']}
            style={styles.profileCardGradient}
          >
            <View style={styles.profileHeader}>
              <View style={styles.profileAvatar}>
                <LinearGradient
                  colors={[colors.primary, colors.primaryLight]}
                  style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <Text style={styles.profileAvatarText}>
                  {user?.user_metadata?.full_name?.[0]?.toUpperCase() || 'U'}
                </Text>
              </View>
              <View style={[styles.profileBadge, { backgroundColor: 'rgba(112,143,150,0.20)', borderColor: 'rgba(112,143,150,0.30)' }]}>
                <Text style={[styles.profileBadgeText, { color: colors.primary }]}>MST Staff</Text>
              </View>
            </View>

            <View style={styles.profileInfo}>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>FULL NAME</Text>
                <Text style={styles.profileValue}>{user?.user_metadata?.full_name || 'Not Set'}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>EMAIL</Text>
                <Text style={styles.profileValue}>{user?.email || 'Not Set'}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>PHONE</Text>
                <Text style={styles.profileValue}>{user?.user_metadata?.phone || 'Not Set'}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>PROPERTY</Text>
                <Text style={styles.profileValue}>{property?.name || 'Not Assigned'}</Text>
              </View>
            </View>
          </LinearGradient>
        </SafeBlurView>
      </Animated.View>

      {/* Personal Stats */}
      <Animated.View entering={FadeInDown.delay(200)}>
        <Text style={[styles.sectionTitle, { marginTop: 8, marginBottom: 12, color: '#FFFFFF' }]}>My Performance</Text>
        <View style={styles.kpiContainer}>
          <PremiumKPICard
            value={stats.myActive}
            label="MY ACTIVE"
            color={colors.primary}
            delay={0}
            icon="construct-outline"
          />
          <PremiumKPICard
            value={stats.myCompleted}
            label="MY COMPLETED"
            color="#10B981"
            delay={100}
            icon="checkmark-done-outline"
          />
        </View>
      </Animated.View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {weather && <WeatherBackground condition={manualCondition || weather.condition} />}
      <View style={styles.mainContainer}>
        <View style={styles.contentArea}>
          {/* Top Bar */}
          <SafeBlurView intensity={60} tint="dark" style={styles.topBar}>
            <LinearGradient
              colors={['rgba(10,15,25,0.80)', 'rgba(10,15,25,0.70)']}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            />
            <View style={styles.topBarLeft}>
              <FloatingMenu
                title="Maintenance Portal"
                items={[
                  { label: 'Overview', icon: 'grid', onPress: () => setActiveTab('dashboard') },
                  { label: 'Requests', icon: 'ticket', onPress: () => setActiveTab('requests') },
                  { label: 'Leaderboard', icon: 'trophy', onPress: () => setActiveTab('daily-board') },
                  { label: 'Flow Map', icon: 'pulse', onPress: () => setActiveTab('flow-map') },
                  { label: 'Visitors', icon: 'people', onPress: () => router.push(`/property/${propertyId}/visitors` as any) },
                  { label: 'Diesel', icon: 'flame', onPress: () => router.push(`/property/${propertyId}/diesel` as any) },
                  { label: 'Electricity', icon: 'flash', onPress: () => router.push(`/property/${propertyId}/electricity` as any) },
                  { label: 'Checklists', icon: 'checkbox', onPress: () => router.push(`/property/${propertyId}/checklist` as any) },
                  { label: 'Settings', icon: 'settings', onPress: () => router.push(`/property/${propertyId}/settings` as any) },
                  { label: 'Profile', icon: 'person', onPress: () => setActiveTab('profile') },
                ]}
                footer={{ label: 'Sign Out', icon: 'log-out-outline', danger: true, onPress: () => router.push('/(auth)/login' as any) }}
              />
            </View>
            <View style={styles.topBarRight}>
              {weather && (
                <WeatherBadge
                  condition={manualCondition || weather.condition}
                  temperature={weather.temperature}
                  locationName={weather.locationName}
                  onChange={setManualCondition}
                />
              )}
              <TouchableOpacity style={styles.topBarButton}>
                <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.60)" />
                <View style={styles.notificationDot} />
              </TouchableOpacity>
              <View style={[styles.onDutyBadge, { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.25)' }]}>
                <View style={styles.onDutyDot} />
                <Text style={styles.onDutyText}>ON DUTY</Text>
              </View>
              <Text style={[styles.userName, { color: 'rgba(255,255,255,0.85)' }]}>{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'MST Staff'}</Text>
            </View>
          </SafeBlurView>

          {activeTab === 'dashboard' && renderDashboardContent()}
          {activeTab === 'requests' && renderRequestsContent()}
          {activeTab === 'daily-board' && renderDailyBoardContent()}
          {activeTab === 'flow-map' && renderFlowMapContent()}
          {activeTab === 'profile' && renderProfileContent()}
        </View>
      </View>
    </View>
  );
}

// ============ STYLES ============

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060912',
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#060912',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
  },

  // Sidebar
  sidebarContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarHeader: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  logoIconText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  logoText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  logoSubtext: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1,
    marginTop: 2,
  },
  collapseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sidebarNav: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  navSection: {
    marginBottom: 24,
  },
  navSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.30)',
    letterSpacing: 1,
    marginBottom: 8,
    paddingLeft: 12,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 2,
    overflow: 'hidden',
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: 'rgba(112, 143, 150, 0.08)',
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
  },
  navLabelActive: {
    color: '#708F96',
    fontWeight: '600',
  },
  sidebarFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  userAvatarCollapsed: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  userRole: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.40)',
  },

  // Content Area
  contentArea: {
    flex: 1,
    flexDirection: 'column',
  },

  // Mobile Sidebar Overlay
  mobileSidebarOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 280,
    zIndex: 10,
  },
  sidebarBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 5,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  topBarButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: 'rgba(10,15,25,0.80)',
  },
  onDutyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  onDutyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  onDutyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22C55E',
  },
  contentScroll: {
    flex: 1,
    padding: 24,
  },

  // Page Header
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
      },
  pageSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },
  customizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  customizeText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.70)',
  },

  // KPI Cards
  kpiContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
    flexWrap: 'wrap',
  },
  kpiCardContainer: {
    flex: 1,
    minWidth: 220,
    position: 'relative',
  },
  kpiGlow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    bottom: 0,
    borderRadius: 20,
    opacity: 0.15,
  },
  kpiBlurCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  kpiGradient: {
    padding: 24,
  },
  kpiContent: {
    gap: 12,
  },
  kpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  trendUp: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  trendDown: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  trendText: {
    fontSize: 12,
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 36,
    fontWeight: '800',
      },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1,
      },
  sparklineContainer: {
    marginTop: 8,
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
      },
  sectionSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },

  // Search
  searchContainer: {
    marginBottom: 16,
  },
  searchBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    color: '#FFFFFF',
  },

  // Filter Chips
  filterChips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  filterChipActive: {
    backgroundColor: '#708F96',
    borderColor: '#708F96',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '500',
  },

  // Tickets Grid
  ticketsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  ticketCardContainer: {
    position: 'relative',
  },
  ticketCardShadow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 0,
    backgroundColor: 'rgba(112, 143, 150, 0.15)',
    borderRadius: 20,
    shadowColor: '#708F96',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  ticketBlurCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  ticketGradient: {
    padding: 20,
    gap: 12,
  },
  priorityStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  ticketHeader: {
    marginTop: 8,
  },
  ticketTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  ticketTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 24,
    marginRight: 8,
      },
  ticketActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ticketBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: 'hidden',
  },
  priorityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  assigneeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  assigneeInitials: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  assigneeInfo: {
    flex: 1,
  },
  assigneeName: {
    fontSize: 14,
    fontWeight: '600',
      },
  assigneeEmail: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.40)',
  },
  slaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  slaWarning: {
    backgroundColor: '#FEF2F2',
  },
  slaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  slaWarningText: {
    color: '#EF4444',
  },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  ticketNumber: {
    fontSize: 12,
    fontWeight: '600',
  },
  viewButton: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  viewButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Countdown
  countdownContainer: {
    marginBottom: 24,
  },
  countdownBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  countdownGradient: {
    padding: 28,
    alignItems: 'center',
  },
  countdownLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 2,
    marginBottom: 12,
      },
  countdownValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
    marginBottom: 16,
      },
  countdownBar: {
    width: '80%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  countdownProgress: {
    width: '65%',
    height: '100%',
    borderRadius: 3,
  },

  // Leaderboard
  leaderboardContainer: {
    gap: 12,
  },
  leaderboardEntryContainer: {
    position: 'relative',
  },
  leaderboardBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  leaderboardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  rankBadgeContainer: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  rankBadgeGradient: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  rankText: {
    fontSize: 14,
    fontWeight: '800',
  },
  leaderboardAvatarContainer: {
    shadowColor: '#708F96',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  leaderboardAvatarGradient: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leaderboardAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
      },
  leaderboardProperty: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.40)',
  },
  scoreContainer: {
    position: 'relative',
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leaderboardScore: {
    position: 'absolute',
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Champion
  championCard: {
    marginBottom: 24,
  },
  championBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.20)',
  },
  championGradient: {
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    borderRadius: 20,
  },
  championHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  championLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 2,
  },
  championContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  championAvatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  championAvatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  championName: {
    fontSize: 20,
    fontWeight: '700',
  },
  championScore: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4,
  },

  // Profile
  profileCardBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  profileCardGradient: {
    padding: 24,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 12,
  },
  profileAvatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  profileBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
      },
  profileInfo: {
    gap: 16,
  },
  profileRow: {
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  profileLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1,
    marginBottom: 4,
      },
  profileValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
      },

  // MST Glassmorphism Dashboard styles
  mstStatsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 4,
  },
  mstStatItem: {
    flex: 1,
    minHeight: 140,
  },
  mstSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 12,
  },
  mstSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.5,
      },
  mstSectionCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
      },
  mstTicketsList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  mstTicketItem: {
    width: '100%',
  },
  mstEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  mstEmptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.30)',
      },
});
