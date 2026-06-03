import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TicketSLATileProps {
  openTickets: number;
  slaPercentage: number;
  highPriorityCount: number;
  style?: ViewStyle;
}

export default function TicketSLATile({
  openTickets,
  slaPercentage,
  highPriorityCount,
  style,
}: TicketSLATileProps) {
  const getSLAColor = () => {
    if (slaPercentage >= 90) return '#06B6D4';
    if (slaPercentage >= 75) return '#10B981';
    if (slaPercentage >= 60) return '#F59E0B';
    return '#EF4444';
  };

  const slaColor = getSLAColor();

  return (
    <View style={[styles.card, style]}>
      <Text style={styles.title}>Tickets & SLA</Text>

      {/* Open Tickets */}
      <View style={styles.row}>
        <View>
          <Text style={[styles.bigValue, { color: '#708F96' }]}>{openTickets}</Text>
          <Text style={styles.metric}>Open Tickets</Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(openTickets * 10, 100)}%` as any, backgroundColor: '#F1F5F9' },
            ]}
          />
        </View>
      </View>

      {/* SLA */}
      <View style={[styles.row, { marginTop: 20 }]}>
        <View>
          <Text style={[styles.bigValue, { color: slaColor }]}>{slaPercentage}%</Text>
          <Text style={styles.metric}>SLA Met</Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${slaPercentage}%` as any, backgroundColor: slaColor },
            ]}
          />
        </View>
      </View>

      {/* High Priority */}
      {highPriorityCount > 0 && (
        <View style={styles.alertRow}>
          <View style={styles.alertIcon}>
            <Ionicons name="warning-outline" size={16} color="#F59E0B" />
          </View>
          <Text style={styles.alertText}>
            {highPriorityCount} High Priority {highPriorityCount === 1 ? 'Ticket' : 'Tickets'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderLeftWidth: 4,
    borderLeftColor: '#708F96',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A2332',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bigValue: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  metric: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  progressTrack: {
    width: 80,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  alertIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(245,158,11,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
});
