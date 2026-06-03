'use client';
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Image } from 'react-native';

// Logo image — the pilot logo with tagline
const LOGO_SOURCE = require('../../assets/images/autopilot-logo-new.png');

interface AnimatedLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

export default function AnimatedLogo({ size = 'md' }: AnimatedLogoProps) {
  const slideIn = useSharedValue(-60);
  const opacity = useSharedValue(0);
  const dotPulse = useSharedValue(1);

  useEffect(() => {
    // Slide in from left + fade in on mount
    slideIn.value = withDelay(100, withTiming(0, { duration: 500, easing: Easing.out(Easing.back(1.2)) }));
    opacity.value = withDelay(100, withTiming(1, { duration: 400 }));

    // Pulse the orange dot
    dotPulse.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [slideIn, opacity, dotPulse]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideIn.value }],
    opacity: opacity.value,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotPulse.value }],
  }));

  // Width map for different sizes
  const widthMap = { sm: 100, md: 140, lg: 180 };
  const w = widthMap[size];

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.logoWrap, containerStyle]}>
        <Image
          source={LOGO_SOURCE}
          style={[styles.logo, { width: w, height: w * (60 / 140) }]}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Orange dot pulses independently */}
      <Animated.View style={[styles.dotWrapper, dotStyle]}>
        {/* dot is embedded in the image, but we animate a subtle glow ring */}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
  },
  logoWrap: {
    alignItems: 'flex-start',
  },
  logo: {
    // dimensions set dynamically via style prop
  },
  dotWrapper: {
    position: 'absolute',
    right: -2,
    top: 4,
  },
});
