import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: 'low' | 'medium' | 'high';
}

const INTENSITY_MAP = {
  low: {
    backgroundColor: 'rgba(255,255,255,0.40)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  medium: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(255,255,255,0.20)',
  },
  high: {
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderColor: 'rgba(255,255,255,0.30)',
  },
};

export function GlassCard({ children, style, intensity = 'medium' }: GlassCardProps) {
  const intensityStyle = INTENSITY_MAP[intensity];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: intensityStyle.backgroundColor,
          borderColor: intensityStyle.borderColor,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: 'rgba(0,0,0,0.06)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 2,
  },
});

export default GlassCard;
