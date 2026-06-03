import React from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  GestureResponderEvent,
} from 'react-native';

// ---- Apple-inspired Design System — no purple, brand-aligned ----
const COLORS = {
  primary: '#708F96',
  primaryDark: '#5A737A',
  primaryLight: 'rgba(112,143,150,0.12)',
  secondary: '#475569',
  secondaryDark: '#334155',
  secondaryLight: 'rgba(71,85,105,0.10)',
  success: '#34C759',
  successLight: 'rgba(52,199,89,0.10)',
  warning: '#FF9F0A',
  warningLight: 'rgba(255,159,10,0.10)',
  error: '#FF3B30',
  errorLight: 'rgba(255,59,48,0.10)',
  surface: '#FFFFFF',
  border: '#E8E8ED',
  textPrimary: '#1D1D1F',
  textSecondary: '#6B7280',
  textInverse: '#FFFFFF',
};

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'solid'
  | 'outline'
  | 'outline-secondary'
  | 'ghost'
  | 'success'
  | 'warning'
  | 'danger'
  | 'link';

type ButtonSize = 'sm' | 'md' | 'lg' | 'xl' | 'icon';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  title?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  onPress,
  disabled = false,
  loading = false,
  style,
  textStyle,
  title,
  leftIcon,
  rightIcon,
}) => {
  const containerStyle = getContainerStyle(variant, size);
  const labelStyle = getLabelStyle(variant, size);

  const label = children ?? (title ? <Text style={[styles.label, labelStyle, textStyle]}>{title}</Text> : null);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.base,
        containerStyle,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={labelStyle.color as string}
        />
      ) : (
        <>
          {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
          {label}
          {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
        </>
      )}
    </TouchableOpacity>
  );
};

function getContainerStyle(variant: ButtonVariant, size: ButtonSize): ViewStyle {
  const sizeStyle = SIZE_MAP[size];
  const variantStyle = VARIANT_MAP[variant];
  return { ...sizeStyle, ...variantStyle };
}

function getLabelStyle(variant: ButtonVariant, size: ButtonSize): TextStyle {
  const textColor = VARIANT_TEXT_MAP[variant];
  const fontSize = SIZE_FONT_MAP[size];
  return { color: textColor, fontSize };
}

// Pill-shaped sizes — Apple style
const SIZE_MAP: Record<ButtonSize, ViewStyle> = {
  sm: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 980,
    minHeight: 32,
  },
  md: {
    height: 40,
    paddingHorizontal: 24,
    borderRadius: 980,
    minHeight: 40,
  },
  lg: {
    height: 48,
    paddingHorizontal: 32,
    borderRadius: 980,
    minHeight: 48,
  },
  xl: {
    height: 52,
    paddingHorizontal: 40,
    borderRadius: 980,
    minHeight: 52,
  },
  icon: {
    height: 40,
    width: 40,
    borderRadius: 980,
    paddingHorizontal: 0,
    minHeight: 40,
  },
};

const SIZE_FONT_MAP: Record<ButtonSize, number> = {
  sm: 13,
  md: 14,
  lg: 15,
  xl: 16,
  icon: 14,
};

const VARIANT_MAP: Record<ButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.primaryDark,
  },
  secondary: {
    backgroundColor: COLORS.secondary,
    borderWidth: 1,
    borderColor: COLORS.secondaryDark,
  },
  solid: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  'outline-secondary': {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.secondary,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  success: {
    backgroundColor: COLORS.success,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  warning: {
    backgroundColor: COLORS.warning,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  danger: {
    backgroundColor: COLORS.error,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  link: {
    backgroundColor: 'transparent',
  },
};

const VARIANT_TEXT_MAP: Record<ButtonVariant, string> = {
  primary: COLORS.textInverse,
  secondary: COLORS.textInverse,
  solid: COLORS.textPrimary,
  outline: COLORS.primary,
  'outline-secondary': COLORS.secondary,
  ghost: COLORS.textSecondary,
  success: COLORS.textInverse,
  warning: COLORS.textInverse,
  danger: COLORS.textInverse,
  link: COLORS.primary,
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  disabled: {
    opacity: 0.4,
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
});

export default Button;
