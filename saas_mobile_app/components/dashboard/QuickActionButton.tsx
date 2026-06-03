import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ViewStyle, ScrollView } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/context';

interface QuickActionButtonProps {
  icon: React.ReactNode;
  label: string;
  color?: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
}

export function QuickActionButton({
  icon,
  label,
  color = '#708F96',
  onPress,
  style,
  disabled = false,
}: QuickActionButtonProps) {
  const { theme } = useTheme();
  const colors = Colors[theme];

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: theme === 'dark' ? colors.card : '#FFFFFF',
          borderColor: theme === 'dark' ? colors.border : 'rgba(0,0,0,0.06)',
          shadowColor: theme === 'dark' ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.08)',
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.72}
      disabled={disabled}
    >
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: color + (theme === 'dark' ? '30' : '15') },
        ]}
      >
        {icon}
      </View>
      <Text
        style={[
          styles.label,
          { color: theme === 'dark' ? colors.textSecondary : '#4B5563' },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// Grid layout for 4 quick actions (2x2)
export function QuickActionsGrid({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.grid, style]}>{children}</View>;
}

// Horizontal row layout for 5 quick actions (scrollable)
export function QuickActionsRow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.rowContainer, style]} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
    // Fixed width for horizontal row (5 items need to fit)
    minWidth: 80,
    maxWidth: 90,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 10,
        textAlign: 'center',
    letterSpacing: 0.1,
    lineHeight: 13,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 16,
  },
});

export default QuickActionButton;
