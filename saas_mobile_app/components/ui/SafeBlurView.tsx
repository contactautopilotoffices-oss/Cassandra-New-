import React from 'react';
import { View, Platform, UIManager } from 'react-native';

interface SafeBlurViewProps {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  style?: any;
  children?: React.ReactNode;
  blurReductionFactor?: number;
  experimentalBlurMethod?: string;
  [key: string]: any;
}

function getFallbackBackground(tint: string = 'default', intensity: number = 50): string {
  const alpha = Math.min(intensity / 100, 0.85);
  if (tint === 'dark') return `rgba(18, 18, 22, ${Math.max(alpha, 0.6)})`;
  if (tint === 'light') return `rgba(255, 255, 255, ${Math.max(alpha, 0.5)})`;
  return `rgba(40, 40, 45, ${Math.max(alpha, 0.5)})`;
}

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

export default function SafeBlurView({
  intensity = 50,
  tint = 'default',
  style,
  children,
  ...props
}: SafeBlurViewProps) {
  const shouldUseNative = isBlurNativeAvailable();

  if (shouldUseNative) {
    const { BlurView } = require('expo-blur');
    return (
      <BlurView intensity={intensity} tint={tint} style={style} {...props}>
        {children}
      </BlurView>
    );
  }

  // Fallback: solid semi-transparent background that mimics blur
  return (
    <View
      style={[{ backgroundColor: getFallbackBackground(tint, intensity) }, style]}
      {...props}
    >
      {children}
    </View>
  );
}
