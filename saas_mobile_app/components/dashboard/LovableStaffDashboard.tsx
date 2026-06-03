'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TicketCreateModal } from '@/components/tickets/TicketCreateModal';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Alert,
  Dimensions,
  Modal,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useWeather } from '@/hooks/useWeather';
import DashboardBackground from '@/components/dashboard/DashboardBackground';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolate,
  FadeInUp,
  FadeInDown,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { createClient } from '@/utils/supabase/client';
import { serverApi } from '@/lib/serverApi';
import { useAuth } from '@/hooks/useAuth';
import { useGamification } from '@/hooks/mst/useGamification';
import { useAsyncStorageCache } from '@/hooks/useAsyncStorageCache';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';

// WeatherBackground removed — using static sunny gradient instead
import SafeBlurView from '@/components/ui/SafeBlurView';
import { LevelBadge } from '@/components/gamification/LevelBadge';
import { XPBar } from '@/components/gamification/XPBar';
import { StreakChip } from '@/components/gamification/StreakChip';
import { Leaderboard } from '@/components/gamification/Leaderboard';
import { AchievementBadge } from '@/components/gamification/AchievementBadge';
import {
  defaultMstUser,
  defaultAchievements,
  defaultLeaderboard as demoLeaderboard,
  type UserStats,
  type LeaderRow,
} from '@/lib/gamification';
import PPMActivityTile from '@/components/dashboard/PPMActivityTile';
import ChecklistProgressCard from '@/components/dashboard/ChecklistProgressCard';
import PPMProgressCard from '@/components/dashboard/PPMProgressCard';
import { ppmService } from '@/services/ppmService';

import SignOutModal from '@/components/ui/SignOutModal';
import PermissionOnboarding, { hasRequestedPermissions } from '@/components/onboarding/PermissionOnboarding';
import NotificationModal from '@/components/notifications/NotificationModal';
import MobileFooter from '@/components/shared/MobileFooter';
import Toast from '@/components/ui/Toast';
import { Audio } from 'expo-av';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  assigned_to?: string | null;
  assignee?: {
    full_name: string;
    email: string;
    user_photo_url?: string | null;
  } | null;
  creator?: { full_name: string } | null;
  photo_before_url?: string;
  sla_due_at?: string;
}

type Tab = 'dashboard' | 'daily' | 'operations' | 'profile';

interface Props {
  propertyId: string;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatTile({
  value,
  label,
  tint,
  wide = false,
  onPress,
}: {
  value: string;
  label: string;
  tint: [string, string];
  wide?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <LinearGradient
      colors={tint}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.statTile, wide && styles.statTileWide]}
    >
      <View style={styles.statTileGlow} />
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileLabel}>{label}</Text>
    </LinearGradient>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[wide ? { flex: 1 } : { flex: 1 }]}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

function TimeBlock({ val }: { val: number }) {
  return (
    <View style={styles.timeBlock}>
      <Text style={styles.timeBlockText}>{String(val).padStart(2, '0')}</Text>
    </View>
  );
}

function PropertyFlowTile({
  name,
  code,
  active,
}: {
  name: string;
  code: string;
  active: number;
}) {
  return (
    <View style={styles.flowTile}>
      <View style={styles.flowTileInner}>
        <View style={styles.flowTileHeader}>
          <Ionicons name="location" size={12} color="rgba(255,255,255,0.55)" />
          <Text style={styles.flowTileCode}>{code}</Text>
        </View>
        <Text style={styles.flowTileName}>{name}</Text>
        <View style={styles.flowTileAvatars}>
          {Array.from({ length: active }).map((_, i) => (
            <View key={i} style={[styles.flowTileAvatar, { marginLeft: i > 0 ? -6 : 0 }]}>
              <Text style={styles.flowTileAvatarText}>{String.fromCharCode(65 + i)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.flowTileStatus}>
          <View style={styles.flowTileDot} />
          <Text style={styles.flowTileStatusText}>
            {active} MST{active > 1 ? 's' : ''} on-site
          </Text>
        </View>
      </View>
    </View>
  );
}

function ProfileStat({
  icon,
  value,
  label,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  tint: string;
}) {
  return (
    <View style={styles.profileStat}>
      <View style={[styles.profileStatIcon, { backgroundColor: tint + '30' }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  );
}

function TabButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons
        name={icon}
        size={22}
        color={active ? '#FFFFFF' : 'rgba(255,255,255,0.55)'}
      />
      <Text style={[styles.tabButtonLabel, active && styles.tabButtonLabelActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Ticket Stack (swipeable) ────────────────────────────────────────────────

const STACK_HEIGHT = 420;

function TicketStack({ tickets: initialTickets }: { tickets: Ticket[] }) {
  const [order, setOrder] = useState(initialTickets);
  const translateX = useSharedValue(0);

  const sendToBack = useCallback(() => {
    setOrder((prev) => {
      if (prev.length < 2) return prev;
      const [first, ...rest] = prev;
      return [...rest, first];
    });
    translateX.value = 0;
  }, []);

  const pan = Gesture.Pan()
    .minDistance(10)
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 80 || Math.abs(e.velocityX) > 500) {
        const dest = e.translationX > 0 ? SCREEN_W : -SCREEN_W;
        translateX.value = withSpring(dest, { velocity: e.velocityX, damping: 20, stiffness: 90 }, () => {
          runOnJS(sendToBack)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 15, stiffness: 120 });
      }
    });

  return (
    <View style={{ height: STACK_HEIGHT }}>
      {order.map((t, i) => {
        const isTop = i === 0;
        const offset = i * 12;
        const scale = 1 - i * 0.045;
        const opacity = i > 3 ? 0 : 1 - i * 0.18;

        return (
          <View
            key={t.id}
            style={[
              StyleSheet.absoluteFillObject,
              {
                transform: [{ translateY: offset }, { scale }],
                opacity,
                zIndex: order.length - i,
                pointerEvents: isTop ? 'auto' : 'none',
              },
            ]}
          >
            {isTop ? (
              <GestureDetector gesture={pan}>
                <Animated.View
                  style={[
                    StyleSheet.absoluteFillObject,
                    useAnimatedStyle(() => ({
                      transform: [
                        { translateX: translateX.value },
                        {
                          rotate: `${interpolate(
                            translateX.value,
                            [-SCREEN_W, 0, SCREEN_W],
                            [-8, 0, 8],
                            Extrapolate.CLAMP
                          )}deg`,
                        },
                      ],
                    })),
                  ]}
                >
                  <TicketCard ticket={t} />
                </Animated.View>
              </GestureDetector>
            ) : (
              <TicketCard ticket={t} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
    LOW: { bg: 'rgba(100,116,139,0.20)', text: '#94A3B8', border: 'rgba(100,116,139,0.40)' },
    MEDIUM: { bg: 'rgba(251,191,36,0.15)', text: '#FDE68A', border: 'rgba(251,191,36,0.35)' },
    HIGH: { bg: 'rgba(239,68,68,0.18)', text: '#FCA5A5', border: 'rgba(239,68,68,0.40)' },
    URGENT: { bg: 'rgba(239,68,68,0.25)', text: '#FECACA', border: 'rgba(239,68,68,0.50)' },
  };
  const p = priorityColors[ticket.priority?.toUpperCase()] || priorityColors.LOW;

  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    ASSIGNED: { bg: 'rgba(124,92,250,0.15)', text: '#C4B5FD', border: 'rgba(124,92,250,0.35)' },
    PENDING: { bg: 'rgba(251,191,36,0.12)', text: '#FDE68A', border: 'rgba(251,191,36,0.30)' },
    'IN-PROGRESS': { bg: 'rgba(34,211,238,0.12)', text: '#A5F3FC', border: 'rgba(34,211,238,0.30)' },
  };
  const s = statusColors[ticket.status?.toUpperCase()] || statusColors.ASSIGNED;

  return (
    <View style={styles.ticketCard}>
      <View style={styles.ticketCardInner}>
        {/* Header */}
        <View style={styles.ticketHeader}>
          <View style={styles.ticketIconBox}>
            <Ionicons name="time" size={20} color="rgba(255,255,255,0.80)" />
          </View>
          <View style={styles.ticketHeaderInfo}>
            <Text style={styles.ticketId} numberOfLines={1}>
              {ticket.ticket_number}
            </Text>
            <Text style={styles.ticketDate}>
              {new Date(ticket.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>
          <View style={styles.ticketHeaderActions}>
            <TouchableOpacity style={styles.ticketActionBtn}>
              <Ionicons name="share-outline" size={14} color="rgba(255,255,255,0.70)" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.ticketActionBtn}>
              <Ionicons name="create-outline" size={14} color="rgba(255,255,255,0.70)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Badges */}
        <View style={styles.ticketBadges}>
          <View style={[styles.ticketBadge, { backgroundColor: p.bg, borderColor: p.border }]}>
            <Text style={[styles.ticketBadgeText, { color: p.text }]}>{ticket.priority}</Text>
          </View>
          <View style={[styles.ticketBadge, { backgroundColor: s.bg, borderColor: s.border }]}>
            <Text style={[styles.ticketBadgeText, { color: s.text }]}>{ticket.status}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.ticketTitle}>{ticket.title}</Text>

        {/* Assignee */}
        <View style={styles.ticketAssignee}>
          <View style={styles.ticketAssigneeAvatar}>
            <Text style={styles.ticketAssigneeInitials}>
              {ticket.assignee?.full_name?.[0] || 'M'}
            </Text>
          </View>
          <Text style={styles.ticketAssigneeName}>{ticket.assignee?.full_name || 'Unassigned'}</Text>
        </View>

        {/* Footer */}
        <View style={styles.ticketFooter}>
          <View>
            <Text style={styles.ticketFooterLabel}>SLA Countdown</Text>
            <View style={styles.ticketSlaBadge}>
              <Ionicons name="time" size={12} color="#FCA5A5" />
              <Text style={styles.ticketSlaText}>1d 8h 54m</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.ticketFooterLabel}>Score</Text>
            <Text style={styles.ticketScore}>+5</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.ticketActionsRow}>
          <TouchableOpacity style={styles.ticketViewBtn}>
            <Text style={styles.ticketViewBtnText}>View Ticket</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ticketAcceptBtn}>
            <Text style={styles.ticketAcceptBtnText}>Accept Task</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function LovableStaffDashboard({ propertyId }: Props) {
  const insets = useSafeAreaInsets();
  const { user, signOut, membership } = useAuth();
  const { weather } = useWeather();
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  // AsyncStorage cache for instant dashboard load on app reopen
  const { cachedData: staffCache, hasCache: hasStaffCache, saveCache: saveStaffCache } = useAsyncStorageCache<{
    property: { name: string } | null;
    tickets: Ticket[];
    isCheckedIn: boolean;
    userSkills: string[];
    specialization: string | null;
    ppmTotal: number;
    ppmDone: number;
    ppmPending: number;
    ppmOverdue: number;
    ppmPostponed: number;
  }>({
    key: 'staff-dashboard',
    propertyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isLoading, setIsLoading] = useState(!hasStaffCache);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [property, setProperty] = useState<{ name: string } | null>(staffCache?.property ?? null);
  const [tickets, setTickets] = useState<Ticket[]>(staffCache?.tickets ?? []);
  const [isCheckedIn, setIsCheckedIn] = useState(staffCache?.isCheckedIn ?? false);
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [isCheckingInOut, setIsCheckingInOut] = useState(false);
  const [userSkills, setUserSkills] = useState<string[]>(staffCache?.userSkills ?? []);
  const [specialization, setSpecialization] = useState<string | null>(staffCache?.specialization ?? null);

  // PPM stats (local)
  const [ppmTotal, setPpmTotal]   = useState(staffCache?.ppmTotal ?? 0);
  const [ppmDone, setPpmDone]     = useState(staffCache?.ppmDone ?? 0);
  const [ppmPending, setPpmPending] = useState(staffCache?.ppmPending ?? 0);
  const [ppmOverdue, setPpmOverdue] = useState(staffCache?.ppmOverdue ?? 0);
  const [ppmPostponed, setPpmPostponed] = useState(staffCache?.ppmPostponed ?? 0);

  const isTechnical = userSkills.includes('technical');
  const isSoftServices = userSkills.includes('soft_services') || userSkills.includes('housekeeping');

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [showPermissionOnboarding, setShowPermissionOnboarding] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [toastConfig, setToastConfig] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>({ visible: false, message: '', type: 'info' });

  // Gamification
  const { leaderboard: gamifyLb, myStats, loading: gamifyLoading } = useGamification(propertyId);

  // Countdown
  const [countdown, setCountdown] = useState('00:00:00');
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const ms = Math.max(0, end.getTime() - now.getTime());
      const hh = Math.floor(ms / 3600000);
      const mm = Math.floor((ms % 3600000) / 60000);
      const ss = Math.floor((ms % 60000) / 1000);
      setCountdown(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Data fetching ──
  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    try {
      const { data: propData } = await supabase
        .from('properties')
        .select('name')
        .eq('id', propertyId)
        .maybeSingle();
      if (propData) setProperty(propData);

      const { data: ticketData } = await supabase
        .from('tickets')
        .select(`
          *,
          assignee:users!assigned_to(id, full_name, email, user_photo_url),
          creator:users!raised_by(id, full_name)
        `)
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false });
      if (ticketData) setTickets(ticketData as Ticket[]);

      // Shift status
      const { data: shiftData } = await supabase
        .from('resolver_stats')
        .select('is_checked_in')
        .eq('property_id', propertyId)
        .eq('user_id', user?.id as string)
        .maybeSingle();
      if (shiftData) setIsCheckedIn(!!(shiftData as any).is_checked_in);

      // Fetch specialization
      let cachedUserSkills = userSkills;
      let cachedSpecialization = specialization;
      const { data: skills } = await ((supabase
        .from('mst_skills') as any)
        .select('skill_group_code')
        .eq('user_id', user?.id as string)
        .eq('property_id', propertyId)
        .single() as any);

      if (skills?.skill_group_code) {
        setUserSkills([skills.skill_group_code]);
        setSpecialization(skills.skill_group_code.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));
        cachedUserSkills = [skills.skill_group_code];
        cachedSpecialization = skills.skill_group_code.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      } else {
        const { data: resolverStats } = await (supabase
          .from('resolver_stats')
          .select('skills, specialization')
          .eq('user_id', user?.id as string)
          .eq('property_id', propertyId)
          .single() as any);

        if (resolverStats?.skills && Array.isArray(resolverStats.skills)) {
          setUserSkills(resolverStats.skills);
          cachedUserSkills = resolverStats.skills;
          if (resolverStats.skills.length > 0) {
            setSpecialization(resolverStats.skills[0].replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));
            cachedSpecialization = resolverStats.skills[0].replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          }
        }
      }

      // PPM stats
      let cachedPpmTotal = 0, cachedPpmDone = 0, cachedPpmPending = 0, cachedPpmOverdue = 0, cachedPpmPostponed = 0;
      try {
        const ppmRes = await ppmService.fetchStats(propertyId);
        if (ppmRes.success && ppmRes.data) {
          cachedPpmTotal = ppmRes.data.total ?? 0;
          cachedPpmDone = ppmRes.data.done ?? 0;
          cachedPpmPending = ppmRes.data.pending ?? 0;
          cachedPpmOverdue = ppmRes.data.overdue ?? 0;
          cachedPpmPostponed = ppmRes.data.postponed ?? 0;
          setPpmTotal(cachedPpmTotal);
          setPpmDone(cachedPpmDone);
          setPpmPending(cachedPpmPending);
          setPpmOverdue(cachedPpmOverdue);
          setPpmPostponed(cachedPpmPostponed);
        }
      } catch (_e) { /* ignore */ }

      // Save to AsyncStorage cache so next app open is instant
      saveStaffCache({
        property: propData ?? property,
        tickets: (ticketData as Ticket[]) ?? tickets,
        isCheckedIn: !!(shiftData as any)?.is_checked_in,
        userSkills: cachedUserSkills,
        specialization: cachedSpecialization,
        ppmTotal: cachedPpmTotal,
        ppmDone: cachedPpmDone,
        ppmPending: cachedPpmPending,
        ppmOverdue: cachedPpmOverdue,
        ppmPostponed: cachedPpmPostponed,
      });

    } catch (err) {
      console.warn('[LovableStaffDashboard] fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [propertyId, user?.id]);

  // React Query wrapper: prevents re-fetching on every mount if data is fresh
  const { refetch } = useDashboardFetch(queryKeys.property.dashboardStaff(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    // fetchData is called by useDashboardFetch on mount (if stale)
    hasRequestedPermissions().then(requested => {
      if (!requested) setShowPermissionOnboarding(true);
    });
  }, [propertyId]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // ── Shift toggle ──
  const toggleShift = useCallback(async () => {
    if (!user?.id || !propertyId || isCheckingInOut) return;
    setIsCheckingInOut(true);
    const newStatus = !isCheckedIn;

    try {
      // TODO: shift_logs does not exist in saas_one schema
      // if (newStatus) {
      //   const { data: newShift, error: shiftErr }: any = await (supabase
      //     .from('shift_logs') as any)
      //     .insert({
      //       user_id: user.id,
      //       property_id: propertyId,
      //       status: 'active',
      //       check_in_at: new Date().toISOString(),
      //     })
      //     .select()
      //     .single();
      //   if (shiftErr) throw shiftErr;
      //   setActiveShiftId(newShift.id);
      // } else {
      //   if (activeShiftId) {
      //     await (supabase.from('shift_logs') as any)
      //       .update({ status: 'completed', check_out_at: new Date().toISOString() })
      //       .eq('id', activeShiftId);
      //   }
      //   setActiveShiftId(null);
      // }

      await serverApi.query({
        table: 'resolver_stats',
        action: 'upsert',
        values: { property_id: propertyId, user_id: user.id, is_checked_in: newStatus },
        mutationOptions: { onConflict: 'user_id,property_id' },
      });

      setIsCheckedIn(newStatus);
      
      try {
        const { sound } = await Audio.Sound.createAsync({
          uri: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'
        });
        await sound.playAsync();
      } catch (err) {
        console.warn('Audio play failed:', err);
      }

      setToastConfig({
        visible: true,
        message: `You are now ${newStatus ? 'ON DUTY' : 'OFF DUTY'}.`,
        type: 'success'
      });
    } catch (error: any) {
      setToastConfig({
        visible: true,
        message: error.message || 'Failed to update shift',
        type: 'error'
      });
      setIsCheckedIn(!newStatus);
    } finally {
      setIsCheckingInOut(false);
    }
  }, [isCheckedIn, propertyId, user?.id, activeShiftId, isCheckingInOut]);

  // ── Stats ──
  const stats = useMemo(() => {
    const total = tickets.length;
    const active = tickets.filter((t) =>
      ['open', 'in_progress', 'blocked', 'client_raised'].includes(t.status)
    ).length;
    const completed = tickets.filter((t) =>
      ['resolved', 'closed'].includes(t.status)
    ).length;
    const assignedToMe = tickets.filter(t => t.assigned_to === user?.id).length;
    return { total, active, completed, assignedToMe };
  }, [tickets, user]);

  // ── Gamification user ──
  const mstUser: UserStats = useMemo(() => {
    if (!myStats) return defaultMstUser;
    return {
      name: user?.user_metadata?.full_name || 'MST User',
      initials: (user?.user_metadata?.full_name || 'U')
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2),
      level: 1 + Math.floor((myStats.all_time?.total_points ?? 0) / 1000),
      levelName: 'Field Master',
      xp: myStats.today?.total_points ?? 0,
      xpForNext: 500,
      totalXp: myStats.all_time?.total_points ?? 0,
      streak: myStats.streak?.current ?? 0,
      weeklyRank: myStats.today?.rank ?? 1,
      weeklyTotal: myStats.today?.total_in_rank ?? 1,
    };
  }, [myStats, user]);

  // ── Leaderboard rows ──
  const leaderboardRows: LeaderRow[] = useMemo(() => {
    if (gamifyLb.length === 0) return demoLeaderboard;
    return gamifyLb.map((entry, i) => ({
      rank: i + 1,
      name: entry.name || 'Staff',
      initials: (entry.name || 'S').charAt(0).toUpperCase(),
      property: property?.name || 'Property',
      xp: entry.score ?? 0,
      resolved: entry.tickets_resolved ?? 0,
      streak: entry.streak_days ?? 0,
      isMe: entry.user_id === user?.id,
      user_id: entry.user_id,
    }));
  }, [gamifyLb, property, user?.id]);

  const champion: LeaderRow | undefined = leaderboardRows[0];

  // ── Tabs ──

  const renderMyDashboard = () => (
    <>
      {/* Gamification strip */}
      <Animated.View entering={FadeInUp.delay(100).duration(600)} style={styles.gamifyCard}>
        <SafeBlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.gamifyInner}>
          <LevelBadge level={mstUser.level} size="md" />
          <View style={styles.gamifyMeta}>
            <View style={styles.gamifyMetaTop}>
              <Text style={styles.gamifyLevelName}>{mstUser.levelName}</Text>
              <View style={styles.gamifyChips}>
                <StreakChip streak={mstUser.streak} />
                <View style={styles.rankBadge}>
                  <Text style={styles.rankBadgeText}>#{mstUser.weeklyRank}</Text>
                </View>
              </View>
            </View>
            <View style={styles.gamifyXp}>
              <XPBar xp={mstUser.xp} xpForNext={mstUser.xpForNext} />
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Stats card */}
      <Animated.View entering={FadeInUp.delay(200).duration(600)} style={styles.statsCard}>
        <SafeBlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.statsCardInner}>
          <View style={styles.statsCardHeader}>
            <TouchableOpacity style={styles.customizeBtn}>
              <Ionicons name="options-outline" size={14} color="rgba(255,255,255,0.80)" />
              <Text style={styles.customizeBtnText}>Customize</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.statsGrid}>
            <StatTile value={String(stats.total)} label="TOTAL" tint={['rgba(99,102,241,0.35)', 'rgba(79,70,229,0.20)']} onPress={() => router.push(`/property/${propertyId}/tickets`)} />
            <StatTile value={String(stats.active)} label="ACTIVE" tint={['rgba(59,130,246,0.30)', 'rgba(37,99,235,0.15)']} onPress={() => router.push(`/property/${propertyId}/tickets?filter=active`)} />
          </View>
          <View style={[styles.statsGrid, { marginTop: 12 }]}>
            <StatTile value={String(stats.completed)} label="COMPLETED" tint={['rgba(16,185,129,0.30)', 'rgba(5,150,105,0.15)']} onPress={() => router.push(`/property/${propertyId}/tickets?filter=completed`)} />
            <StatTile value={String(stats.assignedToMe)} label="ASSIGNED TO ME" tint={['rgba(245,158,11,0.30)', 'rgba(217,119,6,0.15)']} onPress={() => router.push(`/property/${propertyId}/tickets?filter=mine`)} />
          </View>
        </View>
      </Animated.View>

      <ChecklistProgressCard completed={stats.completed} total={stats.total} delay={280} />

      <PPMProgressCard
        propertyId={propertyId}
        organizationId={orgId}
        done={ppmDone}
        total={ppmTotal}
        pending={ppmPending}
        overdue={ppmOverdue}
        postponed={ppmPostponed}
        delay={320}
        onPress={() => router.push(`/property/${propertyId}/ppm`)}
      />

      <PPMActivityTile propertyId={propertyId} organizationId={orgId} delay={380} />

      {/* Property Requests */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderTitle}>Property Requests</Text>
        <Text style={styles.sectionHeaderHint}>Tap top card to cycle</Text>
      </View>

      <TicketStack tickets={tickets.slice(0, 5)} />
    </>
  );

  const renderDailyBoard = () => (
    <>
      <Animated.View entering={FadeInUp.duration(500)}>
        <Text style={styles.heroTitle}>Daily Board</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.countdownCard}>
        <SafeBlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.countdownInner}>
          <View style={styles.countdownLabelRow}>
            <Ionicons name="time" size={12} color="rgba(255,255,255,0.60)" />
            <Text style={styles.countdownLabel}>Time left today</Text>
          </View>
          <View style={styles.countdownBlocks}>
            <TimeBlock val={parseInt(countdown.split(':')[0], 10)} />
            <Text style={styles.countdownColon}>:</Text>
            <TimeBlock val={parseInt(countdown.split(':')[1], 10)} />
            <Text style={styles.countdownColon}>:</Text>
            <TimeBlock val={parseInt(countdown.split(':')[2], 10)} />
          </View>
          <Text style={styles.countdownHint}>Resolve more tickets to climb the board</Text>
        </View>
      </Animated.View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderTitle}>Today's Standings</Text>
      </View>

      <Leaderboard rows={leaderboardRows} />
    </>
  );

  const renderOperations = () => (
    <>
      <Animated.View entering={FadeInUp.duration(500)}>
        <Text style={styles.heroTitle}>Operations</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.championCard}>
        <SafeBlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.championInner}>
          <View style={styles.championInfo}>
            <Text style={styles.championLabel}>Your Specialization</Text>
            <Text style={styles.championName}>{specialization || 'General Staff'}</Text>
            <Text style={styles.championMeta}>Access to {userSkills.length > 0 ? userSkills.length : 'all'} module groups</Text>
          </View>
          <View style={styles.championAvatarWrap}>
            <LinearGradient
              colors={['#8B5CF6', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.championAvatar}
            >
              <Ionicons name="briefcase" size={24} color="#FFFFFF" />
            </LinearGradient>
          </View>
        </View>
      </Animated.View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderTitle}>Available Modules</Text>
      </View>

      <View style={styles.flowGrid}>
        {/* Always visible modules */}
        <TouchableOpacity style={styles.flowTile} onPress={() => router.push(`/property/${propertyId}/visitors` as any)}>
          <View style={styles.flowTileInner}>
            <View style={styles.flowTileHeader}>
              <Ionicons name="people" size={20} color="#60A5FA" />
            </View>
            <Text style={styles.flowTileName}>Visitors</Text>
            <View style={styles.flowTileStatus}>
              <Text style={styles.flowTileStatusText}>Visitor Management</Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.flowTile} onPress={() => router.push(`/property/${propertyId}/stock` as any)}>
          <View style={styles.flowTileInner}>
            <View style={styles.flowTileHeader}>
              <Ionicons name="cube" size={20} color="#34D399" />
            </View>
            <Text style={styles.flowTileName}>Stock</Text>
            <View style={styles.flowTileStatus}>
              <Text style={styles.flowTileStatusText}>Inventory & Scans</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Technical Modules */}
        {isTechnical && (
          <>
            <TouchableOpacity style={styles.flowTile} onPress={() => router.push(`/property/${propertyId}/diesel` as any)}>
              <View style={styles.flowTileInner}>
                <View style={styles.flowTileHeader}>
                  <Ionicons name="water" size={20} color="#FBBF24" />
                </View>
                <Text style={styles.flowTileName}>Diesel Logger</Text>
                <View style={styles.flowTileStatus}>
                  <Text style={styles.flowTileStatusText}>Record Readings</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.flowTile} onPress={() => router.push(`/property/${propertyId}/electricity` as any)}>
              <View style={styles.flowTileInner}>
                <View style={styles.flowTileHeader}>
                  <Ionicons name="flash" size={20} color="#F472B6" />
                </View>
                <Text style={styles.flowTileName}>Electricity</Text>
                <View style={styles.flowTileStatus}>
                  <Text style={styles.flowTileStatusText}>Meter Readings</Text>
                </View>
              </View>
            </TouchableOpacity>
          </>
        )}

        {/* Soft Services Modules */}
        {isSoftServices && (
          <TouchableOpacity style={styles.flowTile} onPress={() => router.push(`/property/${propertyId}/checklist` as any)}>
            <View style={styles.flowTileInner}>
              <View style={styles.flowTileHeader}>
                <Ionicons name="checkbox" size={20} color="#A78BFA" />
              </View>
              <Text style={styles.flowTileName}>Checklists</Text>
              <View style={styles.flowTileStatus}>
                <Text style={styles.flowTileStatusText}>Daily Operations</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  const renderProfile = () => {
    const unlocked = defaultAchievements.filter((a) => a.unlocked);
    const locked = defaultAchievements.filter((a) => !a.unlocked);
    const myRow = leaderboardRows.find((r) => r.isMe) ?? leaderboardRows[0];

    return (
      <>
        {/* Identity card */}
        <Animated.View entering={FadeInUp.duration(500)} style={styles.identityCard}>
          <SafeBlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.identityInner}>
            <View style={styles.identityTop}>
              <LinearGradient
                colors={['#7C5CFA', '#5B3FD6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.identityAvatar}
              >
                <Text style={styles.identityAvatarText}>{mstUser.initials}</Text>
                <View style={styles.identityLevel}>
                  <LevelBadge level={mstUser.level} size="sm" />
                </View>
              </LinearGradient>
              <View style={styles.identityInfo}>
                <Text style={styles.identityName}>{mstUser.name}</Text>
                <Text style={styles.identityLevelName}>{mstUser.levelName}</Text>
                <View style={styles.identityChips}>
                  <StreakChip streak={mstUser.streak} />
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankBadgeText}>Rank #{mstUser.weeklyRank}</Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.identityXp}>
              <XPBar xp={mstUser.xp} xpForNext={mstUser.xpForNext} />
              <Text style={styles.identityXpHint}>
                {mstUser.xpForNext - mstUser.xp} XP to level {mstUser.level + 1}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Lifetime stats */}
        <View style={styles.profileStatsGrid}>
          <ProfileStat icon="trophy" value={mstUser.totalXp.toLocaleString()} label="TOTAL XP" tint="#FBBF24" />
          <ProfileStat icon="checkmark-circle" value={String(myRow?.resolved ?? 0)} label="RESOLVED" tint="#34D399" />
          <ProfileStat icon="flag" value={`${unlocked.length}/${defaultAchievements.length}`} label="BADGES" tint="#60A5FA" />
        </View>

        {/* Achievements */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderTitle}>Achievements</Text>
          <Text style={styles.sectionHeaderHint}>
            {unlocked.length} of {defaultAchievements.length} unlocked
          </Text>
        </View>
        <View style={styles.achievementsGrid}>
          {[...unlocked, ...locked].map((a, i) => (
            <AchievementBadge key={a.id} achievement={a} delay={i * 0.05} />
          ))}
        </View>
      </>
    );
  };

  const orgId = membership?.org_id ?? '';

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <DashboardBackground />
        {/* WeatherBackground removed — DashboardBackground handles theming */}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <DashboardBackground />
      {/* WeatherBackground removed — DashboardBackground handles theming */}

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="rgba(255,255,255,0.6)" />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
      >
        <Animated.View entering={FadeInUp.duration(500)} style={[styles.shellHeader, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity style={styles.hamburgerBtn} onPress={() => setShowDrawer(true)} activeOpacity={0.7}>
            <Ionicons name="menu" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <TouchableOpacity style={styles.profileRow} activeOpacity={0.7} onPress={() => setActiveTab('profile')}>
              <LinearGradient
                colors={['#8B5CF6', '#6366F1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerAvatar}
              >
                <Text style={styles.avatarText}>
                  {user?.user_metadata?.full_name
                    ? user.user_metadata.full_name.split(' ').map((name: string) => name[0]).join('').toUpperCase().slice(0, 2)
                    : mstUser.initials}
                </Text>
              </LinearGradient>
              <View style={[styles.nameContainer, { flex: 1 }]}>
                <Text style={styles.greetingName} numberOfLines={1}>
                  Hey, {(user?.user_metadata?.full_name || mstUser.name).split(' ')[0]}
                </Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {property?.name || 'MST Portal'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
          <View style={[styles.headerRight, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <TouchableOpacity 
              style={[
                styles.headerIconBtn, 
                { 
                  backgroundColor: isCheckedIn ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.10)',
                  borderColor: isCheckedIn ? 'rgba(16,185,129,0.3)' : 'transparent',
                  borderWidth: 1,
                }
              ]} 
              onPress={toggleShift} 
              activeOpacity={0.7}
              disabled={isCheckingInOut}
            >
              {isCheckingInOut ? (
                <ActivityIndicator size="small" color={isCheckedIn ? '#34D399' : '#FFFFFF'} />
              ) : (
                <Ionicons 
                  name={isCheckedIn ? 'briefcase' : 'briefcase-outline'} 
                  size={20} 
                  color={isCheckedIn ? '#34D399' : '#FFFFFF'} 
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowCreate(true)} activeOpacity={0.7}>
              <Ionicons name="add-circle-outline" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowNotifications(true)} activeOpacity={0.7}>
              <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
              <View style={styles.notificationBadge} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Tab content */}
        <View style={styles.tabContent}>
          {activeTab === 'dashboard' && renderMyDashboard()}
          {activeTab === 'daily' && renderDailyBoard()}
          {activeTab === 'operations' && renderOperations()}
          {activeTab === 'profile' && renderProfile()}
        </View>
      </ScrollView>

      <MobileFooter activeTab="dashboard" onMorePress={() => setShowDrawer(true)} />

      {/* Modals */}
      <TicketCreateModal isOpen={showCreate} onClose={() => setShowCreate(false)} propertyId={propertyId} organizationId={orgId} />
      <SignOutModal visible={showSignOut} onClose={() => setShowSignOut(false)} onSignOut={signOut} />
      <NotificationModal visible={showNotifications} onClose={() => setShowNotifications(false)} propertyId={propertyId} />
      <PermissionOnboarding visible={showPermissionOnboarding} onComplete={() => setShowPermissionOnboarding(false)} />
      <Modal visible={showDrawer} transparent animationType="fade" onRequestClose={() => setShowDrawer(false)}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={[styles.drawerPanel, { paddingTop: insets.top + 16 }]}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerLogoContainer}>
                <Image
                  source={require('@/assets/images/autopilot-logo-new.png')}
                  style={[styles.drawerLogo, { tintColor: '#FFFFFF' }]}
                  resizeMode="contain"
                />
              </View>
              <TouchableOpacity onPress={() => setShowDrawer(false)} style={styles.drawerCloseBtn}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.drawerSectionHeader}>
                <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.3)" />
                <Text style={styles.drawerSectionLabel}>DAILY WORK</Text>
              </View>
              {[
                { label: 'Overview', icon: 'grid-outline', action: () => setActiveTab('dashboard') },
                { label: 'Daily Board', icon: 'podium-outline', action: () => setActiveTab('daily') },
                { label: 'Operations', icon: 'briefcase-outline', action: () => setActiveTab('operations') },
              ].map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={styles.drawerItem}
                  onPress={() => {
                    setShowDrawer(false);
                    item.action();
                  }}
                >
                  <Ionicons name={item.icon as any} size={20} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.drawerItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}

              <View style={[styles.drawerSectionHeader, { marginTop: 20 }]}>
                <Ionicons name="hammer-outline" size={14} color="rgba(255,255,255,0.3)" />
                <Text style={styles.drawerSectionLabel}>OPERATIONS</Text>
              </View>
              {[
                { label: 'Tickets', icon: 'ticket-outline', route: 'tickets' },
                { label: 'Visitors', icon: 'walk-outline', route: 'visitors' },
                { label: 'Diesel Logger', icon: 'water-outline', route: 'diesel' },
                { label: 'Electricity Logger', icon: 'flash-outline', route: 'electricity' },
                { label: 'Checklists', icon: 'clipboard-outline', route: 'checklist' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.route}
                  style={styles.drawerItem}
                  onPress={() => {
                    setShowDrawer(false);
                    router.push(`/property/${propertyId}/${item.route}` as any);
                  }}
                >
                  <Ionicons name={item.icon as any} size={20} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.drawerItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}

              <View style={[styles.drawerSectionHeader, { marginTop: 20 }]}>
                <Ionicons name="person-outline" size={14} color="rgba(255,255,255,0.3)" />
                <Text style={styles.drawerSectionLabel}>SYSTEM & PERSONAL</Text>
              </View>
              {[
                { label: 'Settings', icon: 'settings-outline', route: 'settings', local: false },
                { label: 'Profile', icon: 'person-outline', local: true },
              ].map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={styles.drawerItem}
                  onPress={() => {
                    setShowDrawer(false);
                    if (item.local) {
                      setActiveTab('profile');
                      return;
                    }
                    router.push(`/property/${propertyId}/${item.route}` as any);
                  }}
                >
                  <Ionicons name={item.icon as any} size={20} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.drawerItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.drawerSignOut} onPress={() => { setShowDrawer(false); setShowSignOut(true); }}>
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              <Text style={styles.drawerSignOutText}>Logout</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.drawerBackdrop} onPress={() => setShowDrawer(false)} />
        </View>
      </Modal>

      <Toast 
        {...toastConfig} 
        onClose={() => setToastConfig(prev => ({ ...prev, visible: false }))} 
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4A1A1A',
  },
  scroll: {
    flex: 1,
    zIndex: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
  },

  // Shell header
  shellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  hamburgerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  nameContainer: {
    marginLeft: 12,
    minWidth: 0,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.60)',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },

  // Shell drawer
  drawerPanel: {
    width: 288,
    backgroundColor: 'rgba(11, 17, 25, 0.98)',
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  drawerLogoContainer: {
    flex: 1,
  },
  drawerLogo: {
    width: 180,
    height: 42,
  },
  drawerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  drawerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  drawerSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  drawerItemLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
  },
  drawerSignOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  drawerSignOutText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  avatarGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 22,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  greeting: {
    flex: 1,
    minWidth: 0,
  },
  greetingName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  greetingTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.60)',
    marginTop: 1,
  },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },

  // Tab content
  tabContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // Hero title
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    lineHeight: 34,
    letterSpacing: -0.5,
  },

  // Gamification strip
  gamifyCard: {
    marginTop: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  gamifyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  gamifyMeta: {
    flex: 1,
    minWidth: 0,
  },
  gamifyMetaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gamifyLevelName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gamifyChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rankBadge: {
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.20)',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rankBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FDE68A',
  },
  gamifyXp: {
    marginTop: 8,
  },

  // Stats card
  statsCard: {
    marginTop: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  statsCardInner: {
    padding: 16,
  },
  statsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  customizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  customizeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.80)',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statsWide: {
    marginTop: 12,
  },
  statTile: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    position: 'relative',
  },
  statTileWide: {
    paddingVertical: 24,
  },
  statTileGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.15)',
    opacity: 0.4,
  },
  statTileValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  statTileLabel: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.70)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 32,
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  sectionHeaderHint: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 0.5,
  },

  // Ticket card (for stack)
  ticketCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(30,30,50,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.45,
    shadowRadius: 60,
    elevation: 20,
    overflow: 'hidden',
  },
  ticketCardInner: {
    padding: 16,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  ticketIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(60,60,90,0.50)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ticketHeaderInfo: {
    flex: 1,
    minWidth: 0,
  },
  ticketId: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ticketDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.60)',
    marginTop: 2,
  },
  ticketHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  ticketActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ticketBadges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  ticketBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ticketBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  ticketTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  ticketAssignee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  ticketAssigneeAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ticketAssigneeInitials: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ticketAssigneeName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.80)',
  },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  ticketFooterLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  ticketSlaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(239,68,68,0.20)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  ticketSlaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FCA5A5',
  },
  ticketScore: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ticketActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  ticketViewBtn: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  ticketViewBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ticketAcceptBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  ticketAcceptBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.90)',
  },

  // Daily board
  countdownCard: {
    marginTop: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  countdownInner: {
    padding: 20,
    alignItems: 'center',
  },
  countdownLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countdownLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  countdownBlocks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  timeBlock: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  timeBlockText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  countdownColon: {
    fontSize: 24,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.30)',
  },
  countdownHint: {
    marginTop: 12,
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
  },

  // Live flow
  championCard: {
    marginTop: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  championInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
  },
  championAvatarWrap: {
    position: 'relative',
  },
  championAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.45)',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  championAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  crownBadge: {
    position: 'absolute',
    top: -10,
    left: '50%',
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  championInfo: {
    flex: 1,
    minWidth: 0,
  },
  championLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FDE68A',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  championName: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  championMeta: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(255,255,255,0.60)',
  },
  flowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  flowTile: {
    width: (SCREEN_W - 52) / 2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  flowTileInner: {
    padding: 14,
  },
  flowTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flowTileCode: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  flowTileName: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  flowTileAvatars: {
    flexDirection: 'row',
    marginTop: 12,
  },
  flowTileAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    backgroundColor: '#4C3FB8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flowTileAvatarText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  flowTileStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  flowTileDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  flowTileStatusText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
  },

  // Profile
  identityCard: {
    marginTop: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  identityInner: {
    padding: 20,
  },
  identityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  identityAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    shadowColor: '#7C5CFA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 12,
    position: 'relative',
  },
  identityAvatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  identityLevel: {
    position: 'absolute',
    bottom: -4,
    right: -4,
  },
  identityInfo: {
    flex: 1,
    minWidth: 0,
  },
  identityName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  identityLevelName: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(255,255,255,0.60)',
  },
  identityChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  identityXp: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  identityXpHint: {
    marginTop: 8,
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
  },
  profileStatsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  profileStat: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    alignItems: 'center',
    backdropFilter: 'blur(20px)',
  },
  profileStatIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileStatValue: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  profileStatLabel: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },

  // Bottom nav
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  bottomNavBlur: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: 'rgba(11,15,25,0.85)',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  tabButtonActive: {},
  tabButtonLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
  },
  tabButtonLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Ask Cassandra
  askCassandraWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 40,
    alignItems: 'center',
  },
  askCassandraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  askCassandraLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  askCassandraOrb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
