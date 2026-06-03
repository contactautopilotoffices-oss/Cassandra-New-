import React, { createContext, useContext, useState, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';

type Theme = 'light' | 'dark';

// ThemeContext colors extend the Colors.ts design system
// FIX: was using #708F96 (violet) instead of brand color #708F96 (teal)
type ThemeColors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  primary: string;
  primaryDark: string;
  secondary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  success: string;
  warning: string;
  error: string;
  info: string;
};

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
  colors: ThemeColors;
}

const lightColors: ThemeColors = {
  background: Colors.light.background,
  surface: Colors.light.surface,
  surfaceElevated: Colors.light.surfaceElevated ?? '#F8FAFC',
  border: Colors.light.border,
  primary: Colors.light.primary,      // was #708F96 — fixed to brand #708F96
  primaryDark: Colors.light.primaryDark,
  secondary: Colors.light.secondary,
  textPrimary: Colors.light.textPrimary,
  textSecondary: Colors.light.textSecondary,
  textTertiary: Colors.light.textTertiary ?? Colors.light.textSecondary,
  textInverse: '#FFFFFF',
  success: Colors.light.success,
  warning: Colors.light.warning,
  error: Colors.light.error,
  info: Colors.light.info,
};

const darkColors: ThemeColors = {
  background: Colors.dark.background,
  surface: Colors.dark.surface,
  surfaceElevated: Colors.dark.surfaceElevated ?? '#1C2128',
  border: Colors.dark.border,
  primary: Colors.dark.primary,        // was #708F96 — fixed to brand #708F96
  primaryDark: Colors.dark.primaryDark,
  secondary: Colors.dark.secondary,
  textPrimary: Colors.dark.textPrimary,
  textSecondary: Colors.dark.textSecondary,
  textTertiary: Colors.dark.textTertiary ?? Colors.dark.textSecondary,
  textInverse: '#0D1117',
  success: Colors.dark.success,
  warning: Colors.dark.warning,
  error: Colors.dark.error,
  info: Colors.dark.info,
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = '@autopilot_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always force dark theme per requirements
  const theme: Theme = 'dark';
  const isDark = true;
  const colors = darkColors;

  const toggleTheme = useCallback(() => {
    // No-op since theme is forced to dark globally
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export { lightColors, darkColors };
