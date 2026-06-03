import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
  };
  accentColor?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

export default function KPICard({
  title,
  value,
  subtitle,
  icon,
  trend,
  accentColor,
  onPress,
  style,
}: KPICardProps) {
  const getTrendColors = () => {
    if (trend?.direction === 'up') return { bg: 'rgba(16,185,129,0.08)', text: '#10B981', border: 'rgba(16,185,129,0.2)' };
    if (trend?.direction === 'down') return { bg: 'rgba(239,68,68,0.08)', text: '#EF4444', border: 'rgba(239,68,68,0.2)' };
    return { bg: '#F8FAFC', text: '#94A3B8', border: '#E2E8F0' };
  };

  const trendColors = trend ? getTrendColors() : null;
  const arrow = trend?.direction === 'up' ? '↑' : trend?.direction === 'down' ? '↓' : '→';

  const content = (
    <View
      style={[
        styles.card,
        accentColor ? { borderLeftWidth: 4, borderLeftColor: accentColor } : {},
        style,
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.valueRow}>
            <Text style={[styles.value, accentColor ? { color: accentColor } : {}]}>
              {value}
            </Text>
            {trend && trendColors && (
              <View style={[styles.trendBadge, { backgroundColor: trendColors.bg, borderColor: trendColors.border }]}>
                <Text style={[styles.trendText, { color: trendColors.text }]}>
                  {arrow} {trend.value}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.iconContainer}>
          <Ionicons name={icon} size={24} color="#64748B" />
        </View>
      </View>

      {/* Subtitle */}
      {subtitle && (
        <View style={styles.subtitleContainer}>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  value: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1A2332',
    letterSpacing: -1,
  },
  trendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '600',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  subtitleContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226,232,240,0.5)',
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
  },
});
