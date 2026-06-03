// ============================================
// Web Compatibility Layer for Mobile
// Provides shims for Next.js/web components
// Modern MST Dashboard Design System
// ============================================

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextStyle,
  ViewStyle,
  Image,
  ImageStyle,
  ActivityIndicator,
  StyleProp,
} from 'react-native';

// Re-export native Text for pages that import it from here
export { Text } from 'react-native';
export type { TextStyle, ViewStyle } from 'react-native';

// ---- Modern Design System Color Palette ----
const PALETTE = {
  primary: '#7CB9A8',
  primaryDark: '#6B9E8B',
  primaryLight: '#E8F0ED',
  secondary: '#E8A87C',
  secondaryLight: '#FFF3E8',
  accent: '#F5F0E8',
  accentLight: '#FBF8F4',
  success: '#3A8C6D',
  successBg: '#E8F5EE',
  successBorder: '#B8DFCA',
  successText: '#2D6B50',
  warning: '#E8A87C',
  warningBg: '#FFF4E8',
  warningBorder: '#F5D4B3',
  warningText: '#B8723A',
  error: '#EF6B6B',
  errorBg: '#FDEEEE',
  errorBorder: '#FACBCB',
  errorText: '#C44545',
  info: '#3B7DD8',
  infoBg: '#EBF3FE',
  infoBorder: '#C3DAFA',
  infoText: '#2A6AC4',
  defaultBg: '#F1F5F9',
  defaultBorder: '#E2E8F0',
  defaultText: '#64748B',
  secondaryBadgeBg: '#F0EEF5',
  secondaryBadgeText: '#6B7280',
  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  glassBg: 'rgba(255,255,255,0.68)',
  glassBorder: 'rgba(255,255,255,0.55)',
  glassBgDark: 'rgba(30,38,55,0.65)',
  glassBorderDark: 'rgba(80,100,130,0.30)',
};

// ---- Skeleton ----
export const Skeleton: React.FC<{ width?: number | string; height?: number; style?: ViewStyle }> = ({
  width = '100%', height = 16, style,
}) => (
  <View
    style={[
      {
        backgroundColor: 'rgba(180,195,210,0.25)',
        borderRadius: 6,
        width: width as any,
        height,
      },
      style,
    ]}
  />
);

// ---- ErrorState ----
export const ErrorState: React.FC<{ message?: string; onRetry?: () => void }> = ({
  message = 'Something went wrong.',
  onRetry,
}) => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyTitle}>Oops!</Text>
    <Text style={styles.emptyDesc}>{message}</Text>
    {onRetry && (
      <TouchableOpacity
        onPress={onRetry}
        style={[styles.retryButton]}
      >
        <Text style={styles.retryButtonText}>Try Again</Text>
      </TouchableOpacity>
    )}
  </View>
);

// ---- Text (typography helper) ----
export const WebText: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  className?: string;
}> = ({ children, style }) => <Text style={style}>{children}</Text>;

// ---- Headings ----
export const H1: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}> = ({ children, style }) => (
  <Text style={[styles.h1, style]}>{children}</Text>
);

export const H2: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}> = ({ children, style }) => (
  <Text style={[styles.h2, style]}>{children}</Text>
);

export const H3: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}> = ({ children, style }) => (
  <Text style={[styles.h3, style]}>{children}</Text>
);

// ---- Badge ----
export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'secondary';

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: BadgeVariant;
  style?: ViewStyle;
  textStyle?: TextStyle;
}> = ({ children, variant = 'default', style, textStyle }) => {
  const bgMap: Record<BadgeVariant, string> = {
    default: PALETTE.defaultBg,
    success: PALETTE.successBg,
    warning: PALETTE.warningBg,
    danger: PALETTE.errorBg,
    info: PALETTE.infoBg,
    secondary: PALETTE.secondaryBadgeBg,
  };
  const colorMap: Record<BadgeVariant, string> = {
    default: PALETTE.defaultText,
    success: PALETTE.successText,
    warning: PALETTE.warningText,
    danger: PALETTE.errorText,
    info: PALETTE.infoText,
    secondary: PALETTE.secondaryBadgeText,
  };
  const borderMap: Record<BadgeVariant, string> = {
    default: PALETTE.defaultBorder,
    success: PALETTE.successBorder,
    warning: PALETTE.warningBorder,
    danger: PALETTE.errorBorder,
    info: PALETTE.infoBorder,
    secondary: '#E2E8F0',
  };
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bgMap[variant],
          borderColor: borderMap[variant],
        },
        style,
      ]}
    >
      <Text style={[styles.badgeText, { color: colorMap[variant] }, textStyle]}>
        {children}
      </Text>
    </View>
  );
};

// ---- Avatar ----
export const Avatar: React.FC<{
  src?: string;
  name?: string;
  size?: number;
  style?: ImageStyle;
}> = ({ src, name, size = 40, style }) => {
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  if (src) {
    return (
      <Image
        source={{ uri: src }}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>
        {initials}
      </Text>
    </View>
  );
};

// ---- EmptyState ----
export const EmptyState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  actionLabel?: string;
  onEmptyAction?: () => void;
}> = ({ title, description, icon, action, actionLabel, onEmptyAction }) => (
  <View style={styles.emptyStateContainer}>
    {icon && (
      <View style={styles.emptyIconContainer}>
        {icon}
      </View>
    )}
    <Text style={styles.emptyTitle}>{title}</Text>
    {description && <Text style={styles.emptyDesc}>{description}</Text>}
    {action ? (
      <View style={styles.emptyAction}>{action}</View>
    ) : actionLabel && onEmptyAction ? (
      <TouchableOpacity
        onPress={onEmptyAction}
        style={styles.emptyActionBtn}
      >
        <Text style={styles.emptyActionText}>{actionLabel}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

// ---- SearchBar ----
export const SearchBar: React.FC<{
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  style?: ViewStyle;
}> = ({ value, onChangeText, placeholder = 'Search...', onSubmit, style }) => (
  <View style={[styles.searchBar, style]}>
    <Text style={styles.searchIcon}>Search</Text>
    <TextInput
      style={styles.searchInput}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      returnKeyType="search"
      onSubmitEditing={onSubmit}
    />
  </View>
);

// ---- LoadingSpinner (web Spinner shim) ----
export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; color?: string }> = ({
  size = 'md',
  color = PALETTE.primary,
}) => {
  return <ActivityIndicator size="small" color={color} />;
};

// ---- Tabs (web shim) ----
export const Tabs: React.FC<{
  tabs: string[];
  activeTab: number;
  onTabChange: (index: number) => void;
  style?: ViewStyle;
}> = ({ tabs, activeTab, onTabChange, style }) => (
  <View style={[styles.tabs, style]}>
    {tabs.map((tab, i) => (
      <TouchableOpacity
        key={tab}
        onPress={() => onTabChange(i)}
        style={[styles.tab, activeTab === i && styles.tabActive]}
      >
        <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>
          {tab}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

// ---- Divider ----
export const Divider: React.FC<{ style?: ViewStyle }> = ({ style }) => (
  <View style={[styles.divider, style]} />
);

const styles = StyleSheet.create({
  // Typography
  h1: {
    fontSize: 28,
    fontWeight: '700',
    color: PALETTE.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  h2: {
    fontSize: 22,
    fontWeight: '600',
    color: PALETTE.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  h3: {
    fontSize: 18,
    fontWeight: '600',
    color: PALETTE.textPrimary,
    lineHeight: 24,
  },
  // Badge
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  // Avatar
  avatar: {
    backgroundColor: PALETTE.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // Empty State - welcoming, centered
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: PALETTE.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: PALETTE.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  emptyDesc: {
    fontSize: 14,
    color: PALETTE.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  emptyAction: { marginTop: 20 },
  emptyActionBtn: {
    marginTop: 20,
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: 'rgba(26,26,46,0.10)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.accentLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(180,195,210,0.30)',
    paddingHorizontal: 14,
    height: 48,
    shadowColor: 'rgba(26,26,46,0.04)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  searchIcon: {
    fontSize: 11,
    color: PALETTE.textSecondary,
    marginRight: 8,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: PALETTE.textPrimary,
    padding: 0,
  },
  // Tabs
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(180,195,210,0.30)',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 4,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: PALETTE.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: PALETTE.textSecondary,
  },
  tabTextActive: {
    color: PALETTE.primary,
    fontWeight: '600',
  },
  // Divider
  divider: {
    height: 1,
    backgroundColor: 'rgba(180,195,210,0.25)',
    marginVertical: 8,
  },
  // Error State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
