import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SLATimelineProps {
  createdAt: string;
  assignedAt?: string | null;
  slaDeadline?: string | null;
  resolvedAt?: string | null;
  totalPausedMins?: number;
  breached?: boolean;
}

const formatDuration = (ms: number): string => {
  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export default function SLAIndicator({
  createdAt,
  assignedAt,
  slaDeadline,
  resolvedAt,
  totalPausedMins = 0,
  breached = false,
}: SLATimelineProps) {
  if (!slaDeadline) return null;

  const deadlineDate = new Date(slaDeadline);
  const now = new Date();
  const isResolved = !!resolvedAt;
  const referenceTime = isResolved ? new Date(resolvedAt!) : now;
  
  const isActuallyBreached = breached || deadlineDate < referenceTime;
  const breachMs = isActuallyBreached ? referenceTime.getTime() - deadlineDate.getTime() : 0;

  return (
    <View style={[styles.container, isActuallyBreached ? styles.breachedBg : styles.onTrackBg]}>
      {/* Header Stat row */}
      <View style={styles.header}>
        <View style={styles.titleCol}>
          <View style={[styles.iconBox, isActuallyBreached ? styles.breachedIcon : styles.onTrackIcon]}>
            <Ionicons 
              name={isActuallyBreached ? "alert-circle" : "shield-checkmark"} 
              size={20} 
              color={isActuallyBreached ? "#EF4444" : "#10B981"} 
            />
          </View>
          <View>
            <Text style={[styles.title, isActuallyBreached ? styles.breachedText : styles.onTrackText]}>
              {isActuallyBreached ? 'SLA BREACHED' : 'SLA ON TRACK'}
            </Text>
            <Text style={styles.subtitle}>
              {isActuallyBreached ? 'Target Missed' : 'On Schedule'}
            </Text>
          </View>
        </View>
        
        <View style={styles.statsRow}>
          {isActuallyBreached && (
            <View style={styles.statPill}>
              <Text style={styles.statValueRed}>{formatDuration(breachMs)}</Text>
              <Text style={styles.statLabel}>Delayed</Text>
            </View>
          )}
          {totalPausedMins > 0 && (
            <View style={styles.statPill}>
              <Text style={styles.statValueAmber}>{formatDuration(totalPausedMins * 60000)}</Text>
              <Text style={styles.statLabel}>Paused</Text>
            </View>
          )}
        </View>
      </View>

      {/* Vertical Timeline */}
      <View style={styles.timeline}>
        {/* Vertical Border Line */}
        <View style={styles.connector} />

        <TimelineNode 
          label="Created" 
          time={new Date(createdAt).toLocaleString()} 
          color="#94A3B8" 
        />
        
        {assignedAt && (
          <TimelineNode 
            label="Timer Started" 
            subLabel="Assigned" 
            time={new Date(assignedAt).toLocaleString()} 
            color="#3B82F6" 
          />
        )}

        {totalPausedMins > 0 && (
          <TimelineNode 
            label="SLA Paused" 
            time={`+${formatDuration(totalPausedMins * 60000)} added`} 
            color="#F59E0B" 
          />
        )}

        <TimelineNode 
          label="Deadline" 
          time={deadlineDate.toLocaleString()} 
          color={isActuallyBreached ? "#EF4444" : "#10B981"} 
          isBold
        />

        {resolvedAt && (
          <TimelineNode 
            label="Resolved" 
            time={new Date(resolvedAt).toLocaleString()} 
            color="#10B981" 
          />
        )}
      </View>
    </View>
  );
}

function TimelineNode({ label, subLabel, time, color, isBold }: { label: string; subLabel?: string; time: string; color: string; isBold?: boolean }) {
  return (
    <View style={styles.node}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.nodeContent}>
        <View>
          <Text style={[styles.nodeLabel, isBold && { fontWeight: '900', color }]}>
            {label} {subLabel && <Text style={styles.nodeSubLabel}>— {subLabel}</Text>}
          </Text>
        </View>
        <Text style={styles.nodeTime}>{time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 20, padding: 16, borderWidth: 1 },
  onTrackBg: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  breachedBg: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  titleCol: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  onTrackIcon: { backgroundColor: '#DCFCE7' },
  breachedIcon: { backgroundColor: '#FEE2E2' },
  title: { fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  onTrackText: { color: '#166534' },
  breachedText: { color: '#991B1B' },
  subtitle: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statPill: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  statValueRed: { fontSize: 14, fontWeight: '900', color: '#EF4444' },
  statValueAmber: { fontSize: 14, fontWeight: '900', color: '#F59E0B' },
  statLabel: { fontSize: 8, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' },
  timeline: { paddingLeft: 8, position: 'relative' },
  connector: { position: 'absolute', left: 14, top: 4, bottom: 4, width: 2, backgroundColor: '#E2E8F0' },
  node: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, zIndex: 10, borderWidth: 2, borderColor: '#FFF' },
  nodeContent: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nodeLabel: { fontSize: 12, color: '#475569', fontWeight: '700' },
  nodeSubLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '500' },
  nodeTime: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
});
