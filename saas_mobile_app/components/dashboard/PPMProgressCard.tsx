/**
 * PPMProgressCard — Mini calendar + task summary for Preventive Maintenance
 * Shows a compact month view with PPM task dots and upcoming count.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SPACING, CARD_SURFACES } from '@/constants/designSystem';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { ppmService, PPMSchedule } from '@/services/ppmService';

interface PPMProgressCardProps {
  propertyId: string;
  organizationId?: string;
  done: number;
  total: number;
  pending: number;
  overdue: number;
  postponed?: number;
  delay?: number;
  onPress?: () => void;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const PPMProgressCard: React.FC<PPMProgressCardProps> = ({
  propertyId,
  organizationId,
  done = 0,
  total = 0,
  pending = 0,
  overdue = 0,
  postponed = 0,
  delay = 200,
  onPress,
}) => {
  const [schedules, setSchedules] = useState<PPMSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) {
      if (__DEV__) console.log('[PPMProgressCard] no propertyId');
      return;
    }
    if (__DEV__) console.log('[PPMProgressCard] fetching schedules for', propertyId, 'org:', organizationId);
    let mounted = true;
    ppmService.fetchSchedules(propertyId, organizationId).then((res) => {
      if (!mounted) return;
      if (__DEV__) console.log('[PPMProgressCard] fetch result:', res.success, res.data?.length ?? 0, 'items');
      if (res.success && res.data) setSchedules(res.data);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [propertyId, organizationId]);

  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const message = useMemo(() => {
    if (percent >= 100) return { title: 'All Maintained! 🔧', subtitle: 'Every PPM task is complete' };
    if (percent >= 75) return { title: 'Almost There! ⚡', subtitle: 'PM schedule on track' };
    if (percent >= 50) return { title: 'Halfway There! 📋', subtitle: 'Keep up the maintenance' };
    if (percent >= 25) return { title: 'Good Start! 🔩', subtitle: 'PM work in progress' };
    return { title: 'Plan Maintenance! 🛠️', subtitle: 'Start your PPM schedule' };
  }, [percent]);

  // ── Calendar data ─────────────────────────────────────────────
  const today = useMemo(() => new Date(), []);
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const tasksByDate = useMemo(() => {
    const map: Record<string, { total: number; done: number; pending: number; overdue: number }> = {};
    schedules.forEach((s) => {
      if (!s.planned_date) return;
      const d = map[s.planned_date] || { total: 0, done: 0, pending: 0, overdue: 0 };
      d.total++;
      if (s.status === 'done') d.done++;
      else if (s.status === 'pending') d.pending++;
      else if (s.status === 'postponed') d.overdue++; // treat postponed as overdue-ish
      map[s.planned_date] = d;
    });
    return map;
  }, [schedules]);

  const upcomingCount = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return schedules.filter((s) => {
      if (!s.planned_date || s.status !== 'pending') return false;
      const planned = new Date(s.planned_date + 'T00:00:00');
      const diff = Math.ceil((planned.getTime() - now.getTime()) / 86400000);
      return diff >= 0 && diff <= 7;
    }).length;
  }, [schedules]);

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [firstDayOfWeek, daysInMonth]);

  const renderDayCell = (day: number | null, idx: number) => {
    if (day === null) {
      return <View key={`pad-${idx}`} style={styles.dayCell} />;
    }
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const taskInfo = tasksByDate[dateStr];
    const isToday = day === today.getDate();

    let dotColor: string | null = null;
    if (taskInfo) {
      if (taskInfo.done > 0 && taskInfo.pending === 0 && taskInfo.overdue === 0) dotColor = '#10B981';
      else if (taskInfo.overdue > 0 || taskInfo.pending > 0) dotColor = '#F59E0B';
      else dotColor = '#8B5CF6';
    }

    return (
      <View key={`d-${day}`} style={[styles.dayCell, isToday && styles.todayCell]}>
        <Text style={[styles.dayText, isToday && styles.todayText]}>{day}</Text>
        {dotColor && <View style={[styles.dayDot, { backgroundColor: dotColor }]} />}
      </View>
    );
  };

  return (
    <Animated.View entering={FadeInUp.delay(delay)} style={styles.wrapper}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.92} style={styles.card}>
        <SafeBlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.subtitle}>{message.subtitle}</Text>
            <Text style={styles.title}>{message.title}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>+{percent}%</Text>
          </View>
        </View>

        {/* Mini Calendar */}
        <View style={styles.calendarSection}>
          <Text style={styles.monthLabel}>
            {MONTH_NAMES[month]} {year}
          </Text>

          {/* Day headers */}
          <View style={styles.dayHeaders}>
            {DAY_LABELS.map((d, idx) => (
              <Text key={idx} style={styles.dayHeaderText}>{d}</Text>
            ))}
          </View>

          {/* Date grid */}
          <View style={styles.calendarGrid}>
            {calendarDays.map((day, idx) => renderDayCell(day, idx))}
          </View>
        </View>

        {/* Task counts row */}
        <View style={styles.countsRow}>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeValue}>{upcomingCount}</Text>
            <Text style={styles.countBadgeLabel}>Upcoming (7d)</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeValue}>{total}</Text>
            <Text style={styles.countBadgeLabel}>Total Tasks</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeValue}>{done}</Text>
            <Text style={styles.countBadgeLabel}>Completed</Text>
          </View>
        </View>

        {/* Breakdown row */}
        <View style={styles.breakdown}>
          <View style={styles.breakdownItem}>
            <Text style={[styles.breakdownDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.breakdownLabel}>Pending</Text>
            <Text style={styles.breakdownValue}>{pending}</Text>
          </View>
          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownItem}>
            <Text style={[styles.breakdownDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.breakdownLabel}>Overdue</Text>
            <Text style={styles.breakdownValue}>{overdue}</Text>
          </View>
          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownItem}>
            <Text style={[styles.breakdownDot, { backgroundColor: '#6B7280' }]} />
            <Text style={styles.breakdownLabel}>Postponed</Text>
            <Text style={styles.breakdownValue}>{postponed}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity activeOpacity={0.7} style={styles.footerBtn}>
            <Text style={styles.footerBtnText}>View PPM</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} style={[styles.footerBtn, styles.footerBtnCircle]}>
            <Text style={styles.footerBtnIcon}>⇡</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },
  card: {
    borderRadius: CARD_SURFACES.cardRadius,
    backgroundColor: CARD_SURFACES.cardBg,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    padding: CARD_SURFACES.cardPadding,
    paddingBottom: SPACING.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
  },
  title: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '800',
    marginTop: 2,
  },
  badge: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 14,
    color: '#F59E0B',
    fontWeight: '700',
  },
  // ── Calendar ──
  calendarSection: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  dayHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dayHeaderText: {
    width: 32,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  dayCell: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderRadius: 8,
  },
  todayCell: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
  },
  dayText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  todayText: {
    color: '#fff',
    fontWeight: '700',
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  // ── Counts ──
  countsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  countBadge: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  countBadgeValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  countBadgeLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
    marginTop: 2,
  },
  // ── Breakdown ──
  breakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.sm,
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  breakdownValue: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
  breakdownDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  footerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  footerBtnText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  footerBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  footerBtnIcon: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
});

export default PPMProgressCard;
