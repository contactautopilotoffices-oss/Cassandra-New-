/**
 * GradientButton — Violet→Indigo CTA with loading state
 */

import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients, Radius } from '@/constants/cassandra-theme';

interface GradientButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: object;
}

export const GradientButton: React.FC<GradientButtonProps> = ({
  onPress,
  children,
  loading = false,
  disabled = false,
  style,
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.8}
    disabled={disabled || loading}
    style={[styles.wrapper, style]}
  >
    <LinearGradient
      colors={disabled ? ['#4B5563', '#374151'] : Gradients.primary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={styles.text}>{children}</Text>
      )}
    </LinearGradient>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 12,
  },
  gradient: {
    paddingVertical: 16,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
});

export default GradientButton;
