/**
 * Cassandra Theme — Perplexity-inspired design tokens
 *
 * Deep radial gradient backgrounds, electric violet accents,
 * glassmorphism cards, generous whitespace.
 */

import { Dimensions } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export const Colors = {
  // Backgrounds
  bgDeep: '#0B0F19',
  bgSlate: '#1A1F3C',
  bgCard: 'rgba(255,255,255,0.06)',
  bgCardHover: 'rgba(255,255,255,0.10)',

  // Accents
  violet: '#8B5CF6',
  violetLight: '#A78BFA',
  indigo: '#6366F1',
  cyan: '#22D3EE',
  cyanGlow: 'rgba(34,211,238,0.3)',

  // Semantic
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.70)',
  textMuted: 'rgba(255,255,255,0.45)',
  textDisabled: 'rgba(255,255,255,0.25)',

  // Borders
  borderGlass: 'rgba(255,255,255,0.10)',
  borderGlassStrong: 'rgba(255,255,255,0.15)',

  // Orb states
  orbIdle: '#8B5CF6',
  orbListening: '#22D3EE',
  orbProcessing: '#A78BFA',
  orbSpeaking: '#6366F1',
  orbError: '#EF4444',
};

export const Gradients = {
  // Main background
  radialBg: ['#1A1F3C', '#0B0F19'] as [string, string],

  // Button
  primary: ['#8B5CF6', '#6366F1'] as [string, string],
  primaryHover: ['#A78BFA', '#818CF8'] as [string, string],

  // Sonar ring (listening)
  sonar: ['rgba(34,211,238,0.4)', 'rgba(34,211,238,0)'] as [string, string],

  // Error
  error: ['#EF4444', '#DC2626'] as [string, string],
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const Typography = {
  hero: { fontSize: 32, fontWeight: '500' as const, letterSpacing: -0.8 },
  h1: { fontSize: 24, fontWeight: '600' as const, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '600' as const },
  h3: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodySmall: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400' as const },
  mono: { fontSize: 13, fontWeight: '400' as const, fontFamily: 'monospace' },
};

export const Shadows = {
  orb: {
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
};

export const Layout = {
  screenW: SCREEN_W,
  screenH: SCREEN_H,
  safeTop: 60,
  safeBottom: 34,
  modalHeaderH: 80,
};

export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export const OrbColors: Record<OrbState, string> = {
  idle: Colors.orbIdle,
  listening: Colors.orbListening,
  processing: Colors.orbProcessing,
  speaking: Colors.orbSpeaking,
  error: Colors.orbError,
};
