import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import StatusBadge from './StatusBadge';
import SafeBlurView from '@/components/ui/SafeBlurView';

interface TicketListItemProps {
  id: string;
  title: string;
  status: string;
  priority: string;
  ticketNumber: string;
  createdAt: string;
  assignedTo?: string;
  assigneePhotoUrl?: string | null;
  photoUrl?: string;
  escalationChain?: { name: string; avatar?: string | null }[];
  onPress: () => void;
}

const PRIORITY_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  critical: { bg: 'rgba(244,63,94,0.12)', text: '#F43F5E', dot: '#F43F5E' },
  high:     { bg: 'rgba(249,115,22,0.12)', text: '#F97316', dot: '#F97316' },
  medium:   { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B', dot: '#F59E0B' },
  low:      { bg: 'rgba(148,163,184,0.12)', text: '#94A3B8', dot: '#94A3B8' },
};

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr  / 24);
  if (diffDay > 0)  return `${diffDay}d ago`;
  if (diffHr  > 0)  return `${diffHr}h ago`;
  if (diffMin > 0)  return `${diffMin}m ago`;
  return 'Just now';
}

export default function TicketListItem({
  id, title, status, priority, ticketNumber,
  createdAt, assignedTo, assigneePhotoUrl, photoUrl,
  escalationChain, onPress,
}: TicketListItemProps) {
  const [timeAgo, setTimeAgo] = useState(() => formatTimeAgo(createdAt));
  const isClosed = ['resolved', 'closed'].includes(status);

  useEffect(() => {
    if (isClosed) return;
    const interval = setInterval(() => setTimeAgo(formatTimeAgo(createdAt)), 30000);
    return () => clearInterval(interval);
  }, [createdAt, isClosed]);

  const pCfg = PRIORITY_CONFIG[priority?.toLowerCase()] ?? PRIORITY_CONFIG.low;

  return (
    <TouchableOpacity
      style={styles.cardWrapper}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <SafeBlurView 
        intensity={60} 
        tint="dark" 
        style={[styles.card, priority?.toLowerCase() === 'critical' && !isClosed && styles.criticalCard]}
      >
        {/* Left accent bar for priority */}
        <View style={[styles.priorityBar, { backgroundColor: pCfg.dot }]} />

        <View style={styles.content}>
          {/* Top row: ticket number + time */}
          <View style={styles.topRow}>
            <Text style={styles.ticketNumber}>{ticketNumber}</Text>
            <Text style={styles.timeAgo}>{timeAgo}</Text>
          </View>

          {/* Title */}
          <Text style={styles.title} numberOfLines={2}>{title}</Text>

          {/* Badges row */}
          <View style={styles.badgesRow}>
            <StatusBadge status={status} size="sm" />
            <View style={[styles.priorityBadge, { backgroundColor: pCfg.bg }]}>
              <View style={[styles.priorityDot, { backgroundColor: pCfg.dot }]} />
              <Text style={[styles.priorityText, { color: pCfg.text }]}>
                {priority?.toUpperCase()}
              </Text>
            </View>
            {escalationChain && escalationChain.length > 0 && (
              <View style={styles.escalatedBadge}>
                <Ionicons name="arrow-up" size={10} color="#FFF" />
                <Text style={styles.escalatedText}>ESCALATED</Text>
              </View>
            )}
          </View>

          {/* Assignee row */}
          {assignedTo && (
            <View style={styles.assigneeRow}>
              {assigneePhotoUrl ? (
                <Image source={{ uri: assigneePhotoUrl }} style={styles.assigneeAvatar} />
              ) : (
                <View style={styles.assigneeInitials}>
                  <Text style={styles.assigneeInitialsText}>
                    {assignedTo.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.assigneeName} numberOfLines={1}>{assignedTo}</Text>
            </View>
          )}

          {/* Escalation chain */}
          {escalationChain && escalationChain.length > 0 && (
            <View style={styles.escalationWrap}>
              <Text style={styles.escalatedLabel}>Escalated to:</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.escalationScroll} showsVerticalScrollIndicator={false}>
                {escalationChain.map((person, i) => {
                  const initials = person.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                  const isLast = i === escalationChain.length - 1;
                  return (
                    <React.Fragment key={i}>
                      <View style={[styles.escAvatar, { borderColor: isLast ? '#FCA5A5' : '#E2E8F0' }]}>
                        {person.avatar ? (
                          <Image source={{ uri: person.avatar }} style={styles.escAvatarImg} />
                        ) : (
                          <View style={[styles.escInitials, { backgroundColor: isLast ? '#FEE2E2' : '#F1F5F9' }]}>
                            <Text style={[styles.escInitialsText, { color: isLast ? '#DC2626' : '#64748B' }]}>
                              {initials}
                            </Text>
                          </View>
                        )}
                      </View>
                      {!isLast && <Ionicons name="arrow-forward" size={10} color="#FCA5A5" style={{ marginHorizontal: 2 }} />}
                    </React.Fragment>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Right side: photo + chevron */}
        <View style={styles.rightSide}>
          {photoUrl && (
            <Image source={{ uri: photoUrl }} style={styles.ticketPhoto} />
          )}
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
        </View>
      </SafeBlurView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  card: {
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  criticalCard: {
    borderColor: '#F43F5E',
    borderWidth: 1.5,
  },
  priorityBar: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketNumber: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeAgo: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  escalatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  escalatedText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.3,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  assigneeAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  assigneeInitials: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assigneeInitialsText: {
    fontSize: 7,
    fontWeight: '700',
    color: '#60A5FA',
  },
  assigneeName: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
  },
  escalationWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  escalatedLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#F87171',
    flexShrink: 0,
  },
  escalationScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingRight: 8,
  },
  escAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  escAvatarImg: {
    width: '100%',
    height: '100%',
  },
  escInitials: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  escInitialsText: {
    fontSize: 8,
    fontWeight: '700',
  },
  rightSide: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 12,
    gap: 8,
  },
  ticketPhoto: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
});
