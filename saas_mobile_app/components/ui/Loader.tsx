import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';

type LoaderSize = 'sm' | 'md' | 'lg' | 'xl';

interface LoaderProps {
  size?: LoaderSize;
  text?: string;
  style?: ViewStyle;
  color?: string;
}

const SIZE_MAP: Record<LoaderSize, number> = {
  sm: 24,
  md: 36,
  lg: 56,
  xl: 80,
};

const ACTIVITY_SIZE: Record<LoaderSize, 'small' | 'large'> = {
  sm: 'small',
  md: 'small',
  lg: 'large',
  xl: 'large',
};

export default function Loader({ size = 'md', text, style, color = '#708F96' }: LoaderProps) {
  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator
        size={ACTIVITY_SIZE[size]}
        color={color}
        style={{ width: SIZE_MAP[size], height: SIZE_MAP[size] }}
      />
      {text && <Text style={styles.text}>{text}</Text>}
    </View>
  );
}

export function GradientLoader({ size = 'md', text }: { size?: LoaderSize; text?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator
        size={ACTIVITY_SIZE[size]}
        color="#708F96"
        style={{ width: SIZE_MAP[size], height: SIZE_MAP[size] }}
      />
      {text && <Text style={[styles.text, { opacity: 0.8 }]}>{text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
});
