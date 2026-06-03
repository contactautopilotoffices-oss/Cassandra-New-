import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/context';

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  accentColor?: string;
  onPress?: () => void;
  style?: ViewStyle;
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  accentColor,
  onPress,
  style,
  loading = false,
}: StatCardProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];

  const cardContent = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: theme === 'dark' ? colors.border : 'rgba(0,0,0,0.04)',
          shadowColor: theme === 'dark' ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.08)',
        },
        style,
      ]}
    >
      {/* Icon circle — top center */}
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor:
              (accentColor || colors.primary) +
              (theme === 'dark' ? '25' : '15'),
          },
        ]}
      >
        {icon}
      </View>

      {/* Value */}
      {loading ? (
        <View style={styles.valueSkeleton} />
      ) : (
        <Text
          style={[
            styles.value,
            { color: colors.text },
          ]}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </Text>
      )}

      {/* Label */}
      <Text
        style={[styles.title, { color: colors.textSecondary }]}
        numberOfLines={1}
      >
        {title}
      </Text>

      {/* Optional subtitle */}
      {subtitle && (
        <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
          {subtitle}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.72}>
        {cardContent}
      </TouchableOpacity>
    );
  }

  return cardContent;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 1,
    shadowRadius: 40,
    elevation: 8,
    minWidth: 140,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  value: {
    fontSize: 36,
        letterSpacing: -0.5,
    lineHeight: 42,
    textAlign: 'center',
  },
  title: {
    fontSize: 12,
        textAlign: 'center',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 10,
        textAlign: 'center',
    marginTop: 2,
  },
  valueSkeleton: {
    height: 42,
    width: 80,
    backgroundColor: 'rgba(128,128,128,0.12)',
    borderRadius: 8,
    marginBottom: 4,
  },
});

export default StatCard;
