/**
 * TranscriptViewer — Reusable transcript component with inline correction
 *
 * Features:
 *   - Renders enriched transcript segments with speaker colors + timestamps
 *   - Tap any segment → inline edit mode
 *   - Save → correctTranscript() → writeMemory()
 *   - Falls back to local AsyncStorage when backend memory write unavailable
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnrichedTranscriptSegment } from '@/types/cassandra-room';
import { correctTranscript, stageLocalCorrection } from '@/services/cassandra/cassandraRoomService';
import { Colors, Typography, Spacing, Radius } from '@/constants/cassandra-theme';
import { toast } from '@/lib/toast';

// ─── Speaker color helper ───────────────────────────────────────────────────

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

// ─── Segment Edit State ─────────────────────────────────────────────────────

interface EditState {
  segmentId: string;
  value: string;
  loading: boolean;
}

// ─── Props ─────────────────────────────────────────────────────────────────

interface TranscriptViewerProps {
  segments: EnrichedTranscriptSegment[];
  orgId: string;
  roomId: string;
  onSegmentCorrected?: (segmentId: string, correctedText: string) => void;
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function TranscriptViewer({
  segments,
  orgId,
  roomId,
  onSegmentCorrected,
}: TranscriptViewerProps) {
  const [editing, setEditing] = useState<EditState | null>(null);

  const handleSegmentPress = useCallback((segment: EnrichedTranscriptSegment) => {
    if (editing?.segmentId === segment.id) return;
    setEditing({
      segmentId: segment.id,
      value: segment.corrected_text ?? segment.text,
      loading: false,
    });
  }, [editing]);

  const handleCancel = useCallback(() => {
    setEditing(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    const { segmentId, value } = editing;
    if (!value.trim()) {
      toast.error('Correction cannot be empty.');
      return;
    }

    setEditing((prev) => prev ? { ...prev, loading: true } : null);

    try {
      await correctTranscript(roomId, segmentId, value.trim(), orgId);
      onSegmentCorrected?.(segmentId, value.trim());
      toast.success('Correction saved');
    } catch {
      // Stage locally so the user isn't blocked
      try {
        await stageLocalCorrection(orgId, segmentId, value.trim());
        onSegmentCorrected?.(segmentId, value.trim());
        toast.info('Saved locally — will sync when online.');
      } catch {
        toast.error('Failed to save correction.');
      }
    } finally {
      setEditing(null);
    }
  }, [editing, roomId, orgId, onSegmentCorrected]);

  const handleChangeText = useCallback((text: string) => {
    setEditing((prev) => prev ? { ...prev, value: text } : null);
  }, []);

  if (segments.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No transcript available.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {segments.map((segment, index) => {
        const isEditing = editing?.segmentId === segment.id;
        const color = speakerColor(segment.speaker_id);

        // Timestamp
        const totalSec = Math.floor(segment.start_ms / 1000);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

        return (
          <View key={segment.id}>
            {/* Editing view */}
            {isEditing ? (
              <View style={styles.editContainer}>
                <View style={styles.editMeta}>
                  <View style={[styles.speakerPill, { backgroundColor: color + '20', borderColor: color + '40' }]}>
                    <Text style={[styles.speakerPillText, { color }]}>
                      {segment.speaker_name ?? 'Speaker'}
                    </Text>
                  </View>
                  <Text style={styles.timeStamp}>{timeStr}</Text>
                </View>
                {segment.text && (
                  <Text style={styles.originalLabel}>Original</Text>
                )}
                {segment.text && (
                  <Text style={styles.originalText}>{segment.text}</Text>
                )}
                <TextInput
                  style={styles.editInput}
                  value={editing.value}
                  onChangeText={handleChangeText}
                  multiline
                  autoFocus
                  placeholder="Enter corrected text…"
                  placeholderTextColor={Colors.textMuted}
                />
                <View style={styles.editActions}>
                  <TouchableOpacity
                    onPress={handleCancel}
                    style={styles.cancelBtn}
                    activeOpacity={0.7}
                    disabled={editing.loading}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSave}
                    style={[styles.saveBtn, editing.loading && styles.saveBtnDisabled]}
                    activeOpacity={0.8}
                    disabled={editing.loading}
                  >
                    <Text style={styles.saveBtnText}>
                      {editing.loading ? 'Saving…' : 'Save correction'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* Read view */
              <TouchableOpacity
                onPress={() => handleSegmentPress(segment)}
                activeOpacity={0.7}
                style={[styles.segment, index % 2 === 0 && styles.segmentAlt]}
              >
                <View style={styles.segmentMeta}>
                  <View style={[styles.speakerPill, { backgroundColor: color + '20', borderColor: color + '40' }]}>
                    <Text style={[styles.speakerPillText, { color }]}>
                      {segment.speaker_name ?? 'Speaker'}
                    </Text>
                  </View>
                  <Text style={styles.timeStamp}>{timeStr}</Text>
                  {segment.is_corrected && (
                    <View style={styles.correctedBadge}>
                      <Text style={styles.correctedBadgeText}>corrected</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.segmentText, segment.is_corrected && styles.correctedText]}>
                  {segment.corrected_text ?? segment.text}
                </Text>
                {segment.is_corrected && segment.text && (
                  <Text style={styles.originalTextInline}>was: {segment.text}</Text>
                )}
                <Text style={styles.tapHint}>Tap to correct</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { padding: Spacing.xl, alignItems: 'center' },
  emptyText: { ...Typography.body, color: Colors.textMuted },

  segment: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderGlass },
  segmentAlt: { backgroundColor: 'rgba(255,255,255,0.02)' },

  segmentMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 6 },
  speakerPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  speakerPillText: { ...Typography.caption, fontWeight: '600', fontSize: 10 },
  timeStamp: { ...Typography.caption, color: Colors.textMuted, marginLeft: 'auto' },

  correctedBadge: {
    backgroundColor: Colors.success + '20',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  correctedBadgeText: { ...Typography.caption, color: Colors.success, fontSize: 9, fontWeight: '600' },

  segmentText: { ...Typography.body, color: Colors.textSecondary, lineHeight: 22 },
  correctedText: { color: Colors.success + 'cc' },
  originalTextInline: { ...Typography.caption, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4 },
  tapHint: { ...Typography.caption, color: Colors.textMuted, marginTop: 6, textAlign: 'right', opacity: 0.5, fontSize: 10 },

  // Edit mode
  editContainer: {
    padding: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.violet + '40',
    borderRadius: Radius.lg,
    marginVertical: Spacing.sm,
  },
  editMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  originalLabel: { ...Typography.caption, color: Colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  originalText: { ...Typography.body, color: Colors.textMuted, fontStyle: 'italic', marginBottom: Spacing.md, lineHeight: 20 },
  editInput: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
  },
  editActions: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end' },
  cancelBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.borderGlass },
  cancelBtnText: { ...Typography.bodySmall, color: Colors.textSecondary },
  saveBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.lg, backgroundColor: Colors.violet },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { ...Typography.bodySmall, color: Colors.textPrimary, fontWeight: '600' },
});
