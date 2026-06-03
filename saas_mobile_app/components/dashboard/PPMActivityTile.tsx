/**
 * PPMActivityTile — Full-width card showing preventive maintenance activities
 * Grouped by Today / Monthly / Quarterly with status indicators.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { useRouter } from 'expo-router';
import { ppmService } from '@/services/ppmService';
import { Colors, Typography, Radius } from '@/constants/cassandra-theme';
import { SPACING } from '@/constants/designSystem';

interface PPMSchedule {
  id: string;
  asset_name: string;
  schedule_type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  next_due: string;
  last_completed?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  property_id: string;
  description?: string;
}

interface PPMActivityTileProps {
  propertyId: string;
  organizationId?: string;
  delay?: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Scheduled',
  in_progress: 'Active',
  completed: 'Completed',
  overdue: 'Overdue',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  in_progress: '#3B82F6',
  completed: '#10B981',
  overdue: '#EF4444',
};

const PERIOD_LABELS: Record<string, string> = {
  daily: 'Today',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

export const PPMActivityTile: React.FC<PPMActivityTileProps> = ({
  propertyId,
  organizationId,
  delay = 400,
}) => {
  const router = useRouter();
  const [schedules, setSchedules] = useState<PPMSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) return;
    fetchSchedules();
  }, [propertyId]);

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const res = await ppmService.fetchSchedules(propertyId, organizationId);
      if (res.success && res.data) {
        setSchedules(res.data.map((s: any) => ({
          id: s.id,
          asset_name: s.system_name,
          schedule_type: s.frequency,
          next_due: s.planned_date,
          last_completed: s.done_date,
          status: s.status,
          property_id: s.property_id,
          description: s.description,
        })) as PPMSchedule[]);
      }
    } finally {
      setLoading(false);
    }
  };

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const grouped = useMemo(() => {
    const groups: Record<string, PPMSchedule[]> = {
      daily: [],
      monthly: [],
      quarterly: [],
    };
    schedules.forEach((s) => {
      if (!s || !s.schedule_type) return;
      const type = s.schedule_type.toLowerCase();
      if (groups[type]) {
        groups[type].push(s);
      }
    });
    return groups;
  }, [schedules]);

  const todayCount = useMemo(() => {
    return schedules.filter((s) => s.next_due && s.next_due.startsWith(todayStr)).length;
  }, [schedules, todayStr]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    Object.keys(grouped).forEach((period) => {
      counts[period] = { pending: 0, in_progress: 0, completed: 0, overdue: 0 };
      grouped[period].forEach((s) => {
        if (!s || !s.status) return;
        counts[period][s.status] = (counts[period][s.status] || 0) + 1;
      });
    });
    return counts;
  }, [grouped]);

  const handlePress = () => {
    router.push(`/property/${propertyId}/ppm` as any);
  };

  if (loading) {
    return (
      <Animated.View entering={FadeInUp.delay(delay)} style={styles.container}>
        <SafeBlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.inner}>
          <Text style={styles.loadingText}>Loading PPM activities…</Text>
        </View>
      </Animated.View>
    );
  }

  const totalActivities = schedules.length;
  if (totalActivities === 0) return null;

  return (
    <Animated.View entering={FadeInUp.delay(delay)}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.85} style={styles.container}>
        <SafeBlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.inner}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>🔧</Text>
              </View>
              <View>
                <Text style={styles.title}>PPM Schedules</Text>
                <Text style={styles.subtitle}>{totalActivities} activities tracked</Text>
              </View>
            </View>
            <View style={styles.arrow}>
              <Text style={styles.arrowText}>›</Text>
            </View>
          </View>

          {/* Period rows */}
          <View style={styles.periodsRow}>
            {([
              { key: 'today', label: 'Today', count: todayCount },
              { key: 'monthly', label: 'Monthly', count: grouped['monthly']?.length || 0 },
              { key: 'quarterly', label: 'Quarterly', count: grouped['quarterly']?.length || 0 },
            ] as const).map((period) => {
              const counts = statusCounts[period.key] || {};
              return (
                <View key={period.key} style={styles.periodCard}>
                  <Text style={styles.periodLabel}>{period.label}</Text>
                  <Text style={styles.periodCount}>{period.count}</Text>
                  <View style={styles.dotsRow}>
                    {Object.entries(counts).map(([status, num], idx) =>
                      num > 0 ? (
                        <View key={`${period.key}-${status}-${idx}`} style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status] }]} />
                      ) : null
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Status legend */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legendRow} showsVerticalScrollIndicator={false}>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <View key={key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: STATUS_COLORS[key] }]} />
                <Text style={styles.legendText}>{label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inner: {
    padding: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 18,
  },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  arrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    color: Colors.textSecondary,
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 22,
  },
  periodsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  periodCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.lg,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  periodLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  periodCount: {
    ...Typography.h1,
    color: Colors.textPrimary,
    fontWeight: '700',
    marginVertical: 4,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingTop: SPACING.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontSize: 11,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
});

export default PPMActivityTile;
