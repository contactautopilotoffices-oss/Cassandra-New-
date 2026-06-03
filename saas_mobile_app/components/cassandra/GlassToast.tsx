/**
 * GlassToast — Error / success / info toast with left border accent
 *
 * Drop-in replacement for react-native-toast-message custom renderer.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius } from '@/constants/cassandra-theme';

type ToastType = 'success' | 'error' | 'info';

interface GlassToastProps {
  text1: string;
  text2?: string;
  type?: ToastType;
}

const borderColors: Record<ToastType, string> = {
  success: Colors.success,
  error: Colors.error,
  info: Colors.info,
};

export const GlassToast: React.FC<GlassToastProps> = ({ text1, text2, type = 'info' }) => (
  <View style={[styles.container, { borderLeftColor: borderColors[type] }]}>
    <Text style={styles.title}>{text1}</Text>
    {!!text2 && <Text style={styles.body}>{text2}</Text>}
  </View>
);

const styles = StyleSheet.create({
  container: {
    width: '90%',
    alignSelf: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: 16,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  title: {
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: 15,
  },
  body: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
});

export default GlassToast;
