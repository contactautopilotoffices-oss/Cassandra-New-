import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Dimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  SPACING,
  STATUS_COLORS,
  CARD_SURFACES,
} from '@/constants/designSystem';

const fontSans = Platform.select({ web: 'system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });
const fontDisplay = Platform.select({ web: '"SF Pro Display", system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });

// ─── Pulse Dot ────────────────────────────────────────────────────────────────
export function PulseDot({ color }: { color: string }) {
  return (
    <View
      style={[
        styles.pulseDot,
        { backgroundColor: color, shadowColor: color, shadowOpacity: 0.8, shadowRadius: 6 },
      ]}
    />
  );
}

// ─── Glass Tile ───────────────────────────────────────────────────────────────
export function GlassTile({
  label,
  icon,
  children,
  delay = 0,
  status,
  onPress,
}: {
  label: string;
  icon: any;
  children: React.ReactNode;
  delay?: number;
  status?: 'optimal' | 'watch' | 'critical';
  onPress?: () => void;
}) {
  const statusColor = status ? STATUS_COLORS[status].bg : null;

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(500)} style={{ width: '100%' }}>
      <TouchableOpacity activeOpacity={0.9} onPress={onPress} disabled={!onPress}>
        <SafeBlurView intensity={45} style={styles.tile} tint="dark">
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.08)',
              'rgba(255,255,255,0.03)',
              'rgba(0,0,0,0.2)'
            ]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.tileContent}>
            <View style={styles.tileHeader}>
              <View style={styles.iconBadge}>
                <Ionicons name={icon} size={14} color="#FFFFFF" />
              </View>
              <Text style={styles.tileLabel}>{label.toUpperCase()}</Text>
              {status && <PulseDot color={statusColor!} />}
              <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.3)" />
            </View>
            <View style={styles.tileBody}>{children}</View>
          </View>
        </SafeBlurView>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────
export function MiniBarChart({ data, highlightColor }: { data: number[]; highlightColor?: string }) {
  const max = Math.max(...data, 1);
  return (
    <View style={styles.barChart}>
      {data.map((v, i) => (
        <View key={i} style={styles.barContainer}>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  height: `${Math.max((v / max) * 100, 5)}%`,
                  backgroundColor:
                    i === data.length - 1 ? highlightColor || 'rgba(112,143,150,0.80)' : 'rgba(0,0,0,0.12)',
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <View style={styles.progressBar}>
      <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: color }]} />
    </View>
  );
}

// ─── Attention Card ───────────────────────────────────────────────────────────
export function AttentionCard({ item, index, onAction }: { item: any; index: number; onAction: () => void }) {
  const severityColor =
    item.severity === 'critical' ? '#EF4444' :
    item.severity === 'high' ? '#F59E0B' :
    item.severity === 'medium' ? '#3B82F6' : '#6B7280';

  const iconName =
    item.type === 'critical_ticket' ? 'alert-circle-outline' :
    item.type === 'stale_ticket' ? 'time-outline' :
    item.type === 'sop_missed' ? 'checkbox-outline' : 'information-circle-outline';

  return (
    <Animated.View entering={FadeInUp.delay(index * 100).duration(500)}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onAction}
        style={[styles.attentionCard, { borderLeftColor: severityColor, borderLeftWidth: 3 }]}
      >
        <SafeBlurView intensity={30} style={StyleSheet.absoluteFillObject} tint="dark" />
        <LinearGradient
          colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.05)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.attentionCardInner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.attentionIconBadge, { backgroundColor: severityColor + '15' }]}>
              {item.photoBeforeUrl ? (
                <Image source={{ uri: item.photoBeforeUrl }} style={styles.badgeImage} resizeMode="cover" />
              ) : (
                <Ionicons name={iconName} size={14} color={severityColor} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.attentionTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.attentionDesc} numberOfLines={2}>{item.description}</Text>
            </View>
            <View style={[styles.attentionActionBadge, { backgroundColor: severityColor + '15' }]}>
              <Text style={[styles.attentionActionText, { color: severityColor }]}>{item.action_label}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Stat Columns (3-Column Layout) ───────────────────────────────────────────
export function StatColumns({ data }: { data: { label: string; value: number | string; color: string }[] }) {
  return (
    <View style={styles.statColumnsRow}>
      {data.map((item, i) => (
        <View key={i} style={[styles.statCol, i < data.length - 1 && styles.statColDivider]}>
          <Text style={styles.statValue}>{item.value}</Text>
          <View style={styles.statLabelRow}>
            <View style={[styles.statDot, { backgroundColor: item.color }]} />
            <Text style={styles.statLabelText}>{item.label.toUpperCase()}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Compliance Gauge (Semi-circle) ───────────────────────────────────────────
export function ComplianceGauge({ value, total = 100 }: { value: number; total?: number }) {
  const percentage = Math.min((value / total) * 100, 100);
  return (
    <View style={styles.gaugeContainer}>
      <View style={styles.semiCircleContainer}>
        {/* Simplified Semi-circle representation using borders/rotation */}
        <View style={styles.semiCircleTrack} />
        <View style={[styles.semiCircleFill, { transform: [{ rotate: `${(percentage / 100) * 180 - 180}deg` }] }]} />
        <View style={styles.semiCircleInner} />
      </View>
      
      <View style={styles.gaugeTextOverlay}>
        <View style={styles.gaugeTextRow}>
          <Text style={styles.gaugeValueBig}>{value}</Text>
          <Text style={styles.gaugeValueSlash}>/ {total}</Text>
        </View>
        <Text style={styles.gaugePercentLabel}>{percentage}% COMPLETED</Text>
      </View>
      
      <TouchableOpacity style={styles.askCassandraPill}>
        <Text style={styles.askCassandraPillText}>ASK CASSANDRA</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Schedule Item ────────────────────────────────────────────────────────────
export function ScheduleItem({ date, month, title, type, status }: { date: string; month: string; title: string; type: string; status: 'PENDING' | 'SCHEDULED' }) {
  const statusColor = status === 'PENDING' ? '#F5A000' : '#3182CE';
  return (
    <View style={styles.scheduleItem}>
      <SafeBlurView intensity={20} style={styles.scheduleDateBadge} tint="light">
        <Text style={styles.scheduleMonth}>{month.toUpperCase()}</Text>
        <Text style={styles.scheduleDate}>{date}</Text>
      </SafeBlurView>
      <View style={styles.scheduleContent}>
        <Text style={styles.scheduleTitle}>{title}</Text>
        <Text style={styles.scheduleType}>{type.toUpperCase()}</Text>
      </View>
      <Text style={[styles.scheduleStatus, { color: statusColor }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pulseDot: { width: 6, height: 6, borderRadius: 3 },
  tile: {
    borderRadius: 24,
    marginHorizontal: SPACING.xl,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    overflow: 'hidden',
  },
  tileContent: { padding: 16 },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileLabel: {
    flex: 1,
        fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.5,
  },
  tileBody: { minHeight: 40 },
  barChart: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 12,
  },
  barContainer: { flex: 1, height: '100%' },
  barTrack: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { borderRadius: 4 },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 2,
    width: 64,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  attentionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    marginHorizontal: SPACING.xl,
    marginBottom: 8,
    overflow: 'hidden',
  },
  attentionCardInner: { padding: 10 },
  attentionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  badgeImage: {
    width: '100%',
    height: '100%',
  },
  attentionTitle: {
        fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  attentionDesc: {
        fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
    lineHeight: 16,
  },
  attentionActionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  attentionActionText: {
        fontSize: 10,
    fontWeight: '700',
  },
  // Stat Columns
  statColumnsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statColDivider: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  statValue: {
        fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
    letterSpacing: -1,
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statLabelText: {
        fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1,
  },
  // Gauge (Semi-circle simulation)
  gaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 5,
  },
  semiCircleContainer: {
    width: 200,
    height: 100,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  semiCircleTrack: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 14,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'absolute',
    bottom: -100,
  },
  semiCircleFill: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 16,
    borderColor: '#4ADE80',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    position: 'absolute',
    bottom: -100,
  },
  semiCircleInner: {
    width: 172,
    height: 86,
    backgroundColor: 'transparent',
    borderTopLeftRadius: 86,
    borderTopRightRadius: 86,
  },
  gaugeTextOverlay: {
    position: 'absolute',
    top: 50,
    alignItems: 'center',
  },
  gaugeTextRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  gaugeValueBig: {
        fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  gaugeValueSlash: {
        fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.3)',
    marginLeft: 4,
  },
  gaugePercentLabel: {
        fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    marginTop: -2,
  },
  askCassandraPill: {
    marginTop: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  askCassandraPillText: {
        fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  // Schedule
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 32,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  scheduleDateBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  scheduleMonth: {
        fontSize: 8,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.6)',
  },
  scheduleDate: {
        fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scheduleContent: {
    flex: 1,
    marginLeft: 16,
  },
  scheduleTitle: {
        fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scheduleType: {
        fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  scheduleStatus: {
        fontSize: 11,
    fontWeight: '700',
    marginRight: 16,
  },
});
