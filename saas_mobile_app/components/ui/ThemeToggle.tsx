import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <TouchableOpacity
      onPress={toggleTheme}
      activeOpacity={0.7}
      style={[
        styles.button,
        theme === 'dark' && styles.buttonDark,
      ]}
      accessibilityLabel="Toggle theme"
    >
      <Ionicons
        name={theme === 'dark' ? 'sunny' : 'moon'}
        size={20}
        color={theme === 'dark' ? '#475569' : '#708F96'}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
});
