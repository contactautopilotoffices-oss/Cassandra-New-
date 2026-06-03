import React, { useState, useEffect, useMemo, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ViewStyle,
  Share,
  Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { useTheme } from '@/context';
import { getPriorityConfig, getStatusConfig } from '@/utils/StatusColors';

export interface TicketCardProps {
  id: string;
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'OPEN' | 'PENDING_VALIDATION';
  ticketNumber: string;
  createdAt: string;
  assignedTo?: string;
  assigneePhotoUrl?: string | null;
  photoUrl?: string;
  propertyName?: string;
  materialsOrdered?: boolean;
  escalationChain?: { name: string; avatar?: string | null }[];
  raisedByTenant?: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onValidate?: () => void;
  onReject?: () => void;
  style?: ViewStyle;
  compact?: boolean;
  /** Shared ticker value from parent (incrementing counter). When provided, the card
   *  reads this value instead of running its own setInterval — eliminating N concurrent
   *  timers when N cards are rendered. */
  tick?: number;
  glass?: boolean;
  blurIntensity?: number;
  blurContent?: boolean;
  raisedByName?: string;
}

const TicketCard = memo(function TicketCard({
  id, title, priority, status, ticketNumber, createdAt,
  assignedTo, assigneePhotoUrl, photoUrl, propertyName,
  materialsOrdered, escalationChain, raisedByTenant,
  onClick, onEdit, onDelete, onShare, onValidate, onReject, style, compact,
  tick, glass, blurIntensity = 40, blurContent = false, raisedByName,
}: TicketCardProps) {
  const dateObj = useMemo(() => new Date(createdAt), [createdAt]);
  const dateStr = dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const handleShare = async () => {
    if (onShare) { onShare(); return; }

    // Construct a comprehensive message
    const messageText = `🎫 Ticket: ${title}\n📋 ${ticketNumber}\n⏰ ${dateStr} ${timeStr}\n📊 Priority: ${priority} | Status: ${status.replace(/_/g, ' ')}${assignedTo ? `\n👤 Assigned: ${assignedTo}` : ''}`;

    try {
      if (photoUrl && (await Sharing.isAvailableAsync())) {
        // Download the image to share it as a file
        const fileUri = `${(FileSystem as any).cacheDirectory}share_${id.slice(0, 8)}.jpg`;
        const downloadResult = await (FileSystem as any).downloadAsync(photoUrl, fileUri);

        // Use Sharing.shareAsync for files (Expo Go compatible)
        await Sharing.shareAsync(downloadResult.uri, {
          dialogTitle: `Share Ticket ${ticketNumber}`,
          UTI: 'public.jpeg', // iOS specific hint
          mimeType: 'image/jpeg',
        });
      } else {
        // Fallback to standard text share
        await Share.share({
          message: messageText,
          title: `Ticket ${ticketNumber}`,
        });
      }
    } catch (error) {
      console.log('Share failed or cancelled', error);
    }
  };

  const isClosed = ['COMPLETED', 'CLOSED', 'RESOLVED'].includes(status?.toUpperCase() || '');
  const isCritical = priority?.toUpperCase() === 'CRITICAL' && !isClosed;

  // Elapsed time: reads from parent's shared tick if provided, otherwise computes once.
  // No setInterval per card — exactly ONE timer drives all cards from the parent.
  const elapsedSec = useMemo(
    () => Math.floor((Date.now() - dateObj.getTime()) / 1000),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick ?? 0, dateObj]
  );

  const formatElapsed = (sec: number) => {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const timerColor = isClosed ? '#94A3B8'
    : elapsedSec < 3600 ? '#10B981'
    : elapsedSec < 86400 ? '#F59E0B'
    : elapsedSec < 86400 * 3 ? '#F97316'
    : '#F43F5E';

  const { isDark, colors } = useTheme();
  const pStyle = getPriorityConfig(priority);
  // Map UPPER_CASE to lowercase for shared config
  const statusKey = status?.toLowerCase().replace(/_/g, '_') ?? 'open';
  const sStyle = getStatusConfig(statusKey);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: glass 
            ? (isDark ? 'rgba(30, 41, 59, 0.55)' : 'rgba(255, 255, 255, 0.75)')
            : (isDark ? '#1E293B' : '#FFFFFF'),
          borderColor: glass
            ? (isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.05)')
            : (isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0'),
          padding: compact ? 12 : 16, 
          gap: compact ? 8 : 12,
        },
        isCritical && { borderWidth: 2, borderColor: '#EF4444' },
        raisedByTenant && !isCritical && { borderWidth: 2, borderColor: '#F59E0B' },
        style,
      ]}
      onPress={onClick}
      activeOpacity={0.7}
    >
      {glass && Platform.OS === 'ios' && (
        <SafeBlurView
          intensity={blurIntensity}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      )}
      {/* Header */}
      <View style={[styles.headerRow, { gap: compact ? 8 : 12 }]}>
        {photoUrl && (
          <Image source={{ uri: photoUrl }} style={[styles.thumbnail, compact && { width: 44, height: 44 }]} />
        )}
        <Text style={[styles.title, { color: colors.textPrimary, fontWeight: '700' }, compact && { fontSize: 14, lineHeight: 18 }]} numberOfLines={compact ? 1 : 2}>{title}</Text>
        <View style={styles.topActions}>
          {onEdit && (
            <TouchableOpacity 
              style={[
                styles.topIconBtn, 
                { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)' }, 
                compact && { width: 28, height: 28 }
              ]} 
              onPress={onEdit} 
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="create-outline" size={compact ? 14 : 16} color="#6366F1" />
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={[
              styles.topIconBtn, 
              { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)' }, 
              compact && { width: 28, height: 28 }
            ]} 
            onPress={handleShare} 
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="share-outline" size={compact ? 14 : 16} color="#6366F1" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Badges */}
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: pStyle.bg, borderColor: pStyle.bg }]}>
          <Text style={[styles.badgeText, { color: pStyle.text }]}>{priority}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: sStyle.bg, borderColor: sStyle.bg }]}>
          <Text style={[styles.badgeText, { color: sStyle.text }]}>{status.replace(/_/g, ' ')}</Text>
        </View>
        {materialsOrdered && (
          <View style={[styles.badge, { backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.3)' }]}>
            <Ionicons name="cube-outline" size={10} color="#3B82F6" />
            <Text style={[styles.badgeText, { color: '#3B82F6' }]}>Materials</Text>
          </View>
        )}
        {propertyName && (
          <View style={[styles.badge, { backgroundColor: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.2)' }]}>
            <Ionicons name="business-outline" size={10} color="#6366F1" />
            <Text style={[styles.badgeText, { color: '#6366F1' }]}>{propertyName}</Text>
          </View>
        )}
      </View>

      {/* Raised By */}
      {raisedByName && (
        <View style={[styles.assigneeRow, { gap: compact ? 4 : 6, marginBottom: compact ? 2 : 4 }]}>
          <Text style={[styles.assigneeLabel, { color: colors.textSecondary }, compact && { fontSize: 11 }]}>Raised By:</Text>
          <Text style={[styles.assigneeName, { color: colors.textPrimary, fontWeight: '700' }, compact && { fontSize: 12 }]} numberOfLines={1}>{raisedByName}</Text>
        </View>
      )}

      {/* Assignee */}
      {assignedTo && status !== 'OPEN' && (
        <View style={[styles.assigneeRow, { gap: compact ? 4 : 6 }]}>
          <Text style={[styles.assigneeLabel, { color: colors.textSecondary }, compact && { fontSize: 11 }]}>Serving:</Text>
          {assigneePhotoUrl ? (
            <Image source={{ uri: assigneePhotoUrl }} style={[styles.assigneeAvatar, compact && { width: 18, height: 18 }]} />
          ) : (
            <View style={[styles.assigneeInitials, { backgroundColor: colors.background, borderColor: colors.border }, compact && { width: 18, height: 18 }]}>
              <Text style={[styles.initialsText, { color: colors.primary }, compact && { fontSize: 7 }]}>
                {assignedTo.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.assigneeName, { color: colors.textPrimary }, compact && { fontSize: 12 }]} numberOfLines={1}>{assignedTo}</Text>
        </View>
      )}

      {/* Escalation chain */}
      {escalationChain && escalationChain.length > 0 && (
        <View style={[styles.escalationRow, { gap: compact ? 3 : 4 }]}>
          <Text style={[styles.escalatedLabel, compact && { fontSize: 9, marginRight: 2 }]}>Escalated</Text>
          {escalationChain.slice(0, compact ? 4 : 6).map((person, i) => {
            const initials = person.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            const isLast = i === Math.min(escalationChain.length, compact ? 4 : 6) - 1;
            return (
              <React.Fragment key={i}>
                <View style={[styles.escalationCircle, { width: compact ? 20 : 24, height: compact ? 20 : 24 }, isLast ? { borderColor: '#FCA5A5' } : { borderColor: colors.border, backgroundColor: colors.background }]}>
                  {person.avatar ? (
                    <Image source={{ uri: person.avatar }} style={{ width: compact ? 20 : 24, height: compact ? 20 : 24, borderRadius: compact ? 10 : 12 }} />
                  ) : (
                    <Text style={[styles.escalationInitials, { fontSize: compact ? 7 : 8 }, isLast && { color: '#EF4444' }]}>{initials}</Text>
                  )}
                </View>
                {!isLast && <Ionicons name="chevron-forward" size={compact ? 8 : 10} color="#FCA5A5" />}
              </React.Fragment>
            );
          })}
        </View>
      )}

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: colors.border, paddingTop: compact ? 8 : 10 }]}>
        <View style={styles.footerLeft}>
          <Text style={[styles.metaText, { color: colors.textSecondary, fontWeight: '700' }, compact && { fontSize: 9, marginBottom: 0 }]}>{ticketNumber} • {dateStr}</Text>
          <View style={styles.timerRow}>
            <Ionicons name="timer-outline" size={compact ? 9 : 11} color={timerColor} />
            <Text style={[styles.timerText, { color: timerColor }, compact && { fontSize: 9 }]}>
              {isClosed ? `Closed` : formatElapsed(elapsedSec)}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.viewBtn, compact && { paddingHorizontal: 10, paddingVertical: 5 }]} onPress={onClick}>
          <Text style={[styles.viewBtnText, compact && { fontSize: 10 }]}>View</Text>
        </TouchableOpacity>
      </View>

      {/* Validation actions */}
      {status === 'PENDING_VALIDATION' && (onValidate || onReject) && (
        <View style={[styles.validationRow, { borderTopColor: colors.border }]}>
          {onValidate && (
            <TouchableOpacity style={styles.validateBtn} onPress={onValidate}>
              <Ionicons name="checkmark-circle-outline" size={14} color="#FFF" />
              <Text style={styles.validateBtnText}>Looks Good</Text>
            </TouchableOpacity>
          )}
          {onReject && (
            <TouchableOpacity style={styles.rejectBtn} onPress={onReject}>
              <Ionicons name="close-circle-outline" size={14} color="#EF4444" />
              <Text style={styles.rejectBtnText}>Not Resolved</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <View 
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill, 
          { borderRadius: 16, overflow: 'hidden', opacity: blurContent ? 1 : 0 }
        ]}
      >
        {Platform.OS === 'ios' ? (
          <SafeBlurView intensity={100} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.85)' }]} />
        )}
      </View>
    </TouchableOpacity>
  );
});

export default TicketCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 16, 
    borderWidth: 1,
    shadowColor: '#94A3B8', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.12, 
    shadowRadius: 8, 
    elevation: 3,
  },
  headerRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumbnail: { width: 56, height: 56, borderRadius: 12 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  topActions: { flexDirection: 'row', gap: 6, marginLeft: 4 },
  topIconBtn: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assigneeLabel: { fontSize: 12 },
  assigneeAvatar: { width: 20, height: 20, borderRadius: 10, borderWidth: 1 },
  assigneeInitials: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  initialsText: { fontSize: 8, fontWeight: '700' },
  assigneeName: { fontSize: 13, fontWeight: '600' },
  escalationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  escalatedLabel: { fontSize: 10, fontWeight: '600', color: '#EF4444', textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 4 },
  escalationCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  escalationInitials: { fontSize: 8, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1 },
  footerLeft: { flex: 1 },
  metaText: { fontSize: 10, marginBottom: 1 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerText: { fontSize: 10, fontWeight: '700' },
  viewBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#708F96', borderRadius: 10 },
  viewBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(100,116,139,0.08)', justifyContent: 'center', alignItems: 'center' },
  validationRow: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1 },
  validateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: '#10B981', borderRadius: 12 },
  validateBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: 'rgba(239,68,68,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  rejectBtnText: { fontSize: 12, fontWeight: '700', color: '#EF4444' },
});
