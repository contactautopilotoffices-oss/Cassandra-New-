'use client';
/**
 * DashboardTile — Atmospheric Glass Tile structure
 *
 * All tiles share a translucent glass background, border, blur, and shadow.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { LinearGradient } from 'expo-linear-gradient';

export type TileVariant = 'tickets' | 'checklist' | 'health' | 'energy';

const TILE_ICON: Record<TileVariant, keyof typeof Ionicons.glyphMap> = {
  tickets: 'ticket',
  checklist: 'checkbox-outline',
  health: 'heart',
  energy: 'flash',
};

// Variant specific gradients for the tile backgrounds (to match the second image where cards have distinct colors)
const VARIANT_GRADIENTS: Record<TileVariant, [string, string]> = {
  tickets: ['rgba(168, 50, 70, 0.35)', 'rgba(25, 20, 50, 0.4)'],
  checklist: ['rgba(50, 168, 100, 0.35)', 'rgba(25, 20, 50, 0.4)'],
  health: ['rgba(180, 40, 50, 0.4)', 'rgba(25, 20, 50, 0.4)'],
  energy: ['rgba(180, 160, 40, 0.35)', 'rgba(25, 20, 50, 0.4)'],
};

const fontSans = Platform.OS === 'ios' ? 'System' : 'sans-serif';

interface DashboardTileProps {
  label: string;
  variant: TileVariant;
  children: React.ReactNode;
  onPress?: () => void;
  delay?: number;
  style?: any;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function DashboardTile({
  label,
  variant,
  children,
  onPress,
  delay = 0,
  style,
}: DashboardTileProps) {
  const pressScale = useSharedValue(1);
  const yOffset = useSharedValue(24);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 600 });
      yOffset.value = withSpring(0, { damping: 20, stiffness: 180 });
    }, delay * 1000);
    return () => clearTimeout(timeout);
  }, [delay, opacity, yOffset]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: yOffset.value },
      { scale: pressScale.value },
    ],
  }));

  const handlePressIn = () => {
    pressScale.value = withSpring(0.995, { damping: 15, stiffness: 300 });
  };
  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };
  const handleHoverIn = () => {
    pressScale.value = withSpring(1.005, { damping: 15, stiffness: 300 });
  };
  const handleHoverOut = () => {
    pressScale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const iconName = TILE_ICON[variant];

  // We layer a BlurView (as the glass) and a LinearGradient (for the color tint) inside the tile
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={Platform.OS === 'web' ? handleHoverIn : undefined}
      onHoverOut={Platform.OS === 'web' ? handleHoverOut : undefined}
      style={[animatedStyle, styles.tileWrapper, style]}
    >
      <SafeBlurView intensity={40} style={styles.blurLayer} tint="dark">
        <LinearGradient
          colors={VARIANT_GRADIENTS[variant]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={styles.tileContent}>
          {/* Label row with colored icon badge */}
          <View style={styles.labelRow}>
            <View style={styles.iconBadge}>
              <Ionicons
                name={iconName}
                size={14}
                color="#FFFFFF"
              />
            </View>
            <Text style={styles.labelText}>{label}</Text>
          </View>

          {/* Content */}
          <View style={styles.content}>{children}</View>
        </View>
      </SafeBlurView>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  tileWrapper: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 40,
    elevation: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  blurLayer: {
    flex: 1,
  },
  tileContent: {
    padding: 20,
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  labelText: {
        fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 2, // approximation for 0.18em
    textTransform: 'uppercase',
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});
