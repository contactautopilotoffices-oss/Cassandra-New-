// Autopilot Mobile Design System
// Apple-inspired, luxurious, blends with light & dark mode
// Primary brand: #708F96 preserved

// ============================================================
// Core Palette
// ============================================================

// ---- Primary Brand (PRESERVED) ----
const PRIMARY = '#708F96';       // Slate Blue-Green — brand actions, active states
const PRIMARY_LIGHT = '#8AA5AC';
const PRIMARY_DARK = '#5A737A';

// ---- New Secondary (replaces gold/wheat) ----
const SECONDARY = '#475569';     // Slate grey — luxurious, works in both modes
const SECONDARY_LIGHT = '#64748B';
const SECONDARY_DARK = '#334155';

// ---- Light Theme ----
const lightText = '#1D1D1F';     // Apple near-black
const lightBackground = '#F8FAFC';
const lightSurface = '#FFFFFF';
const lightCard = '#FFFFFF';
const lightBorder = '#E8E8ED';   // Apple border

// ---- Dark Theme ----
const darkText = '#E6EBEE';
const darkBackground = '#121212';  // Neutral deep dark — no blue tint
const darkSurface = '#1E1E1E';     // Elevated surface
const darkCard = '#1E1E1E';
const darkBorder = '#2C2C2E';      // Subtle border

// ---- Apple System Status Colors ----
const SUCCESS = '#34C759';
const WARNING = '#FF9F0A';
const ERROR = '#FF3B30';
const INFO = '#2997FF';

// ---- Energy Utilities ----
const UTILITY_GRID = '#FF9F0A';
const UTILITY_DIESEL = '#34C759';

// ---- Priority Colors ----
const PRIORITY_URGENT = '#FF3B30';
const PRIORITY_HIGH = '#708F96';
const PRIORITY_MEDIUM = '#FF9F0A';
const PRIORITY_LOW = '#94A3B8';

// ============================================================
// Colors — theme-aware object
// ============================================================
export const Colors = {
  light: {
    // Core text & background
    text: lightText,
    background: lightBackground,
    tint: PRIMARY,
    // Tab bar
    tabIconDefault: '#9CA3AF',
    tabIconSelected: PRIMARY,
    tabBarBackground: lightSurface,
    tabBarBorder: lightBorder,
    // Brand colors
    primary: PRIMARY,
    primaryLight: PRIMARY_LIGHT,
    primaryDark: PRIMARY_DARK,
    secondary: SECONDARY,
    secondaryLight: SECONDARY_LIGHT,
    secondaryDark: SECONDARY_DARK,
    // Semantic status — Apple system colors
    success: SUCCESS,
    successBg: 'rgba(52,199,89,0.10)',
    successBorder: 'rgba(52,199,89,0.20)',
    warning: WARNING,
    warningBg: 'rgba(255,159,10,0.10)',
    warningBorder: 'rgba(255,159,10,0.20)',
    error: ERROR,
    errorBg: 'rgba(255,59,48,0.10)',
    errorBorder: 'rgba(255,59,48,0.20)',
    info: INFO,
    infoBg: 'rgba(41,151,255,0.10)',
    infoBorder: 'rgba(41,151,255,0.20)',
    // UI Surfaces
    border: lightBorder,
    card: lightCard,
    surface: lightSurface,
    // Text hierarchy — Apple-style
    textPrimary: '#1D1D1F',
    textSecondary: '#6B7280',
    textTertiary: '#86868B',
    textMuted: '#9CA3AF',
    // Glass — more transparent
    glassBg: 'rgba(255,255,255,0.72)',
    glassBorder: 'rgba(255,255,255,0.20)',
    // Priority colors
    priorityUrgent: PRIORITY_URGENT,
    priorityUrgentBg: 'rgba(255,59,48,0.10)',
    priorityHigh: PRIORITY_HIGH,
    priorityHighBg: 'rgba(112,143,150,0.12)',
    priorityMedium: PRIORITY_MEDIUM,
    priorityMediumBg: 'rgba(255,159,10,0.10)',
    priorityLow: PRIORITY_LOW,
    priorityLowBg: 'rgba(148,163,184,0.12)',
    // Energy utilities
    utilityGrid: UTILITY_GRID,
    utilityDiesel: UTILITY_DIESEL,
    // Sidebar
    sidebar: '#F8FAFC',
    sidebarActive: PRIMARY,
    sidebarActiveText: '#FFFFFF',
    sidebarInactive: '#6B7280',
    // Surface overlays
    surfaceElevated: 'rgba(255,255,255,0.95)',
    surfaceOverlay: 'rgba(250,251,252,0.95)',
    // Shadows — Apple subtle
    shadowColor: 'rgba(0,0,0,0.06)',
    // Dividers
    divider: 'rgba(232,232,237,0.60)',
  },
  dark: {
    // Core text & background
    text: darkText,
    background: darkBackground,
    tint: PRIMARY_LIGHT,
    // Tab bar
    tabIconDefault: '#6B7280',
    tabIconSelected: PRIMARY_LIGHT,
    tabBarBackground: darkSurface,
    tabBarBorder: darkBorder,
    // Brand colors
    primary: PRIMARY,
    primaryLight: PRIMARY_LIGHT,
    primaryDark: PRIMARY_DARK,
    secondary: SECONDARY,
    secondaryLight: SECONDARY_LIGHT,
    secondaryDark: SECONDARY_DARK,
    // Semantic status — Apple system colors (same in dark)
    success: SUCCESS,
    successBg: 'rgba(52,199,89,0.15)',
    successBorder: 'rgba(52,199,89,0.25)',
    warning: WARNING,
    warningBg: 'rgba(255,159,10,0.15)',
    warningBorder: 'rgba(255,159,10,0.25)',
    error: ERROR,
    errorBg: 'rgba(255,59,48,0.15)',
    errorBorder: 'rgba(255,59,48,0.25)',
    info: INFO,
    infoBg: 'rgba(41,151,255,0.15)',
    infoBorder: 'rgba(41,151,255,0.25)',
    // UI Surfaces
    border: darkBorder,
    card: darkCard,
    surface: darkSurface,
    // Text hierarchy
    textPrimary: 'rgba(230,235,238,0.95)',
    textSecondary: 'rgba(230,235,238,0.70)',
    textTertiary: 'rgba(230,235,238,0.50)',
    textMuted: 'rgba(230,235,238,0.40)',
    // Glass — dark mode transparent
    glassBg: 'rgba(30,30,30,0.72)',
    glassBorder: 'rgba(255,255,255,0.08)',
    // Priority colors
    priorityUrgent: PRIORITY_URGENT,
    priorityUrgentBg: 'rgba(255,59,48,0.15)',
    priorityHigh: PRIORITY_HIGH,
    priorityHighBg: 'rgba(112,143,150,0.15)',
    priorityMedium: PRIORITY_MEDIUM,
    priorityMediumBg: 'rgba(255,159,10,0.15)',
    priorityLow: PRIORITY_LOW,
    priorityLowBg: 'rgba(148,163,184,0.12)',
    // Energy utilities
    utilityGrid: UTILITY_GRID,
    utilityDiesel: UTILITY_DIESEL,
    // Sidebar
    sidebar: '#151B2B',
    sidebarActive: PRIMARY,
    sidebarActiveText: '#FFFFFF',
    sidebarInactive: 'rgba(230,235,238,0.70)',
    // Surface overlays
    surfaceElevated: 'rgba(28,28,30,0.95)',
    surfaceOverlay: 'rgba(15,23,42,0.95)',
    // Shadows
    shadowColor: 'rgba(0,0,0,0.30)',
    // Dividers
    divider: 'rgba(56,56,58,0.60)',
  },
};

// ============================================================
// Dashboard Background Styles
// ============================================================
export const DASHBOARD_BACKGROUNDS = {
  sunny: {
    label: 'Sunny',
    image: require('@/assets/images/weather-sun.png'),
  },
  night: {
    label: 'Night',
    image: require('@/assets/images/weather-moon.png'),
  },
  midnight: {
    label: 'Night',
    image: require('@/assets/images/weather-moon.png'),
  },
  cloudy: {
    label: 'Cloudy',
    image: require('@/assets/images/weather-cloud.png'),
  },
  raining: {
    label: 'Raining',
    image: require('@/assets/images/weather-rain.png'),
  },
} as const;

export type DashboardBgKey = keyof typeof DASHBOARD_BACKGROUNDS;

// ============================================================
// DesignTokens — raw values for direct use
// ============================================================
export const DesignTokens = {
  // ---- Primary Brand (PRESERVED) ----
  primary: PRIMARY,
  primaryLight: PRIMARY_LIGHT,
  primaryDark: PRIMARY_DARK,

  // ---- New Secondary ----
  secondary: SECONDARY,
  secondaryLight: SECONDARY_LIGHT,
  secondaryDark: SECONDARY_DARK,

  // ---- Status ----
  success: SUCCESS,
  warning: WARNING,
  error: ERROR,
  info: INFO,

  // ---- Energy Utilities ----
  utilityGrid: UTILITY_GRID,
  utilityDiesel: UTILITY_DIESEL,

  // ---- Priority ----
  priorityUrgent: PRIORITY_URGENT,
  priorityHigh: PRIORITY_HIGH,
  priorityMedium: PRIORITY_MEDIUM,
  priorityLow: PRIORITY_LOW,

  // ---- Light Theme Surfaces ----
  lightBackground: lightBackground,
  lightSurface: lightSurface,
  lightCard: lightCard,
  lightBorder: lightBorder,
  lightText: lightText,

  // ---- Dark Theme Surfaces ----
  darkBackground: darkBackground,
  darkSurface: darkSurface,
  darkCard: darkCard,
  darkBorder: darkBorder,
  darkText: darkText,

  // ---- Glass Effects (more transparent) ----
  glassBgLight: 'rgba(255,255,255,0.72)',
  glassBorderLight: 'rgba(255,255,255,0.20)',
  glassBgDark: 'rgba(30,30,30,0.72)',
  glassBorderDark: 'rgba(255,255,255,0.08)',

  // ---- Card Surface ----
  cardSurfaceLight: 'linear-gradient(135deg, rgba(255,255,255,0.85), rgba(245,247,249,0.75))',
  cardRadius: 22,      // Apple Weather-style large radius
  cardShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },

  // ---- Sidebar ----
  sidebarLight: '#F8FAFC',
  sidebarDark: '#151B2B',
  sidebarActive: PRIMARY,
  sidebarActiveText: '#FFFFFF',

  // ---- Spacing (Apple-inspired) ----
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    huge: 48,
  },

  // ---- Shadows (Apple subtle) ----
  shadowSm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  shadowMd: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  shadowLg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  shadowXl: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 6,
  },

  // ---- Typography ----
  fontDisplay: 'Poppins',
  fontBody: 'Urbanist',
  h1: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.4 },
  h2: { fontSize: 28, fontWeight: '600' as const, letterSpacing: -0.3 },
  h3: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 17, fontWeight: '400' as const, letterSpacing: -0.2 },
  caption: { fontSize: 13, fontWeight: '400' as const, letterSpacing: -0.1 },

  // ---- Layout ----
  cardPadding: 20,
  sectionGap: 16,
  cardGap: 12,
  contentPadding: 16,
  badgeRadius: 999,
};

export default Colors;
