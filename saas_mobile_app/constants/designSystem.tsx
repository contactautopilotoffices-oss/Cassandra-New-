import React from 'react';
import {
  View,
  Platform,
  UIManager,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// ============================================================================
// TYPES
// ============================================================================

export type StatusType = 'optimal' | 'watch' | 'critical';

export interface StatusPalette {
  bg: string;
  surface: string;
  border: string;
  text: string;
}

export interface SpacingScale {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  '2xl': number;
  '3xl': number;
}

export interface TypographyStyle {
  fontSize: number;
  fontWeight: TextStyle['fontWeight'];
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: TextStyle['textTransform'];
}

export interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  intensity?: number;
  tint?: 'dark' | 'light' | 'default';
  status?: StatusType;
}

export interface GradientPreset {
  colors: readonly [string, string, ...string[]];
  locations: readonly [number, number, ...number[]];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

// ============================================================================
// 1. STATUS COLORS (semantic)
// ============================================================================

export const STATUS_COLORS: Record<StatusType, StatusPalette> = {
  optimal: {
    bg: '#10B981',
    surface: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.30)',
    text: '#6EE7B7',
  },
  watch: {
    bg: '#F59E0B',
    surface: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.30)',
    text: '#FCD34D',
  },
  critical: {
    bg: '#EF4444',
    surface: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.30)',
    text: '#FCA5A5',
  },
};

// ============================================================================
// 2. CARD SURFACES
// ============================================================================

export const CARD_SURFACES = {
  cardBg: 'rgba(255, 255, 255, 0.18)',
  cardBorder: 'rgba(255, 255, 255, 0.25)',
  cardBlur: 20,
  cardRadius: 20,
  cardPadding: 20,
} as const;

// ============================================================================
// 3. SPACING SCALE
// ============================================================================

export const SPACING: SpacingScale = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
};

// ============================================================================
// 4. TYPOGRAPHY
// ============================================================================

export const TYPOGRAPHY: Record<string, TypographyStyle> = {
  displayLarge: {
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 52,
    letterSpacing: -1.5,
  },
  displayMedium: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 36,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 20,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  micro: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
};

// ============================================================================
// 5. MODAL / SHEET BACKDROP
// ============================================================================

export const MODAL_TOKENS = {
  backdropColor: 'rgba(0, 0, 0, 0.65)',
  sheetBg: '#0F1419',
  sheetRadius: 24,
} as const;

// ============================================================================
// 6. PLATFORM-SAFE BLUR — GlassCard component
// ============================================================================

function isBlurNativeAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return !!(
      UIManager.getViewManagerConfig('ExpoBlurView') ||
      UIManager.getViewManagerConfig('ExpoBlur')
    );
  } catch {
    return false;
  }
}

const nativeBlurAvailable = isBlurNativeAvailable();

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  intensity = CARD_SURFACES.cardBlur,
  tint = 'dark',
  status,
}) => {
  const statusPalette = status ? STATUS_COLORS[status] : null;

  const baseStyle: ViewStyle = {
    borderRadius: CARD_SURFACES.cardRadius,
    padding: CARD_SURFACES.cardPadding,
    overflow: 'hidden',
  };

  // iOS with working native blur
  if (Platform.OS === 'ios' && nativeBlurAvailable) {
    const { BlurView } = require('expo-blur');
    return (
      <BlurView
        intensity={intensity}
        tint={tint}
        style={[
          baseStyle,
          {
            backgroundColor: statusPalette
              ? statusPalette.surface
              : CARD_SURFACES.cardBg,
            borderWidth: 1,
            borderColor: statusPalette
              ? statusPalette.border
              : CARD_SURFACES.cardBorder,
          },
          style,
        ]}
      >
        {children}
      </BlurView>
    );
  }

  // Android or fallback — solid translucent background
  const fallbackBg = statusPalette
    ? statusPalette.surface
    : CARD_SURFACES.cardBg;

  const fallbackBorder = statusPalette
    ? statusPalette.border
    : CARD_SURFACES.cardBorder;

  return (
    <View
      style={[
        baseStyle,
        {
          backgroundColor: fallbackBg,
          borderWidth: 1,
          borderColor: fallbackBorder,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

// ============================================================================
// 7. GRADIENT PRESETS for status cards
// ============================================================================

/**
 * Returns a subtle status-tinted gradient preset.
 * The gradient HINTS at status — max 8% opacity tint at top, fading to transparent.
 */
export function statusGradient(status: StatusType): GradientPreset {
  const palette = STATUS_COLORS[status];

  // Extract the base RGB from the bg hex to build a low-opacity tint
  const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const topTint = hexToRgba(palette.bg, 0.08); // 8% opacity — subtle hint

  const preset: GradientPreset = {
    colors: [topTint, 'transparent'],
    locations: [0, 1] as const,
    start: { x: 0.5, y: 0 },
    end: { x: 0.5, y: 1 },
  };

  return preset;
}

/** Reusable StatusGradient wrapper component */
export const StatusGradient: React.FC<{
  status: StatusType;
  children: React.ReactNode;
  style?: ViewStyle;
}> = ({ status, children, style }) => {
  const preset = statusGradient(status);
  return (
    <LinearGradient
      colors={preset.colors}
      locations={preset.locations}
      start={preset.start}
      end={preset.end}
      style={[{ borderRadius: CARD_SURFACES.cardRadius }, style]}
    >
      {children}
    </LinearGradient>
  );
};

// ============================================================================
// BONUS: Convenience StyleSheet for quick reference
// ============================================================================

export const designStyles = StyleSheet.create({
  glassCard: {
    backgroundColor: CARD_SURFACES.cardBg,
    borderRadius: CARD_SURFACES.cardRadius,
    padding: CARD_SURFACES.cardPadding,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
  },
  sheet: {
    backgroundColor: MODAL_TOKENS.sheetBg,
    borderTopLeftRadius: MODAL_TOKENS.sheetRadius,
    borderTopRightRadius: MODAL_TOKENS.sheetRadius,
  },
  backdrop: {
    backgroundColor: MODAL_TOKENS.backdropColor,
    ...StyleSheet.absoluteFillObject,
  },
});
