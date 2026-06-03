'use client';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';

const fontSans = Platform.select({ web: 'system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });
const fontDisplay = Platform.select({ web: '"SF Pro Display", system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif', default: 'System' });

interface TenantStatsCardProps {
  value: string | number;
  label: string;
  sublabel?: string;
  color: string;
  icon?: 'ticket' | 'check' | 'alert' | 'clock' | 'trending';
  trend?: 'up' | 'down' | 'neutral';
}

function StatIcon({ type, color }: { type: TenantStatsCardProps['icon']; color: string }) {
  switch (type) {
    case 'ticket':
      return (
        <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
          <Path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <Path d="M13 5v14" />
        </Svg>
      );
    case 'check':
      return (
        <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M20 6L9 17l-5-5" />
        </Svg>
      );
    case 'alert':
      return (
        <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
          <Circle cx="12" cy="12" r="10" />
          <Path d="M12 8v4M12 16h.01" />
        </Svg>
      );
    case 'clock':
      return (
        <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
          <Circle cx="12" cy="12" r="10" />
          <Path d="M12 6v6l4 2" />
        </Svg>
      );
    case 'trending':
      return (
        <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M22 7L13.5 15.5l-4-4L2 20" />
          <Path d="M22 7h-5M22 7v-5" />
        </Svg>
      );
    default:
      return (
        <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <Circle cx="12" cy="12" r="10" />
        </Svg>
      );
  }
}

function TrendArrow({ trend, color }: { trend: 'up' | 'down' | 'neutral'; color: string }) {
  if (trend === 'up') {
    return (
      <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
        <Path d="M18 15l-6-6-6 6" />
      </Svg>
    );
  }
  if (trend === 'down') {
    return (
      <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
        <Path d="M6 9l6 6 6-6" />
      </Svg>
    );
  }
  return null;
}

function getGradientColors(color: string): [string, string] {
  switch (color) {
    case '#FF9F0A':
      return ['rgba(212,160,23,0.15)', 'rgba(212,160,23,0.03)'];
    case '#4CAF50':
      return ['rgba(76,175,80,0.15)', 'rgba(76,175,80,0.03)'];
    case '#E53935':
      return ['rgba(229,57,53,0.15)', 'rgba(229,57,53,0.03)'];
    case '#3B82F6':
      return ['rgba(59,130,246,0.15)', 'rgba(59,130,246,0.03)'];
    case '#8B5CF6':
      return ['rgba(139,92,246,0.15)', 'rgba(139,92,246,0.03)'];
    default:
      return ['rgba(112,143,150,0.15)', 'rgba(112,143,150,0.03)'];
  }
}

function AnimatedCountUp({ value, color }: { value: string | number; color: string }) {
  const numericValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) || 0 : value;
  const suffix = typeof value === 'string' ? value.replace(/[0-9.]/g, '') : '';
  const scale = useSharedValue(0.7);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 150 });
    opacity.value = withTiming(1, { duration: 400 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Text style={[styles.value, { color }]}>
        {numericValue}{suffix}
      </Text>
    </Animated.View>
  );
}

export function TenantStatsCard({
  value,
  label,
  sublabel,
  color,
  icon = 'ticket',
  trend = 'neutral',
}: TenantStatsCardProps) {
  const [gradTop] = getGradientColors(color);
  const accentColor = color;

  return (
    <View style={styles.cardWrapper}>
      <View style={[styles.card, { overflow: 'hidden' }]}>
        {/* Glassmorphism background */}
        <View style={[styles.glassBg, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' }]} />

        {/* Accent gradient overlay */}
        <View
          style={[
            styles.gradientBg,
            { backgroundColor: gradTop },
          ]}
        />

        {/* Decorative accent orb */}
        <View
          style={[
            styles.decorCircle,
            { backgroundColor: `${accentColor}20` },
          ]}
        />

        {/* Content */}
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}25` }]}>
            <StatIcon type={icon} color={accentColor} />
          </View>

          <AnimatedCountUp value={value} color={accentColor} />

          <Text style={[styles.label, { color: 'rgba(255,255,255,0.80)' }]}>{label}</Text>

          {sublabel && (
            <View style={styles.sublabelRow}>
              {trend !== 'neutral' && <TrendArrow trend={trend} color={accentColor} />}
              <Text style={[styles.sublabel, { color: `${accentColor}99` }]}>{sublabel}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    position: 'relative',
    overflow: 'hidden',
    // Soft shadow for glass depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.20,
    shadowRadius: 20,
    elevation: 4,
  },
  glassBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: 1,
  },
  gradientBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    opacity: 0.7,
  },
  decorCircle: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
  },
  value: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 2,
      },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
      },
  sublabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  sublabel: {
    fontSize: 10,
    fontWeight: '500',
      },
});
