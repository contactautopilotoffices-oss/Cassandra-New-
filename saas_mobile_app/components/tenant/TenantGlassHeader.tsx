'use client';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useWeather, WeatherIconType, AuroraColors } from '@/hooks/useWeather';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const fontSans = Platform.select({ web: 'system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });
const fontDisplay = Platform.select({ web: '"SF Pro Display", system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });

// ---------------------------------------------------------------------
// Weather Icon SVG Components
// ---------------------------------------------------------------------
function SunIcon({ size = 32, color = '#FFD700' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="5" fill={color} opacity="0.9" />
      {/* Rays */}
      <Path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

function MoonIcon({ size = 28, color = '#C4D4FF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        fill={color}
        opacity="0.85"
        stroke={color}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PartlyCloudyIcon({ size = 28, color = '#E8D080' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="9" cy="10" r="4" fill={color} opacity="0.8" />
      <Path d="M3 18a4 4 0 0 1 .5-8 5 5 0 0 1 10.3-1.5A3.5 3.5 0 0 1 20 16h1a3 3 0 0 1 0 6H3a3 3 0 0 1 0-6" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

function CloudyIcon({ size = 28, color = '#A8B8D0' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 18a4 4 0 0 1 .5-8 5 5 0 0 1 10.3-1.5A3.5 3.5 0 0 1 20 16h1a3 3 0 0 1 0 6H3a3 3 0 0 1 0-6" fill={color} opacity="0.4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

function RainyIcon({ size = 28, color = '#80A8D8' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 14a4 4 0 0 1 .5-8 5 5 0 0 1 10.3-1.5A3.5 3.5 0 0 1 20 12h1a3 3 0 0 1 0 6H3a3 3 0 0 1 0-6" fill={color} opacity="0.4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M8 19v2M12 19v2M16 19v2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

function WeatherIconDisplay({ icon, size = 26 }: { icon: WeatherIconType; size?: number }) {
  switch (icon) {
    case 'sun': return <SunIcon size={size} />;
    case 'moon': return <MoonIcon size={size} />;
    case 'partly-cloudy': return <PartlyCloudyIcon size={size} />;
    case 'cloudy': return <CloudyIcon size={size} />;
    case 'rainy': return <RainyIcon size={size} />;
    default: return <SunIcon size={size} />;
  }
}

// ---------------------------------------------------------------------
// Animated pulsing dot
// ---------------------------------------------------------------------
function PulsingDot({ color }: { color: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.8);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.8, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.dot, { backgroundColor: color }, dotStyle]} />
  );
}

// ---------------------------------------------------------------------
// Main Header Component
// ---------------------------------------------------------------------
interface TenantGlassHeaderProps {
  propertyName?: string;
  userName?: string;
  isSuperTenant?: boolean;
}

export function TenantGlassHeader({
  propertyName = 'Property',
  userName = 'Client',
  isSuperTenant,
}: TenantGlassHeaderProps) {
  const { weather, loading } = useWeather();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const themeColors = Colors[theme];

  // Build aurora colors: weather drives the look, theme ensures readability
  const auroraColors: AuroraColors = weather?.auroraColors ?? (() => {
    if (isDark) {
      // Dark mode fallback: deep navy/teal atmosphere
      return {
        primaryTop: '#0a1628',
        primaryMid: '#0f1f38',
        primaryBottom: '#0a1628',
        orb1: 'rgba(112,143,150,0.25)',
        orb2: 'rgba(112,143,150,0.15)',
        orb3: 'rgba(112,143,150,0.10)',
        textPrimary: isDark ? themeColors.textPrimary : '#FFFFFF',
        textSecondary: isDark ? themeColors.textSecondary : 'rgba(255,255,255,0.75)',
        glassBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)',
        glassBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)',
      };
    }
    // Light mode fallback
    return {
      primaryTop: '#1a1a3e',
      primaryMid: '#2d1b4e',
      primaryBottom: '#f4845f',
      orb1: 'rgba(255,140,80,0.45)',
      orb2: 'rgba(255,100,120,0.30)',
      orb3: 'rgba(255,200,100,0.25)',
      textPrimary: '#FFFFFF',
      textSecondary: 'rgba(255,255,255,0.75)',
      glassBg: 'rgba(255,255,255,0.12)',
      glassBorder: 'rgba(255,255,255,0.18)',
    };
  })();

  const colors = weather?.auroraColors ?? auroraColors;

  const greeting = weather?.greeting ?? 'Hello';
  const weatherIcon = weather?.weatherIcon ?? 'sun';
  const temperature = weather?.temperature;

  // Pixel font for property name — render each character in a grid cell
  const renderPixelPropertyName = () => {
    const name = propertyName.toUpperCase();
    return (
      <Text
        style={[
          styles.pixelPropertyName,
          { color: isDark ? themeColors.textPrimary : colors.textPrimary },
        ]}
        numberOfLines={1}
      >
        {name}
      </Text>
    );
  };

  return (
    <Animated.View
      entering={FadeIn.duration(600)}
      style={[styles.container, {
        // In dark mode use theme surface; in light mode use weather aurora mid
        backgroundColor: isDark ? themeColors.surface : colors.primaryMid,
      }]}
    >
      {/* Subtle glass header card */}
      <View style={[styles.glassCard, {
        backgroundColor: isDark ? themeColors.glassBg : colors.glassBg,
        borderColor: isDark ? themeColors.glassBorder : colors.glassBorder,
      }]}>
        {/* Top row: Greeting + Weather */}
        <View style={styles.topRow}>
          <View style={styles.greetingCol}>
            <Text style={[styles.greetingLabel, { color: isDark ? themeColors.textSecondary : colors.textSecondary }]}>
              {greeting}
            </Text>
            <Text style={[styles.userName, { color: isDark ? themeColors.textPrimary : colors.textPrimary }]}>
              {userName}
            </Text>
          </View>

          {/* Weather widget */}
          <View style={[styles.weatherWidget, {
            backgroundColor: isDark ? themeColors.glassBg : colors.glassBg,
            borderColor: isDark ? themeColors.glassBorder : colors.glassBorder,
          }]}>
            <WeatherIconDisplay icon={weatherIcon as any} size={26} />
            {temperature !== null && (
              <Text style={[styles.temperature, { color: isDark ? themeColors.textPrimary : colors.textPrimary }]}>
                {temperature}°
              </Text>
            )}
          </View>
        </View>

        {/* Property name in pixel font */}
        <View style={styles.propertyRow}>
          <View style={[styles.propertyBadge, {
            backgroundColor: isDark ? themeColors.glassBg : colors.glassBg,
            borderColor: isDark ? themeColors.glassBorder : colors.glassBorder,
          }]}>
            <PulsingDot color={weather?.isDaylight ? '#FFD700' : '#C4D4FF'} />
            {renderPixelPropertyName()}
          </View>

          {weather?.locationName && (
            <Text style={[styles.locationName, { color: isDark ? themeColors.textSecondary : colors.textSecondary }]}>
              {weather.locationName}
            </Text>
          )}
        </View>

        {/* Subtle wave divider */}
        <View style={styles.waveDivider}>
          <Svg width={SCREEN_WIDTH - 40} height="8" viewBox={`0 0 ${SCREEN_WIDTH - 40} 8`} preserveAspectRatio="none">
            <Path
              d={`M0,4 Q${(SCREEN_WIDTH - 40) * 0.25},0 ${(SCREEN_WIDTH - 40) * 0.5},4 Q${(SCREEN_WIDTH - 40) * 0.75},8 ${SCREEN_WIDTH - 40},4`}
              fill="none"
              stroke={isDark ? themeColors.glassBorder : colors.glassBorder}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </Svg>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  glassCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    // Soft ambient shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  greetingCol: {
    flex: 1,
  },
  greetingLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
      },
  userName: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
      },
  weatherWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  temperature: {
    fontSize: 20,
    fontWeight: '700',
        letterSpacing: -0.3,
  },
  propertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  propertyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  pixelPropertyName: {
    fontSize: 11,
        letterSpacing: 1.5,
    fontWeight: '400',
  },
  locationName: {
    fontSize: 12,
      },
  waveDivider: {
    alignItems: 'center',
    marginTop: 4,
  },
});
