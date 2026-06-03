/**
 * Room List Screen — /cassandra/rooms
 *
 * Shows all Cassandra AI session rooms for a property.
 * Tap a room card → navigates to room detail.
 */

import React, { useCallback, useEffect, useState, Component, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';
import { listRooms } from '@/services/cassandra/cassandraRoomService';
import { CassandraRoomListItem } from '@/types/cassandra-room';
import { Colors, Gradients, Typography, Spacing, Radius } from '@/constants/cassandra-theme';
import { toast } from '@/lib/toast';
import RoomListSkeleton from '@/components/cassandra/RoomListSkeleton';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Status Badge ──────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: CassandraRoomListItem['status'] }) => {
  const config = {
    waiting: { color: Colors.warning, label: 'Waiting' },
    active: { color: Colors.cyan, label: 'Live' },
    ended: { color: Colors.textMuted, label: 'Ended' },
  }[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.color + '20', borderColor: config.color + '50' }]}>
      <View style={[styles.badgeDot, { backgroundColor: config.color }]} />
      <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

// ─── Quality Score ──────────────────────────────────────────────────────────

const QualityScore = ({ score }: { score?: number }) => {
  if (!score) return null;
  const color = score >= 80 ? Colors.success : score >= 60 ? Colors.warning : Colors.error;
  return (
    <View style={styles.qualityRow}>
      <View style={styles.qualityBar}>
        <View style={[styles.qualityFill, { width: `${score}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.qualityText, { color }]}>{score}</Text>
    </View>
  );
};

// ─── Room Card ───────────────────────────────────────────────────────────────

const RoomCard = ({ room, onPress }: { room: CassandraRoomListItem; onPress: () => void }) => {
  const date = new Date(room.created_at);
  const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardName} numberOfLines={1}>{room.name}</Text>
          <StatusBadge status={room.status} />
        </View>
        {room.property_name && (
          <Text style={styles.cardProperty}>{room.property_name}</Text>
        )}
      </View>

      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Date</Text>
          <Text style={styles.metaValue}>{dateStr}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Time</Text>
          <Text style={styles.metaValue}>{timeStr}</Text>
        </View>
        {room.participant_count !== undefined && (
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Participants</Text>
            <Text style={styles.metaValue}>{room.participant_count}</Text>
          </View>
        )}
        {room.action_item_count !== undefined && room.action_item_count > 0 && (
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Actions</Text>
            <Text style={[styles.metaValue, { color: Colors.violetLight }]}>{room.action_item_count}</Text>
          </View>
        )}
      </View>

      {room.quality_score !== undefined && (
        <View style={styles.cardFooter}>
          <QualityScore score={room.quality_score} />
          <Text style={styles.viewDetail}>View details →</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ─── Empty State ────────────────────────────────────────────────────────────

const EmptyState = ({ onCreate }: { onCreate: () => void }) => (
  <View style={styles.emptyState}>
    <View style={styles.emptyIcon}>
      <Text style={styles.emptyIconText}>🎙</Text>
    </View>
    <Text style={styles.emptyTitle}>No sessions yet</Text>
    <Text style={styles.emptySubtitle}>
      Start a Cassandra session to capture property walkthroughs, maintenance reviews, or team standups.
    </Text>
    <TouchableOpacity style={styles.emptyBtn} onPress={onCreate} activeOpacity={0.8}>
      <Text style={styles.emptyBtnText}>Start a session</Text>
    </TouchableOpacity>
  </View>
);

// ─── Error Boundary ─────────────────────────────────────────────────────────

class RoomsErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMsg}>{this.state.error?.message}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => this.setState({ hasError: false })}
            activeOpacity={0.8}
          >
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Main List Screen ────────────────────────────────────────────────────────

function RoomsListContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const { membership } = useAuth();

  const orgId = membership?.org_id ?? '';
  const [rooms, setRooms] = useState<CassandraRoomListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchRooms = useCallback(async (pageNum: number = 1, refresh: boolean = false) => {
    if (!propertyId) return;
    if (refresh) setIsRefreshing(true);
    else if (pageNum === 1) setIsLoading(true);
    else setIsLoadingMore(true);

    try {
      const res = await listRooms(propertyId, { page: pageNum, page_size: 20 });
      if (refresh || pageNum === 1) {
        setRooms(res.rooms);
      } else {
        setRooms((prev) => [...prev, ...res.rooms]);
      }
      setHasMore(res.rooms.length === res.page_size);
      setPage(pageNum);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load sessions.';
      toast.error(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  }, [propertyId]);

  const { refetch } = useDashboardFetch(queryKeys.cassandra.cassandraRooms(propertyId), () => fetchRooms(1), {
    staleTime: 1000 * 60 * 5,
  });

  const handleRefresh = () => refetch();

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      fetchRooms(page + 1);
    }
  };

  const handleRoomPress = (roomId: string) => {
    router.push(`/cassandra/rooms/${roomId}?propertyId=${propertyId}&orgId=${orgId}`);
  };

  const handleCreate = () => {
    // TODO: wire to createRoom() + open session modal
    toast.info('Create session coming soon');
  };

  const renderItem = ({ item }: { item: CassandraRoomListItem }) => (
    <RoomCard room={item} onPress={() => handleRoomPress(item.id)} />
  );

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={Colors.violet} />
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={Gradients.radialBg} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />

      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Sessions',
          headerTransparent: true,
          headerTintColor: Colors.textPrimary,
          headerStyle: { backgroundColor: 'transparent' },
          headerBackTitle: 'Back',
        }}
      />

      {isLoading ? (
        <RoomListSkeleton />
      ) : rooms.length === 0 ? (
        <EmptyState onCreate={handleCreate} />
      ) : (
        <FlatList
          data={rooms}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.violet}
              colors={[Colors.violet]}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={renderFooter}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgDeep,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xxl },
  errorTitle: { ...Typography.h3, color: Colors.error, marginBottom: Spacing.sm },
  errorMsg: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.lg },
  retryBtn: { backgroundColor: Colors.violet, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.lg },
  retryBtnText: { ...Typography.body, color: Colors.textPrimary, fontWeight: '600' },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textMuted,
  },
  loadingMore: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  cardTop: {
    marginBottom: Spacing.md,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardName: {
    ...Typography.h3,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  cardProperty: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  badgeText: {
    ...Typography.caption,
    fontWeight: '600',
    fontSize: 10,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
  },
  metaItem: {
    gap: 2,
  },
  metaLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  qualityBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  qualityFill: {
    height: '100%',
    borderRadius: 2,
  },
  qualityText: {
    ...Typography.caption,
    fontWeight: '700',
    fontSize: 11,
  },
  viewDetail: {
    ...Typography.caption,
    color: Colors.violetLight,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyIconText: {
    fontSize: 32,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  emptyBtn: {
    backgroundColor: Colors.violet,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  emptyBtnText: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
});

export default function RoomsListScreen() {
  return (
    <RoomsErrorBoundary>
      <RoomsListContent />
    </RoomsErrorBoundary>
  );
}
