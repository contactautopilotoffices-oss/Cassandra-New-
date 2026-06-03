import React from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';

interface LabelProps {
  children: React.ReactNode;
  style?: TextStyle;
  disabled?: boolean;
}

export const Label: React.FC<LabelProps> = ({ children, style, disabled }) => (
  <Text style={[styles.label, disabled && styles.disabled, style]}>{children}</Text>
);

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 6,
    letterSpacing: -0.12,
  },
  disabled: {
    opacity: 0.4,
  },
});

export default Label;
