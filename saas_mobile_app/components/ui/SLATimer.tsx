// SLATimer.tsx
// Modern pill-shaped SLA timer with color-coded urgency
// Color: green (safe) -> orange (warning) -> red (urgent/breached)

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

interface SLATimerProps {
  slaDeadline?: string | null;
  createdAt?: string;
  resolvedAt?: string | null;
  pausedMinutes?: number;
  breached?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  showLabel?: boolean;
}

type UrgencyLevel = 'safe' | 'warning' | 'urgent' | 'breached' | 'resolved';

const formatDuration = (ms: number): string => {
  if (ms <= 0) return '0m';
  const totalSecs = Math.floor(Math.abs(ms) / 1000);
  const totalMins = Math.floor(totalSecs / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const s = totalSecs % 60;

  if (totalMins < 1) return `${s}s`;
  if (h === 0) return `${m}m`;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remainingH = h % 24;
  return remainingH > 0 ? `${d}d ${remainingH}h` : `${d}d`;
};

const getUrgencyLevel = (
  deadline: Date,
  now: Date,
  resolvedAt: string | null | undefined,
  breached: boolean | undefined
): UrgencyLevel => {
  if (resolvedAt || breached) return 'breached';
  const diff = deadline.getTime() - now.getTime();
  if (diff < 0) return 'breached';
  if (diff < 30 * 60 * 1000) return 'urgent';   // < 30 min
  if (diff < 60 * 60 * 1000) return 'warning';  // < 1 hour
  return 'safe';
};

const URGENCY_COLORS: Record<UrgencyLevel, { bg: string; border: string; text: string; label: string }> = {
  safe: {
    bg: '#E8F5EE',
    border: '#B8DFCA',
    text: '#2D6B50',
    label: 'On Track',
  },
  warning: {
    bg: '#FFF4E8',
    border: '#F5D4B3',
    text: '#B8723A',
    label: 'Due Soon',
  },
  urgent: {
    bg: '#FFF0E0',
    border: '#F5C8A3',
    text: '#C46820',
    label: 'Urgent',
  },
  breached: {
    bg: '#FDEEEE',
    border: '#FACBCB',
    text: '#C44545',
    label: 'Breached',
  },
  resolved: {
    bg: '#F1F5F9',
    border: '#E2E8F0',
    text: '#64748B',
    label: 'Resolved',
  },
};

const SIZE_CONFIG = {
  sm: {
    height: 28,
    fontSize: 11,
    labelFontSize: 9,
    paddingH: 8,
    dotSize: 6,
  },
  md: {
    height: 36,
    fontSize: 13,
    labelFontSize: 10,
    paddingH: 12,
    dotSize: 7,
  },
  lg: {
    height: 44,
    fontSize: 15,
    labelFontSize: 11,
    paddingH: 16,
    dotSize: 8,
  },
};

export const SLATimer: React.FC<SLATimerProps> = ({
  slaDeadline,
  createdAt,
  resolvedAt,
  pausedMinutes = 0,
  breached = false,
  size = 'md',
  style,
  showLabel = true,
}) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (resolvedAt || breached) return;
    const interval = setInterval(() => setNow(new Date()), 30000); // update every 30s
    return () => clearInterval(interval);
  }, [resolvedAt, breached]);

  if (!slaDeadline) return null;

  const deadline = new Date(slaDeadline);
  const isResolved = !!resolvedAt;
  const isBreached = breached || deadline < now;

  const urgency: UrgencyLevel = isResolved
    ? 'resolved'
    : getUrgencyLevel(deadline, now, resolvedAt, breached);

  const colors = URGENCY_COLORS[urgency];
  const cfg = SIZE_CONFIG[size];

  // Calculate time display
  let timeDisplay: string;
  if (isResolved) {
    timeDisplay = 'Closed';
  } else if (urgency === 'breached') {
    const overdueMs = now.getTime() - deadline.getTime();
    timeDisplay = `+${formatDuration(overdueMs)}`;
  } else {
    const remainingMs = deadline.getTime() - now.getTime();
    timeDisplay = formatDuration(remainingMs);
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          height: cfg.height,
          paddingHorizontal: cfg.paddingH,
        },
        style,
      ]}
    >
      {/* Urgency dot */}
      <View
        style={[
          styles.dot,
          {
            backgroundColor: colors.text,
            width: cfg.dotSize,
            height: cfg.dotSize,
            borderRadius: cfg.dotSize / 2,
          },
        ]}
      />

      {/* Time value */}
      <Text
        style={[
          styles.timeText,
          {
            color: colors.text,
            fontSize: cfg.fontSize,
          },
        ]}
      >
        {timeDisplay}
      </Text>

      {/* Label */}
      {showLabel && (
        <Text
          style={[
            styles.labelText,
            {
              color: colors.text,
              fontSize: cfg.labelFontSize,
            },
          ]}
        >
          {colors.label}
        </Text>
      )}
    </View>
  );
};

// ---- Circular SLA Gauge (for dashboard tiles) ----
interface SLACircularProps {
  slaDeadline?: string | null;
  createdAt?: string;
  resolvedAt?: string | null;
  breached?: boolean;
  size?: number;
  style?: ViewStyle;
}

export const SLACircular: React.FC<SLACircularProps> = ({
  slaDeadline,
  createdAt,
  resolvedAt,
  breached = false,
  size = 64,
  style,
}) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (resolvedAt || breached) return;
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, [resolvedAt, breached]);

  if (!slaDeadline) return null;

  const deadline = new Date(slaDeadline);
  const isResolved = !!resolvedAt;
  const isBreached = breached || deadline < now;

  const urgency: UrgencyLevel = isResolved
    ? 'resolved'
    : getUrgencyLevel(deadline, now, resolvedAt, breached);
  const colors = URGENCY_COLORS[urgency];

  let display: string;
  if (isResolved) {
    display = 'OK';
  } else if (urgency === 'breached') {
    const overdueMs = now.getTime() - deadline.getTime();
    display = formatDuration(overdueMs);
  } else {
    const remainingMs = deadline.getTime() - now.getTime();
    display = formatDuration(remainingMs);
  }

  return (
    <View
      style={[
        styles.circularContainer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.circularInner,
          {
            width: size - 6,
            height: size - 6,
            borderRadius: (size - 6) / 2,
            backgroundColor: colors.bg,
          },
        ]}
      >
        <Text style={[styles.circularText, { color: colors.text, fontSize: size * 0.22 }]}>
          {display}
        </Text>
        <Text style={[styles.circularLabel, { color: colors.text, fontSize: size * 0.14 }]}>
          {isBreached ? 'Over' : 'Left'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
    alignSelf: 'flex-start',
  },
  dot: {
    // dynamic size set inline
  },
  timeText: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  labelText: {
    fontWeight: '600',
    opacity: 0.8,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  circularContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  circularInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circularText: {
    fontWeight: '800',
  },
  circularLabel: {
    fontWeight: '500',
    marginTop: 1,
  },
});

export default SLATimer;
