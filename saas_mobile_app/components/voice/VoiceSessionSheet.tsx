'use client';
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useVoiceAgentStore } from '@/store/voiceAgentStore';

interface VoiceSessionSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function VoiceSessionSheet({ visible, onClose }: VoiceSessionSheetProps) {
  const {
    transcript,
    aiResponse,
    isListening,
    isProcessing,
    isSpeaking,
    sessionActive,
    error,
    conversationHistory,
  } = useVoiceAgentStore();

  if (!visible) return null;

  const getStateLabel = () => {
    if (!sessionActive) return 'Connecting...';
    if (isProcessing) return 'Processing...';
    if (isSpeaking) return 'Speaking...';
    if (isListening) return 'Listening...';
    return 'Ready — tap orb to speak';
  };

  const getStateColor = () => {
    if (!sessionActive) return '#F59E0B';
    if (isProcessing) return '#F59E0B';
    if (isSpeaking) return '#10B981';
    if (isListening) return '#3B82F6';
    return '#94A3B8';
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <View style={[styles.stateDot, { backgroundColor: getStateColor() }]} />
        <Text style={styles.stateLabel}>{getStateLabel()}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>×</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {transcript && (
          <View style={styles.bubbleRow}>
            <View style={styles.userBubble}>
              <Text style={styles.userBubbleText}>{transcript}</Text>
            </View>
          </View>
        )}

        {aiResponse && (
          <View style={styles.bubbleRowAI}>
            <View style={styles.aiBubble}>
              <Text style={styles.aiBubbleText}>{aiResponse}</Text>
            </View>
          </View>
        )}

        {conversationHistory.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Recent conversation</Text>
            {conversationHistory.slice(-6).map((msg, i) => (
              <View key={i} style={[styles.bubbleRow, msg.role === 'assistant' && styles.bubbleRowAI]}>
                <View style={msg.role === 'user' ? styles.userBubble : styles.aiBubble}>
                  <Text style={msg.role === 'user' ? styles.userBubbleText : styles.aiBubbleText}>
                    {msg.role === 'user' ? 'You' : 'Autopilot'}: {msg.content.slice(0, 80)}{msg.content.length > 80 ? '...' : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {!transcript && !aiResponse && !error && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {!sessionActive
                ? 'Connecting to Autopilot...'
                : isListening
                ? 'I\'m listening...'
                : 'Tap the orb and speak'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(20, 25, 35, 0.97)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    maxHeight: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  stateLabel: {
    flex: 1,
    color: '#F0F6FC',
    fontSize: 13,
    fontWeight: '500',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#F0F6FC',
    fontSize: 18,
    lineHeight: 20,
  },
  content: {
    padding: 12,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bubbleRowAI: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  userBubble: {
    backgroundColor: 'rgba(124, 58, 237, 0.3)',
    borderRadius: 12,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '85%',
  },
  aiBubble: {
    backgroundColor: 'rgba(255, 191, 72, 0.15)',
    borderRadius: 12,
    borderBottomRightRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '85%',
  },
  userBubbleText: {
    color: '#E0D4FF',
    fontSize: 12,
    lineHeight: 17,
  },
  aiBubbleText: {
    color: '#FFD080',
    fontSize: 12,
    lineHeight: 17,
  },
  historySection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 8,
  },
  historyTitle: {
    color: '#6E7681',
    fontSize: 10,
    marginBottom: 6,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    color: '#6E7681',
    fontSize: 13,
  },
});
