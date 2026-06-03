/**
 * Room Detail Screen — /cassandra/rooms/[roomId]
 *
 * Conditional rendering based on room status:
 *   - live (waiting/active): participant avatars + end button
 *   - ended + analysis: transcript + action items + speaker map + summary
 *   - ended without analysis: placeholder while analysis generates
 */

import React, { useCallback, useEffect, useState, Component, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';
import { getRoomFull, endRoom } from '@/services/cassandra/cassandraRoomService';
import {
  CassandraRoomFull,
  ActionItem,
  Participant,
  EnrichedTranscriptSegment,
  SpeakerMapEntry,
} from '@/types/cassandra-room';
import { Colors, Gradients, Typography, Spacing, Radius } from '@/constants/cassandra-theme';
import { toast } from '@/lib/toast';
import RoomDetailSkeleton from '@/components/cassandra/RoomDetailSkeleton';

// ─── Speaker Color ─────────────────────────────────────────────────────────

const SPEAKER_COLORS = [
  '#8B5CF6', '#22D3EE', '#F59E0B', '#10B981',
  '#EC4899', '#6366F1', '#F97316', '#14B8A6',
];

function speakerColor(speakerId: string): string {
  let hash = 0;
  for (let i = 0; i < speakerId.length; i++) {
    hash = speakerId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SPEAKER_COLORS[Math.abs(hash) % SPEAKER_COLORS.length];
}

// ─── Live Session Card ─────────────────────────────────────────────────────

const LiveSessionCard = ({
  participants,
  sessionId,
  onEnd,
}: {
  participants: Participant[];
  sessionId?: string;
  onEnd: () => void;
}) => (
  <View style={styles.liveCard}>
    <View style={styles.liveHeader}>
      <View style={styles.liveDot} />
      <Text style={styles.liveLabel}>Live Session</Text>
    </View>
    {sessionId && (
      <Text style={styles.sessionId}>Session ID: {sessionId.slice(0, 12)}…</Text>
    )}
    <View style={styles.participantRow}>
      {participants.map((p) => (
        <View key={p.id} style={styles.participantAvatar}>
          <Text style={styles.participantInitial}>
            {p.name.charAt(0).toUpperCase()}
          </Text>
        </View>
      ))}
      {participants.length === 0 && (
        <Text style={styles.waitingText}>Waiting for participants…</Text>
      )}
    </View>
    <TouchableOpacity style={styles.endBtn} onPress={onEnd} activeOpacity={0.8}>
      <Text style={styles.endBtnText}>End Session</Text>
    </TouchableOpacity>
  </View>
);

// ─── Speaker Map ────────────────────────────────────────────────────────────

const SpeakerMapCard = ({ map }: { map: SpeakerMapEntry[] }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>Speakers</Text>
    <View style={styles.speakerList}>
      {map.map((entry) => (
        <View key={entry.speaker_id} style={styles.speakerRow}>
          <View style={[styles.speakerDot, { backgroundColor: entry.color }]} />
          <Text style={styles.speakerName}>{entry.speaker_name}</Text>
          {entry.total_duration_ms && (
            <Text style={styles.speakerDuration}>
              {Math.round(entry.total_duration_ms / 60000)}m
            </Text>
          )}
        </View>
      ))}
    </View>
  </View>
);

// ─── Transcript Segment ─────────────────────────────────────────────────────

const TranscriptSegment = ({ segment, index }: { segment: EnrichedTranscriptSegment; index: number }) => {
  const startSec = Math.floor(segment.start_ms / 1000);
  const mins = Math.floor(startSec / 60);
  const secs = startSec % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  const color = speakerColor(segment.speaker_id);

  return (
    <View style={[styles.segment, index % 2 === 0 && styles.segmentAlt]}>
      <View style={styles.segmentMeta}>
        <View style={[styles.speakerPill, { backgroundColor: color + '20', borderColor: color + '40' }]}>
          <Text style={[styles.speakerPillText, { color }]}>
            {segment.speaker_name ?? 'Speaker'}
          </Text>
        </View>
        <Text style={styles.timeStamp}>{timeStr}</Text>
      </View>
      <Text style={[styles.segmentText, segment.is_corrected && styles.segmentCorrected]}>
        {segment.is_corrected ? segment.corrected_text : segment.text}
      </Text>
      {segment.is_corrected && segment.text && (
        <Text style={styles.originalText}>Original: {segment.text}</Text>
      )}
    </View>
  );
};

// ─── Action Item ────────────────────────────────────────────────────────────

const statusConfig: Record<string, { color: string; bg: string }> = {
  open: { color: Colors.warning, bg: 'rgba(245,158,11,0.12)' },
  in_progress: { color: Colors.cyan, bg: 'rgba(34,211,238,0.12)' },
  resolved: { color: Colors.success, bg: 'rgba(16,185,129,0.12)' },
  dismissed: { color: Colors.textMuted, bg: 'rgba(255,255,255,0.06)' },
};

const ActionItemRow = ({ item, onToggle }: { item: ActionItem; onToggle: () => void }) => {
  const cfg = statusConfig[item.status] ?? statusConfig.open;
  return (
    <View style={styles.actionItem}>
      <TouchableOpacity onPress={onToggle} style={styles.actionToggle} activeOpacity={0.7}>
        <View style={[styles.checkbox, item.status === 'resolved' && { backgroundColor: Colors.success, borderColor: Colors.success }]}>
          {item.status === 'resolved' && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </TouchableOpacity>
      <View style={styles.actionContent}>
        <Text style={[styles.actionDesc, item.status === 'resolved' && styles.actionResolved]}>
          {item.description}
        </Text>
        <View style={styles.actionMeta}>
          {item.assignee_name && (
            <Text style={styles.actionMetaText}>→ {item.assignee_name}</Text>
          )}
          {item.due_date && (
            <Text style={styles.actionMetaText}>Due {new Date(item.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
          )}
        </View>
        <View style={[styles.actionBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.actionBadgeText, { color: cfg.color }]}>{item.status.replace('_', ' ')}</Text>
        </View>
      </View>
    </View>
  );
};

// ─── No Analysis Placeholder ────────────────────────────────────────────────

const NoAnalysisCard = () => (
  <View style={styles.noAnalysis}>
    <ActivityIndicator size="small" color={Colors.violet} />
    <Text style={styles.noAnalysisText}>
      Analysis is being generated. This usually takes a few minutes after the session ends.
    </Text>
  </View>
);

// ─── Summary Card ───────────────────────────────────────────────────────────

const SummaryCard = ({ text, score }: { text: string; score?: number }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>Summary</Text>
      {score !== undefined && (
        <View style={styles.scoreChip}>
          <Text style={styles.scoreChipText}>{score}%</Text>
        </View>
      )}
    </View>
    <Text style={styles.summaryText}>{text}</Text>
  </View>
);

// ─── Main Screen ────────────────────────────────────────────────────────────

// ─── Error Boundary ─────────────────────────────────────────────────────────

class RoomDetailErrorBoundary extends Component<
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
        <View style={[styles.container, styles.center]}>
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

function RoomDetailContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { roomId, propertyId, orgId } = useLocalSearchParams<{
    roomId: string;
    propertyId: string;
    orgId: string;
  }>();

  const [room, setRoom] = useState<CassandraRoomFull | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const fetchRoom = useCallback(async (refresh: boolean = false) => {
    if (!roomId) return;
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const data = await getRoomFull(roomId);
      setRoom(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load session.';
      toast.error(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [roomId]);

  const { refetch } = useDashboardFetch(queryKeys.cassandra.cassandraRoom(roomId), fetchRoom, {
    staleTime: 1000 * 60 * 5,
  });

  const handleEndSession = async () => {
    if (!propertyId || !roomId) return;
    setIsEnding(true);
    try {
      const { room: updated } = await endRoom(propertyId, roomId);
      setRoom(updated);
      toast.success('Session ended');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to end session.';
      toast.error(msg);
    } finally {
      setIsEnding(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const isLive = room?.status === 'active' || room?.status === 'waiting';
  const isEnded = room?.status === 'ended';
  const hasAnalysis = isEnded && room?.analysis;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={Gradients.radialBg} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        <RoomDetailSkeleton />
      </View>
    );
  }

  if (!room) {
    return (
      <View style={[styles.container, styles.loadingCenter, { paddingTop: insets.top }]}>
        <LinearGradient colors={Gradients.radialBg} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        <Text style={styles.errorText}>Session not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={Gradients.radialBg} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />

      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: room.name,
          headerTransparent: true,
          headerTintColor: Colors.textPrimary,
          headerStyle: { backgroundColor: 'transparent' },
          headerBackTitle: 'Sessions',
        }}
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.violet}
            colors={[Colors.violet]}
          />
        }
      >
        {/* Room meta */}
        <View style={styles.roomMeta}>
          <Text style={styles.roomProperty}>{room.property_name ?? 'Property'}</Text>
          <Text style={styles.roomDate}>
            {new Date(room.created_at).toLocaleDateString('en-IN', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </Text>
        </View>

        {/* Live session */}
        {isLive && (
          <LiveSessionCard
            participants={room.participants ?? []}
            sessionId={room.session_id}
            onEnd={handleEndSession}
          />
        )}

        {/* Ended with analysis */}
        {hasAnalysis && (
          <>
            {/* Speaker map */}
            {room.analysis!.speaker_map && room.analysis!.speaker_map.length > 0 && (
              <SpeakerMapCard map={room.analysis!.speaker_map} />
            )}

            {/* Summary */}
            {room.analysis!.summary && (
              <SummaryCard text={room.analysis!.summary} score={room.analysis!.quality_score} />
            )}

            {/* Action items */}
            {room.analysis!.action_items && room.analysis!.action_items.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Action Items</Text>
                {room.analysis!.action_items.map((item) => (
                  <ActionItemRow
                    key={item.id}
                    item={item}
                    onToggle={() => {
                      // TODO: wire to updateActionItem()
                      toast.info('Toggle coming soon');
                    }}
                  />
                ))}
              </View>
            )}

            {/* Transcript */}
            {room.analysis!.transcript && room.analysis!.transcript.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Transcript</Text>
                {room.analysis!.transcript.map((seg, i) => (
                  <TranscriptSegment key={seg.id} segment={seg} index={i} />
                ))}
              </View>
            )}
          </>
        )}

        {/* Ended but no analysis yet */}
        {isEnded && !hasAnalysis && <NoAnalysisCard />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgDeep },
  flex: { flex: 1 },
  loadingCenter: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },

  errorText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.md },
  backBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.violet, borderRadius: Radius.lg },
  backBtnText: { ...Typography.body, color: Colors.textPrimary, fontWeight: '600' },

  roomMeta: { marginBottom: Spacing.lg },
  roomProperty: { ...Typography.caption, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  roomDate: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },

  // Live
  liveCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.cyan + '30',
    marginBottom: Spacing.lg,
  },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.cyan },
  liveLabel: { ...Typography.h3, color: Colors.cyan },
  sessionId: { ...Typography.caption, color: Colors.textMuted, marginBottom: Spacing.md },
  participantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.lg },
  participantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantInitial: { ...Typography.h3, color: Colors.textPrimary },
  waitingText: { ...Typography.body, color: Colors.textMuted },
  endBtn: {
    backgroundColor: Colors.error,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  endBtnText: { ...Typography.body, color: Colors.textPrimary, fontWeight: '600' },

  // Sections
  section: { marginBottom: Spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  sectionTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.md },
  scoreChip: {
    backgroundColor: Colors.violet + '20',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.violet + '40',
  },
  scoreChipText: { ...Typography.caption, color: Colors.violetLight, fontWeight: '700' },

  // Speaker map
  speakerList: { gap: Spacing.sm },
  speakerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  speakerDot: { width: 10, height: 10, borderRadius: 5 },
  speakerName: { ...Typography.body, color: Colors.textSecondary, flex: 1 },
  speakerDuration: { ...Typography.caption, color: Colors.textMuted },

  // Summary
  summaryText: { ...Typography.body, color: Colors.textSecondary, lineHeight: 24 },

  // Action items
  actionItem: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGlass,
  },
  actionToggle: { paddingTop: 2 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.borderGlassStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: Colors.textPrimary, fontSize: 11, fontWeight: '700' },
  actionContent: { flex: 1, gap: 4 },
  actionDesc: { ...Typography.body, color: Colors.textPrimary, lineHeight: 22 },
  actionResolved: { textDecorationLine: 'line-through', color: Colors.textMuted },
  actionMeta: { flexDirection: 'row', gap: Spacing.md },
  actionMetaText: { ...Typography.caption, color: Colors.textMuted },
  actionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    marginTop: 2,
  },
  actionBadgeText: { ...Typography.caption, fontWeight: '600', fontSize: 10, textTransform: 'capitalize' },

  // Transcript
  segment: { paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderGlass },
  segmentAlt: { backgroundColor: 'rgba(255,255,255,0.02)' },
  segmentMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  speakerPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  speakerPillText: { ...Typography.caption, fontWeight: '600', fontSize: 10 },
  timeStamp: { ...Typography.caption, color: Colors.textMuted },
  segmentText: { ...Typography.body, color: Colors.textSecondary, lineHeight: 22 },
  segmentCorrected: { color: Colors.success + 'cc' },
  originalText: { ...Typography.caption, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },

  // No analysis
  noAnalysis: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  noAnalysisText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  center: { alignItems: 'center', justifyContent: 'center' },
  errorTitle: { ...Typography.h3, color: Colors.error, marginBottom: Spacing.sm },
  errorMsg: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.lg },
  retryBtn: { backgroundColor: Colors.violet, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.lg },
  retryBtnText: { ...Typography.body, color: Colors.textPrimary, fontWeight: '600' },
});

export default function RoomDetailScreen() {
  return (
    <RoomDetailErrorBoundary>
      <RoomDetailContent />
    </RoomDetailErrorBoundary>
  );
}
