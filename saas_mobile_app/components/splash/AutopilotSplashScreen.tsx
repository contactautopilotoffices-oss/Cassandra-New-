import React, { useEffect, useState } from 'react';
import { StyleSheet, Dimensions, Platform, Image as RNImage } from 'react-native';
import { Canvas, Rect, LinearGradient, vec, Group, Image, useImage, ColorMatrix } from '@shopify/react-native-skia';
import Animated, { useSharedValue, useAnimatedStyle, useDerivedValue, withTiming, withDelay, Easing, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

interface Props {
  isReady: boolean;
  onAnimationComplete?: () => void;
}

const INVERT_COLORS = [
  -1,  0,  0, 0, 255,
   0, -1,  0, 0, 255,
   0,  0, -1, 0, 255,
   0,  0,  0, 1, 0,
];

export default function AutopilotSplashScreen({ isReady, onAnimationComplete }: Props) {
  // Shared Animation Values
  const logoOpacity = useSharedValue(0);      // Subtle logo fade-in and fade-out on zoom
  const logoScale = useSharedValue(1);        // Logo scaling up for the "fly-through" effect
  const containerOpacity = useSharedValue(1); // Final exit fade

  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  // Load premium high-res logo asset (Skip Skia hook on Web to prevent WASM crash)
  const logo = Platform.OS === 'web' ? null : useImage(require('../../assets/autopilot-logo-new.png'));

  useEffect(() => {
    // 1. Trigger subtle haptic on initial app boot
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // 2. Start Animation Sequence
    logoOpacity.value = withTiming(1, {
      duration: 1200,
      easing: Easing.out(Easing.quad),
    });

    const hapticTimer = setTimeout(() => {
      // Synchronized with the moment the scan completes and stabilizes
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 1400);

    const minTimeTimer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 2800);

    return () => {
      clearTimeout(hapticTimer);
      clearTimeout(minTimeTimer);
    };
  }, []);

  useEffect(() => {
    // 4. Exit Sequence: Logo zooms in massively (viewer flies towards it)
    if (minTimeElapsed && isReady) {
      // Zoom in massively
      logoScale.value = withTiming(35, { duration: 800, easing: Easing.in(Easing.poly(3)) });
      
      // Fade logo out as it gets close
      logoOpacity.value = withDelay(
        350,
        withTiming(0, { duration: 400, easing: Easing.out(Easing.quad) })
      );

      // Fade container out slightly after
      containerOpacity.value = withDelay(
        500,
        withTiming(0, { duration: 400, easing: Easing.linear }, (finished) => {
          if (finished && onAnimationComplete) {
            runOnJS(onAnimationComplete)();
          }
        })
      );
    }
  }, [minTimeElapsed, isReady, onAnimationComplete]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const animatedLogoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  const logoTransform = useDerivedValue(() => {
    return [{ scale: logoScale.value }];
  });

  // Web Fallback (Skia requires WASM setup on Web)
  if (Platform.OS === 'web') {
    return (
      <Animated.View style={[styles.container, animatedContainerStyle, { justifyContent: 'center', alignItems: 'center' }]}>
        <Animated.View style={animatedLogoStyle}>
          <RNImage 
            source={require('../../assets/autopilot-logo-new.png')} 
            style={{ width: 280, height: 60, resizeMode: 'contain', tintColor: 'white' }} 
          />
        </Animated.View>
      </Animated.View>
    );
  }

  if (!logo) return null;

  return (
    <Animated.View style={[styles.container, animatedContainerStyle]}>
      <Canvas style={styles.canvas}>
        {/* Deep Premium Background */}
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(width / 2, 0)}
            end={vec(width / 2, height)}
            colors={['#0C0E12', '#040506']}
          />
        </Rect>

        {/* Animated Masked Logo Reveal */}
        <Group opacity={logoOpacity} transform={logoTransform} origin={vec(width / 2, height / 2)}>
          <Image
            image={logo}
            x={(width - 280) / 2}
            y={(height - 60) / 2}
            width={280}
            height={60}
            fit="contain"
          >
            {/* Using a color matrix to invert the logo color from black to white since the background is dark */}
            <ColorMatrix matrix={INVERT_COLORS} />
          </Image>
        </Group>

      </Canvas>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#040506',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  canvas: {
    flex: 1,
  },
});
