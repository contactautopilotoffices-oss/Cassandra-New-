import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface EscalationLog {
  id: string;
  from_level: number;
  to_level: number | null;
  reason: string;
  escalated_at: string;
  from_employee?: { full_name: string } | null;
  to_employee?: { full_name: string } | null;
}

interface EscalationTimelineProps {
  logs: EscalationLog[];
}

export default function EscalationTimeline({ logs }: EscalationTimelineProps) {
  if (!logs || logs.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Red Pulse background effect (simplified for native) */}
      <View style={styles.header}>
        <View style={styles.iconBox}>
          <Ionicons name="alert-circle" size={22} color="#EF4444" />
        </View>
        <View>
          <Text style={styles.title}>ESCALATION TIMELINE</Text>
          <Text style={styles.subtitle}>{logs.length} Level Transfers</Text>
        </View>
      </View>

      <View style={styles.list}>
        {logs.map((log, idx) => {
          const fromInitials = log.from_employee?.full_name
            ?.split(' ')
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() || '?';
            
          const toInitials = log.to_employee?.full_name
            ?.split(' ')
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() || '?';

          return (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.logHeader}>
                <View style={styles.levelRow}>
                  <View style={styles.levelPill}>
                    <Text style={styles.levelText}>L{log.from_level}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={14} color="#991B1B" />
                  <View style={[styles.levelPill, styles.levelPillActive]}>
                    <Text style={styles.levelTextActive}>L{log.to_level ?? '∞'}</Text>
                  </View>
                  <View style={styles.reasonPill}>
                    <Text style={styles.reasonText}>{log.reason?.replace(/_/g, ' ') || 'Timeout'}</Text>
                  </View>
                </View>
                <Text style={styles.logTime}>
                  {new Date(log.escalated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>

              <View style={styles.employeeRow}>
                <View style={styles.employee}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{fromInitials}</Text>
                  </View>
                  <View>
                    <Text style={styles.empTag}>FROM</Text>
                    <Text style={styles.empName}>{log.from_employee?.full_name || 'Unassigned'}</Text>
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={16} color="#FECACA" />

                <View style={styles.employee}>
                  <View style={[styles.avatar, styles.avatarActive]}>
                    <Text style={[styles.avatarText, styles.avatarTextActive]}>{toInitials}</Text>
                  </View>
                  <View>
                    <Text style={styles.empTag}>TO</Text>
                    <Text style={styles.empNameHighlight}>{log.to_employee?.full_name || 'Unassigned'}</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#FEF2F2', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#FECACA', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  title: { fontSize: 13, fontWeight: '900', color: '#991B1B', letterSpacing: 1 },
  subtitle: { fontSize: 10, fontWeight: '700', color: '#EF4444', textTransform: 'uppercase' },
  list: { gap: 12 },
  logCard: { backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.1)' },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  levelPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  levelPillActive: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  levelText: { fontSize: 10, fontWeight: '900', color: '#64748B' },
  levelTextActive: { fontSize: 10, fontWeight: '900', color: '#FFF' },
  reasonPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: '#FEF3C7' },
  reasonText: { fontSize: 9, fontWeight: '800', color: '#B45309', textTransform: 'uppercase' },
  logTime: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  employeeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  employee: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  avatarActive: { backgroundColor: '#FEE2E2' },
  avatarText: { fontSize: 9, fontWeight: '900', color: '#64748B' },
  avatarTextActive: { color: '#EF4444' },
  empTag: { fontSize: 7, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },
  empName: { fontSize: 11, fontWeight: '600', color: '#475569' },
  empNameHighlight: { fontSize: 11, fontWeight: '800', color: '#475569' },
});
