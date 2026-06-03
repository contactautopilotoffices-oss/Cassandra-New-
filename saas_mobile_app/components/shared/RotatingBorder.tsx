import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing, 
  cancelAnimation 
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

interface RotatingBorderProps {
  isDark: boolean;
  width: number;
  height: number;
  speed?: number;
  opacity?: number;
  borderWidth?: number;
  borderRadius?: number;
}

export function RotatingBorder({ 
  isDark, 
  width, 
  height, 
  speed = 4000, 
  opacity = 1,
  borderWidth = 2,
  borderRadius = 20
}: RotatingBorderProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: speed, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(rotation);
  }, [speed]);

  const animRotate = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  // Ensure the square is large enough to cover the diagonal even when rotating
  const rotSize = Math.sqrt(width ** 2 + height ** 2) * 1.25;

  return (
    <View 
      pointerEvents="none" 
      style={[
        StyleSheet.absoluteFill, 
        { borderRadius: borderRadius, overflow: 'hidden', opacity }
      ]}
    >
      <Animated.View style={[
        { 
          position: 'absolute', 
          width: rotSize, 
          height: rotSize, 
          top: -(rotSize - height) / 2, 
          left: -(rotSize - width) / 2 
        },
        animRotate,
      ]}>
        <LinearGradient
          colors={[
            '#A855F7', // Purple
            '#FFFFFF', // White Highlight
            '#6366F1', // Indigo
            '#3B82F6', // Blue
            '#FFFFFF', // White Highlight
            '#06B6D4', // Cyan
            '#10B981', // Emerald
            '#A855F7'  // Seamless loop
          ]}
          start={{ x: 0, y: 0 }} 
          end={{ x: 1, y: 1 }}
          style={{ width: rotSize, height: rotSize }}
        />
      </Animated.View>

      {/* Mask: shows only the border ring */}
      <View style={{
        position: 'absolute',
        top: borderWidth, 
        left: borderWidth, 
        right: borderWidth, 
        bottom: borderWidth,
        borderRadius: borderRadius - borderWidth,
        backgroundColor: isDark ? 'rgba(15,23,42,1)' : 'rgba(255,255,255,1)',
      }} />
    </View>
  );
}
