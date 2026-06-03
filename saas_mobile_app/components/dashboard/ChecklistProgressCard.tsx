/**
 * ChecklistProgressCard — Semi-circle arc progress with green/red split
 * Glass background matching other dashboard tiles.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { SPACING } from '@/constants/designSystem';
import { CARD_SURFACES } from '@/constants/designSystem';
import SafeBlurView from '@/components/ui/SafeBlurView';

interface ChecklistProgressCardProps {
  completed: number;
  total: number;
  delay?: number;
  onPress?: () => void;
}

export const ChecklistProgressCard: React.FC<ChecklistProgressCardProps> = ({
  completed = 0,
  total = 0,
  delay = 200,
  onPress,
}) => {
  const safeCompleted = typeof completed === 'number' && !isNaN(completed) ? completed : 0;
  const safeTotal = typeof total === 'number' && !isNaN(total) ? total : 0;
  const percent = safeTotal > 0 ? safeCompleted / safeTotal : 0;
  const pctDisplay = Math.round(percent * 100);

  const message = useMemo(() => {
    if (percent >= 1) return { title: 'All Done! 🎉', subtitle: 'Everything is complete' };
    if (percent >= 0.75) return { title: 'Almost There! 🔥', subtitle: 'Great work, keep going' };
    if (percent >= 0.5) return { title: 'Halfway There! 💪', subtitle: 'Steady progress' };
    if (percent >= 0.25) return { title: 'Good Start! ⭐', subtitle: 'Keep the momentum' };
    return { title: "Let's Begin! 🚀", subtitle: 'Start your daily checklist' };
  }, [percent]);

  // ── Semi-circle arc math ──────────────────────────────────────
  // We draw a full circle but only show the top half via viewBox clip.
  // 9 o'clock  = 180°  = start of our visible arc
  // 3 o'clock  = 360°  = end of our visible arc
  // SVG strokes default to starting at 3 o'clock (0°) going clockwise.
  // strokeDashoffset shifts the pattern start clockwise when negative.

  const size = 260;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference / 2; // 180°
  const greenLength = arcLength * percent;
  const redLength = arcLength * (1 - percent);

  // Start both arcs at 9 o'clock = C/2
  const startOffset = -circumference / 2;
  const greenOffset = startOffset;
  const redOffset = startOffset - greenLength;

  const cx = size / 2;
  const cy = size / 2 + 10; // nudge down so top arc sits nicely

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
            <Text style={styles.badgeText}>+{pctDisplay}%</Text>
          </View>
        </View>

        {/* Arc */}
        <View style={styles.arcWrapper}>
          <Svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`}>
            <Defs>
              <SvgLinearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="#22C55E" />
                <Stop offset="100%" stopColor="#4ADE80" />
              </SvgLinearGradient>
              <SvgLinearGradient id="redGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="#EF4444" />
                <Stop offset="100%" stopColor="#F87171" />
              </SvgLinearGradient>
            </Defs>

            {/* Red track (remaining) — drawn first so green overlaps cleanly */}
            <Circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="url(#redGrad)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${redLength} ${circumference}`}
              strokeDashoffset={redOffset}
              strokeLinecap="round"
            />

            {/* Green arc (completed) */}
            <Circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="url(#greenGrad)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${greenLength} ${circumference}`}
              strokeDashoffset={greenOffset}
              strokeLinecap="round"
            />
          </Svg>

          {/* Center score */}
          <View style={styles.center}>
            <Text style={styles.centerNumber}>{safeCompleted}/{safeTotal}</Text>
            <Text style={styles.centerLabel}>
              {percent >= 1 ? 'Completed' : percent >= 0.5 ? 'On Track' : 'In Progress'}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity activeOpacity={0.7} style={styles.footerBtn}>
            <Text style={styles.footerBtnText}>Edit</Text>
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
    color: '#EF4444',
    fontWeight: '700',
  },
  arcWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 165,
    marginTop: SPACING.sm,
  },
  center: {
    position: 'absolute',
    bottom: 6,
    alignItems: 'center',
  },
  centerNumber: {
    fontSize: 38,
    fontWeight: '800',
    color: '#fff',
  },
  centerLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
    marginTop: 2,
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

export default ChecklistProgressCard;
