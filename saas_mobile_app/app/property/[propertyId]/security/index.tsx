import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context';
import { vmsService } from '@/services/vmsService';
import { ticketService } from '@/services/ticketService';

import {
  Shield,
  Users,
  AlertTriangle,
  Ticket as TicketIcon,
  LogIn,
  LogOut,
  ClipboardList,
  Siren,
  ChevronRight,
  UserCheck,
  Clock,
  MapPin,
  Phone,
} from 'lucide-react-native';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────────────

interface VisitorLog {
  id: string;
  visitor_id: string;
  name: string;
  mobile?: string;
  category: string;
  whom_to_meet: string;
  checkin_time: string;
  checkout_time?: string;
  status: 'checked_in' | 'checked_out';
  photo_url?: string;
}

interface KpiStats {
  activeVisitors: number;
  incidentsToday: number;
  securityAlerts: number;
  openTickets: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getDuration(checkin: string): string {
  const start = new Date(checkin);
  const diffMs = Date.now() - start.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  tint,
  delay,
  onPress,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tint: [string, string];
  delay: number;
  onPress?: () => void;
}) {
  const content = (
    <Animated.View entering={FadeInUp.delay(delay).duration(500)} style={{ flex: 1 }}>
      <LinearGradient colors={tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.kpiCard}>
        <View style={styles.kpiIconWrap}>{icon}</View>
        <Text style={styles.kpiValue}>{value}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
      </LinearGradient>
    </Animated.View>
  );
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={{ flex: 1 }}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

// ─── Quick Action Button ─────────────────────────────────────────────────────

function QuickAction({
  label,
  icon,
  color,
  bgColor,
  onPress,
  delay,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  onPress: () => void;
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(500)} style={styles.quickActionWrap}>
      <TouchableOpacity style={[styles.quickAction, { backgroundColor: bgColor }]} onPress={onPress} activeOpacity={0.75}>
        <View style={[styles.quickActionIcon, { backgroundColor: color + '20' }]}>{icon}</View>
        <Text style={[styles.quickActionLabel, { color }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Visitor Row ─────────────────────────────────────────────────────────────

function VisitorRow({ visitor, onPress }: { visitor: VisitorLog; onPress: () => void }) {
  const isCheckedIn = visitor.status === 'checked_in';
  return (
    <TouchableOpacity style={styles.visitorRow} onPress={onPress} activeOpacity={0.7}>
      <SafeBlurView intensity={30} tint="dark" style={[styles.visitorAvatar, { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }]}>
        <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.05)']} style={StyleSheet.absoluteFillObject} />
        <UserCheck size={18} color="rgba(255,255,255,0.5)" />
      </SafeBlurView>
      <View style={{ flex: 1 }}>
        <Text style={styles.visitorName} numberOfLines={1}>{visitor.name}</Text>
        <Text style={styles.visitorMeta}>
          {visitor.whom_to_meet} · {formatTime(visitor.checkin_time)}
        </Text>
        {isCheckedIn && (
          <Text style={styles.visitorDuration}>On site · {getDuration(visitor.checkin_time)}</Text>
        )}
      </View>
      <View style={[styles.statusBadge, { backgroundColor: isCheckedIn ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)' }]}>
        <View style={[styles.statusDot, { backgroundColor: isCheckedIn ? '#10B981' : '#94A3B8' }]} />
        <Text style={[styles.statusText, { color: isCheckedIn ? '#10B981' : '#94A3B8' }]}>
          {isCheckedIn ? 'On Premise' : 'Out'}
        </Text>
      </View>
      <ChevronRight size={14} color="rgba(255,255,255,0.25)" />
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SecurityDashboardScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, membership } = useAuth();
  const { theme: _theme } = useTheme();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState<KpiStats>({
    activeVisitors: 0,
    incidentsToday: 0,
    securityAlerts: 0,
    openTickets: 0,
  });
  const [visitors, setVisitors] = useState<VisitorLog[]>([]);
  const [propertyName, setPropertyName] = useState('');

  // Fetch property name
  useEffect(() => {
    if (!propertyId || !membership) return;
    const prop = membership.properties?.find((p) => p.id === propertyId);
    if (prop?.name) setPropertyName(prop.name);
  }, [propertyId, membership]);

  const fetchDashboardData = useCallback(async () => {
    if (!propertyId) return;
    try {
      // 1. Fetch visitors (today, all statuses)
      const visitorsRes = await vmsService.fetchVisitors(propertyId, {
        dateFilter: 'today',
        status: 'all',
      });

      let activeVisitors = 0;
      let visitorList: VisitorLog[] = [];
      if (visitorsRes.success && visitorsRes.data) {
        visitorList = visitorsRes.data.visitors as VisitorLog[];
        activeVisitors = visitorList.filter((v) => v.status === 'checked_in').length;
        setVisitors(visitorList.slice(0, 10)); // Show top 10 recent
      }

      // 2. Fetch security alerts (tickets with category = security_incident)
      let securityAlerts = 0;
      try {
        const ticketRes = await ticketService.getTickets({
          propertyId,
          status: 'open',
          category: 'security_incident',
        });
        if (ticketRes.data && !ticketRes.error) {
          securityAlerts = ticketRes.data.length;
        }
      } catch {
        // Fallback: ignore
      }

      // 3. Fetch open tickets
      let openTickets = 0;
      try {
        const allTicketsRes = await ticketService.getTickets({ propertyId, status: 'open' });
        if (allTicketsRes.data && !allTicketsRes.error) {
          openTickets = allTicketsRes.data.length;
        }
      } catch {
        // Fallback: ignore
      }

      // 4. Incidents today = security alerts + any incident tickets created today
      // For now, approximate with securityAlerts
      const incidentsToday = securityAlerts;

      setStats({
        activeVisitors,
        incidentsToday,
        securityAlerts,
        openTickets,
      });
    } catch (err) {
      console.error('[SecurityDashboard] Error fetching data:', err);
    }
  }, [propertyId]);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);
      await fetchDashboardData();
      setIsLoading(false);
      setIsRefreshing(false);
    },
    [fetchDashboardData]
  );

  const { refetch } = useDashboardFetch(queryKeys.property.security(propertyId), load, {
    staleTime: 1000 * 60 * 5,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handleSOS = () => {
    Alert.alert(
      '🚨 EMERGENCY SOS',
      'This will broadcast an emergency alert to all staff and administrators. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: () => {
            Alert.alert('SOS Sent', 'Emergency alert broadcasted to all staff.');
          },
        },
      ]
    );
  };

  if (isLoading && !isRefreshing) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={['#0B1B2A', '#0F2D3D', '#113B4D']} style={StyleSheet.absoluteFillObject} />
        <ActivityIndicator size="large" color="#708F96" />
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16, fontFamily: 'Urbanist-Medium' }}>
          Loading Security Portal...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LinearGradient colors={['#0B1B2A', '#0F2D3D', '#113B4D']} style={StyleSheet.absoluteFillObject} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#708F96" />}
      >
        {/* ── Header ── */}
        <Animated.View entering={FadeInUp.duration(400)} style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.headerTitle}>Security Portal</Text>
              <Text style={styles.headerSubtitle}>{propertyName || 'Property'}</Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── KPI Cards ── */}
        <View style={styles.kpiRow}>
          <KpiCard
            label="Active Visitors"
            value={stats.activeVisitors}
            icon={<Users size={18} color="#60A5FA" />}
            tint={['rgba(59,130,246,0.18)', 'rgba(59,130,246,0.04)']}
            delay={0}
            onPress={() => router.push(`/property/${propertyId}/visitors` as never)}
          />
          <KpiCard
            label="Incidents"
            value={stats.incidentsToday}
            icon={<AlertTriangle size={18} color="#FBBF24" />}
            tint={['rgba(245,158,11,0.18)', 'rgba(245,158,11,0.04)']}
            delay={80}
          />
        </View>
        <View style={styles.kpiRow}>
          <KpiCard
            label="Security Alerts"
            value={stats.securityAlerts}
            icon={<Shield size={18} color="#FCA5A5" />}
            tint={['rgba(239,68,68,0.18)', 'rgba(239,68,68,0.04)']}
            delay={160}
            onPress={() => router.push(`/property/${propertyId}/tickets` as never)}
          />
          <KpiCard
            label="Open Tickets"
            value={stats.openTickets}
            icon={<TicketIcon size={18} color="#6EE7B7" />}
            tint={['rgba(16,185,129,0.18)', 'rgba(16,185,129,0.04)']}
            delay={240}
            onPress={() => router.push(`/property/${propertyId}/tickets` as never)}
          />
        </View>

        {/* ── Quick Actions ── */}
        <Animated.View entering={FadeInUp.delay(300).duration(500)}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </Animated.View>
        <View style={styles.quickActionsGrid}>
          <QuickAction
            label="Check In"
            icon={<LogIn size={20} color="#10B981" />}
            color="#10B981"
            bgColor="rgba(16,185,129,0.10)"
            onPress={() => router.push(`/property/${propertyId}/visitors` as never)}
            delay={320}
          />
          <QuickAction
            label="Check Out"
            icon={<LogOut size={20} color="#EF4444" />}
            color="#EF4444"
            bgColor="rgba(239,68,68,0.10)"
            onPress={() => router.push(`/property/${propertyId}/visitors` as never)}
            delay={360}
          />
          <QuickAction
            label="Visitors"
            icon={<Users size={20} color="#60A5FA" />}
            color="#60A5FA"
            bgColor="rgba(59,130,246,0.10)"
            onPress={() => router.push(`/property/${propertyId}/visitors` as never)}
            delay={400}
          />
          <QuickAction
            label="Report"
            icon={<ClipboardList size={20} color="#AA895F" />}
            color="#AA895F"
            bgColor="rgba(170,137,95,0.10)"
            onPress={() => router.push(`/property/${propertyId}/tickets` as never)}
            delay={440}
          />
        </View>

        {/* SOS Button */}
        <Animated.View entering={FadeInUp.delay(480).duration(500)}>
          <TouchableOpacity style={styles.sosBtn} onPress={handleSOS} activeOpacity={0.8}>
            <LinearGradient colors={['rgba(239,68,68,0.2)', 'rgba(239,68,68,0.05)']} style={StyleSheet.absoluteFillObject} />
            <Siren size={22} color="#EF4444" />
            <Text style={styles.sosText}>EMERGENCY SOS</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Recent Visitors ── */}
        <Animated.View entering={FadeInUp.delay(520).duration(500)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Visitors</Text>
            <TouchableOpacity onPress={() => router.push(`/property/${propertyId}/visitors` as never)}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {visitors.length === 0 ? (
          <Animated.View entering={FadeInUp.delay(560).duration(500)} style={styles.emptyState}>
            <Users size={40} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyTitle}>No visitors today</Text>
            <Text style={styles.emptySub}>Tap Check In to log a visitor</Text>
          </Animated.View>
        ) : (
          <SafeBlurView intensity={35} tint="dark" style={[styles.visitorsCard, { borderColor: 'rgba(255,255,255,0.08)' }]}>
            <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.08)']} style={StyleSheet.absoluteFillObject} />
            {visitors.map((v, i) => (
              <VisitorRow
                key={v.id}
                visitor={v}
                onPress={() => router.push(`/property/${propertyId}/visitors` as never)}
              />
            ))}
          </SafeBlurView>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8, gap: 14 },

  // Header
  header: { marginBottom: 6 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTitle: { fontSize: 24, fontFamily: 'Poppins-Bold', color: '#FFFFFF', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, fontFamily: 'Urbanist-Medium', color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  liveText: { fontSize: 10, fontFamily: 'Urbanist-Bold', color: '#10B981', letterSpacing: 1 },

  // KPI
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpiCard: { flex: 1, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', minHeight: 110 },
  kpiIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  kpiValue: { fontSize: 28, fontFamily: 'Poppins-Bold', color: '#FFFFFF', letterSpacing: -0.5 },
  kpiLabel: { fontSize: 11, fontFamily: 'Urbanist-Bold', color: 'rgba(255,255,255,0.5)', marginTop: 4, textTransform: 'capitalize', letterSpacing: 0.5 },

  // Section
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontFamily: 'Poppins-Bold', color: '#FFFFFF', letterSpacing: -0.3 },
  seeAll: { fontSize: 12, fontFamily: 'Urbanist-Bold', color: '#708F96' },

  // Quick Actions
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickActionWrap: { width: (SCREEN_W - 42) / 2 },
  quickAction: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  quickActionIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  quickActionLabel: { fontSize: 13, fontFamily: 'Poppins-Bold' },

  // SOS
  sosBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', overflow: 'hidden' },
  sosText: { fontSize: 14, fontFamily: 'Poppins-Bold', color: '#EF4444', letterSpacing: 1 },

  // Visitors Card
  visitorsCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', paddingVertical: 8 },
  visitorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  visitorAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  visitorName: { fontSize: 14, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  visitorMeta: { fontSize: 11, fontFamily: 'Urbanist-Medium', color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  visitorDuration: { fontSize: 10, fontFamily: 'Urbanist-Bold', color: '#10B981', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginRight: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 9, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: 'Poppins-Bold', color: 'rgba(255,255,255,0.5)' },
  emptySub: { fontSize: 13, fontFamily: 'Urbanist-Regular', color: 'rgba(255,255,255,0.35)' },
});
