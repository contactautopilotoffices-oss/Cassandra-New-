import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

// Apple system colors
const VARIANT_COLORS: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  success: { bg: 'rgba(52,199,89,0.10)', text: '#34C759', border: 'rgba(52,199,89,0.18)' },
  warning: { bg: 'rgba(255,159,10,0.10)', text: '#FF9F0A', border: 'rgba(255,159,10,0.18)' },
  danger:  { bg: 'rgba(255,59,48,0.10)',  text: '#FF3B30', border: 'rgba(255,59,48,0.18)' },
  info:    { bg: 'rgba(41,151,255,0.10)', text: '#2997FF', border: 'rgba(41,151,255,0.18)' },
  neutral: { bg: '#F5F5F7', text: '#6B7280', border: '#E8E8ED' },
  purple:  { bg: 'rgba(175,82,222,0.10)', text: '#AF52DE', border: 'rgba(175,82,222,0.18)' },
};

export function StatusBadge({ label, variant = 'neutral', size = 'sm', style }: StatusBadgeProps) {
  const colors = VARIANT_COLORS[variant];

  return (
    <View
      style={[
        size === 'sm' ? styles.badgeSm : styles.badgeMd,
        { backgroundColor: colors.bg, borderColor: colors.border },
        style,
      ]}
    >
      <Text
        style={[
          size === 'sm' ? styles.textSm : styles.textMd,
          { color: colors.text },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// ---- Priority Badge ----
type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const PRIORITY_VARIANT: Record<PriorityLevel, BadgeVariant> = {
  LOW: 'info',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
};

export function PriorityBadge({ priority, size = 'sm', style }: { priority: PriorityLevel; size?: 'sm' | 'md'; style?: ViewStyle }) {
  return (
    <StatusBadge
      label={priority}
      variant={PRIORITY_VARIANT[priority] || 'neutral'}
      size={size}
      style={style}
    />
  );
}

// ---- Ticket Status Badge ----
const TICKET_STATUS_VARIANT: Record<string, BadgeVariant> = {
  OPEN: 'warning',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CLOSED: 'neutral',
  RESOLVED: 'success',
  open: 'warning',
  assigned: 'info',
  in_progress: 'info',
  completed: 'success',
  closed: 'neutral',
  resolved: 'success',
  blocked: 'danger',
  client_raised: 'warning',
  work_started: 'info',
};

export function TicketStatusBadge({ status, size = 'sm', style }: { status: string; size?: 'sm' | 'md'; style?: ViewStyle }) {
  const variant = TICKET_STATUS_VARIANT[status] || TICKET_STATUS_VARIANT[status.toUpperCase()] || 'neutral';
  const label = status.replace(/_/g, ' ');
  return <StatusBadge label={label} variant={variant} size={size} style={style} />;
}

// ---- Ticket Status Dot ----
const TICKET_DOT_COLORS: Record<string, string> = {
  open: '#FF9F0A',
  assigned: '#2997FF',
  in_progress: '#2997FF',
  work_started: '#2997FF',
  completed: '#34C759',
  resolved: '#34C759',
  closed: '#9CA3AF',
  blocked: '#FF3B30',
  client_raised: '#FF9F0A',
};

export function TicketStatusDot({ status, size = 8 }: { status: string; size?: number }) {
  const color = TICKET_DOT_COLORS[status.toLowerCase()] || TICKET_DOT_COLORS[status] || '#9CA3AF';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
    />
  );
}

const styles = StyleSheet.create({
  badgeSm: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeMd: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  textSm: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  textMd: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});

export default StatusBadge;
