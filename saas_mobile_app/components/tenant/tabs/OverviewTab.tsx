'use client';
import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';
import { TenantGlassHeader } from '../TenantGlassHeader';
import { TenantStatsCard } from '../TenantStatsCard';
import { TenantTicketCard } from '../TenantTicketCard';
import { useAuth } from '@/hooks/useAuth';
import { WeatherData } from '@/hooks/useWeather';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const fontSans = Platform.select({ web: 'system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });
const fontDisplay = Platform.select({ web: '"SF Pro Display", system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });

interface Ticket {
  id: string;
  ticket_number?: string;
  title?: string;
  description?: string;
  status: string;
  priority: string;
  created_at: string;
  assignee?: { full_name?: string; user_photo_url?: string };
}

interface OverviewTabProps {
  propertyName?: string;
  stats: { open: number; total: number; critical: number; completion: number };
  recentTickets: Ticket[];
  isSuperTenant?: boolean;
  propertyPicker?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  onTicketPress?: (ticket: Ticket) => void;
  weather?: WeatherData | null;
}

// Shortcut definitions with real SVG icons
const SHORTCUTS = [
  {
    label: 'Helpdesk',
    icon: 'helpdesk',
    color: '#667eea',
    colorLight: 'rgba(102,126,234,0.15)',
  },
  {
    label: 'Visitor',
    icon: 'visitor',
    color: '#EC4899',
    colorLight: 'rgba(236,72,153,0.15)',
  },
  {
    label: 'Amenities',
    icon: 'amenities',
    color: '#475569',
    colorLight: 'rgba(71,85,105,0.15)',
  },
  {
    label: 'Parking',
    icon: 'parking',
    color: '#10B981',
    colorLight: 'rgba(16,185,129,0.15)',
  },
];

function ShortcutIcon({ type, color }: { type: string; color: string }) {
  switch (type) {
    case 'helpdesk':
      return (
        <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <Path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </Svg>
      );
    case 'visitor':
      return (
        <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <Circle cx="9" cy="7" r="4" />
          <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </Svg>
      );
    case 'amenities':
      return (
        <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <Path d="M9 22V12h6v10" />
        </Svg>
      );
    case 'parking':
      return (
        <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <Rect x="1" y="3" width="15" height="13" rx="2" />
          <Circle cx="5.5" cy="18.5" r="2.5" />
          <Circle cx="18.5" cy="18.5" r="2.5" />
          <Path d="M16 8h4l3 5v5h-2" />
          <Path d="M1 8h2" />
        </Svg>
      );
    default:
      return null;
  }
}

interface ShortcutCardProps {
  shortcut: (typeof SHORTCUTS)[0];
  index: number;
  onPress?: () => void;
}

function ShortcutCard({ shortcut, index, onPress }: ShortcutCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  };

  return (
    <AnimatedTouchable
      entering={FadeInDown.delay(index * 80).springify()}
      style={[styles.shortcutCard, animatedStyle]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <View style={[styles.shortcutIconBg, { backgroundColor: shortcut.colorLight }]}>
        <ShortcutIcon type={shortcut.icon} color={shortcut.color} />
      </View>
      <Text style={styles.shortcutLabel}>{shortcut.label}</Text>
    </AnimatedTouchable>
  );
}

export function OverviewTab({
  propertyName,
  stats,
  recentTickets,
  isSuperTenant,
  propertyPicker,
  onRefresh,
  refreshing,
  onTicketPress,
  weather,
}: OverviewTabProps) {
  const { user } = useAuth();
  const userName = user?.full_name ?? user?.user_metadata?.full_name ?? 'Client';

  // Weather-aware glassmorphism colors
  const glass = weather?.auroraColors ?? {
    glassBg: 'rgba(255,255,255,0.12)',
    glassBorder: 'rgba(255,255,255,0.18)',
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.75)',
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor="#708F96"
            colors={['#708F96']}
          />
        ) : undefined
      }
      contentContainerStyle={styles.scrollContent}
    >
      <TenantGlassHeader
        propertyName={propertyName}
        userName={userName}
        isSuperTenant={isSuperTenant}
      />

      {/* Property picker for super tenant */}
      {isSuperTenant && propertyPicker && (
        <View style={styles.pickerWrapper}>{propertyPicker}</View>
      )}

      <View style={styles.content}>
        {/* Search bar */}
        <View style={styles.searchBar}>
          <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round">
            <Circle cx="11" cy="11" r="8" />
            <Path d="m21 21-4.35-4.35" />
          </Svg>
          <Text style={styles.searchPlaceholder}>Search tickets, rooms, visitors...</Text>
          <View style={styles.filterBtn}>
            <Text style={styles.filterBtnText}>Filter</Text>
          </View>
        </View>

        {/* Stats row with icons */}
        <View style={styles.statsRow}>
          <TenantStatsCard
            value={stats.open}
            label="Open Tickets"
            sublabel="Active requests"
            color="#FF9F0A"
            icon="ticket"
            trend="up"
          />
          <TenantStatsCard
            value={`${stats.completion}%`}
            label="Resolution"
            sublabel="This month"
            color="#4CAF50"
            icon="check"
            trend="up"
          />
          <TenantStatsCard
            value={stats.critical}
            label="Critical"
            sublabel="Urgent"
            color="#E53935"
            icon="alert"
            trend={stats.critical > 0 ? 'down' : 'neutral'}
          />
        </View>

        {/* Section header */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Property Requests</Text>
            <Text style={styles.sectionSubtitle}>{recentTickets.length} total</Text>
          </View>
          <View style={styles.viewAllBtn}>
            <Text style={styles.viewAllText}>View All</Text>
            <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <Path d="m9 18 6-6-6-6" />
            </Svg>
          </View>
        </View>

        {/* Recent tickets */}
        {recentTickets.length === 0 ? (
          <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="1.5" strokeLinecap="round">
                <Path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                <Path d="M13 5v14M13 12h.01" />
              </Svg>
            </View>
            <Text style={styles.emptyText}>No requests yet</Text>
            <Text style={styles.emptySubtext}>
              Your maintenance requests will appear here
            </Text>
          </Animated.View>
        ) : (
          recentTickets.slice(0, 3).map((ticket, i) => (
            <Animated.View
              key={ticket.id}
              entering={FadeInDown.delay(i * 100 + 100).springify()}
              style={styles.ticketWrapper}
            >
              <TenantTicketCard
                ticket={ticket}
                onPress={() => onTicketPress?.(ticket)}
              />
            </Animated.View>
          ))
        )}

        {/* Shortcuts */}
        <View style={styles.shortcutsSection}>
          <Text style={styles.shortcutsTitle}>Quick Access</Text>
          <View style={styles.shortcutsRow}>
            {SHORTCUTS.map((s, i) => (
              <ShortcutCard key={s.label} shortcut={s} index={i} />
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 200,
  },
  pickerWrapper: {
    marginTop: -10,
    paddingHorizontal: 16,
  },
  content: {
    padding: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backdropFilter: 'blur(12px)',
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginLeft: 8,
      },
  filterBtn: {
    backgroundColor: 'rgba(112,143,150,0.35)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  filterBtnText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
      },
  sectionSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
      },
  viewAllBtn: {
    backgroundColor: 'rgba(112,143,150,0.30)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  viewAllText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  ticketWrapper: {
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    padding: 32,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backdropFilter: 'blur(16px)',
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(112,143,150,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
      },
  emptySubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
      },
  shortcutsSection: {
    marginTop: 8,
  },
  shortcutsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    letterSpacing: -0.2,
      },
  shortcutsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  shortcutCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backdropFilter: 'blur(12px)',
  },
  shortcutIconBg: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  shortcutLabel: {
    fontSize: 10,
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.1,
      },
});
