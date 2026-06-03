import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ticket } from '@/types';
import { EmptyState } from '@/components/ui';
import { RefreshControl } from 'react-native';
import { useTheme } from '@/context';

interface TicketListProps {
  tickets: Ticket[];
  loading: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

function SkeletonCard() {
  const { isDark } = useTheme();
  return (
    <View style={[skeletonStyles.card, { backgroundColor: isDark ? '#1E2535' : '#FFFFFF', borderColor: isDark ? '#2D3748' : '#E2E8F0' }]}>
      <View style={[skeletonStyles.line, { backgroundColor: isDark ? '#2D3748' : '#F1F5F9', width: '70%' }]} />
      <View style={[skeletonStyles.badgeRow]}>
        <View style={[skeletonStyles.badge, { backgroundColor: isDark ? '#2D3748' : '#F1F5F9' }]} />
        <View style={[skeletonStyles.badge, { backgroundColor: isDark ? '#2D3748' : '#F1F5F9' }]} />
      </View>
      <View style={[skeletonStyles.line, { backgroundColor: isDark ? '#2D3748' : '#F1F5F9', width: '40%' }]} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, marginBottom: 12 },
  line: { height: 16, borderRadius: 4 },
  badgeRow: { flexDirection: 'row', gap: 8 },
  badge: { height: 20, width: 60, borderRadius: 999 },
});

export default function TicketList({
  tickets,
  loading,
  refreshing = false,
  onRefresh,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
}: TicketListProps) {
  const { colors } = useTheme();

  if (loading && tickets.length === 0) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (tickets.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          title={emptyTitle || 'No tickets'}
          description={emptyDescription}
          actionLabel={emptyActionLabel}
          onEmptyAction={onEmptyAction}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {tickets.map(ticket => (
        <View key={ticket.id} style={styles.ticketItem}>
          <Text style={styles.ticketTitle}>{ticket.title}</Text>
          <Text style={styles.ticketStatus}>{ticket.status}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  skeletonWrap: {
    marginTop: 16,
  },
  ticketItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  ticketTitle: {
    fontSize: 14,
      },
  ticketStatus: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
});
