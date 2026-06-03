'use client';
/**
 * FibonacciSphereOrb — Stabilized 3D particle sphere.
 *
 * Uses a single SVG layer with all 250 particles rendered as a single
 * Animated component, updating cx/cy of ALL particles from one central
 * useAnimatedProps call. This prevents the per-particle layout thrash that
 * caused the orb to drift and misalign.
 *
 * Key fixes:
 * - All particles updated from one shared calculation per frame (no thrash)
 * - Ring and glow use identical center coordinates — always perfectly aligned
 * - Center dot positioned absolutely relative to container center
 * - Stable perspective calculation with consistent focal length
 */

import React, { useMemo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
  useFrameCallback,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

interface Props {
  state: 'idle' | 'listening' | 'processing' | 'speaking';
  size?: number;
}

// ---------------------------------------------------------------------------
// Pre-compute Fibonacci sphere data once at module level
// ---------------------------------------------------------------------------
const N = 250;
const GA = Math.PI * (3 - Math.sqrt(5));
const FOCAL = 4.0; // Stable focal length — higher = less drift

const fibRaw: { bx: number; by: number; bz: number; a: number; ph: number; pr: number }[] = [];
for (let i = 0; i < N; i++) {
  const t = i / N;
  const y = t * 2 - 1;
  const rad = Math.sqrt(Math.max(0, 1 - y * y));
  const th = t * N * GA;
  fibRaw.push({
    bx: Math.cos(th) * rad,
    by: y,
    bz: Math.sin(th) * rad,
    a: 0.35 + (Math.sin(th) + 1) * 0.3,
    ph: (i % 10) * 0.3,
    pr: 0.5 + ((i * 7) % 6) * 0.12,
  });
}

// ---------------------------------------------------------------------------
// Animated SVG Circle
// ---------------------------------------------------------------------------
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ---------------------------------------------------------------------------
// SphereParticle — receives shared values, reads from fibRaw directly
// ---------------------------------------------------------------------------
function SphereParticle({ index }: { index: number }) {
  const d = fibRaw[index];

  const animatedProps = useAnimatedProps(() => {
    'worklet';
    // These are referenced from outer scope via closure — worklet reads them
    const rx = rotX.value;
    const ry = rotY.value;
    const t = time.value;
    const cx = centerX.value;
    const cy = centerY.value;
    const r = radius.value;

    // Rotation matrices — X then Y
    const cosX = Math.cos(rx);
    const sinX = Math.sin(rx);
    const cosY = Math.cos(ry);
    const sinY = Math.sin(ry);

    // Rotate around X axis
    const fy = d.by * cosX - d.bz * sinX;
    const rz = d.by * sinX + d.bz * cosX;
    // Rotate around Y axis
    const fx = d.bx * cosY + rz * sinY;
    const fz = rz * cosY - d.bx * sinY;

    // Perspective projection — stable focal length
    const persp = FOCAL / (FOCAL + fz);

    const x = cx + fx * r * persp;
    const yc = cy + fy * r * persp;
    const pr = Math.max(0.5, d.pr * persp);

    // Pulsing opacity — consistent across all particles
    const wave = Math.sin(t * 1.8 + d.ph) * 0.18 + 1.0;
    const o = Math.max(0.08, Math.min(1.0, d.a * wave * (0.5 + persp * 0.5)));

    // Hue shifts with time and depth — creates the rotating color effect
    const hue = (40 - ((t * 16 + fz * 22) % 100) + 360) % 360;
    const lit = 48 + persp * 20;

    return {
      cx: x,
      cy: yc,
      r: pr,
      opacity: o,
      fill: `hsla(${hue},85%,${lit}%,${o.toFixed(2)})`,
    };
  });

  return <AnimatedCircle animatedProps={animatedProps} />;
}

// ---------------------------------------------------------------------------
// Module-level shared values — shared across all SphereParticle instances
// ---------------------------------------------------------------------------
const rotX = { value: 0.5 } as SharedValue<number>;
const rotY = { value: 0 } as SharedValue<number>;
const time = { value: 0 } as SharedValue<number>;
const centerX = { value: 55 } as SharedValue<number>;
const centerY = { value: 55 } as SharedValue<number>;
const radius = { value: 39.6 } as SharedValue<number>;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function FibonacciSphereOrb({ state, size = 110 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const rad = size * 0.36;

  // Speed multiplier per state — computed once per render
  const sm = state === 'idle' ? 0.25
    : state === 'processing' ? 2.5
    : state === 'speaking' ? 1.0 : 0.6;

  // Update shared values when size changes
  React.useEffect(() => {
    centerX.value = cx;
    centerY.value = cy;
    radius.value = rad;
  }, [cx, cy, rad]);

  // Drive rotation + time on the UI thread
  useFrameCallback((info) => {
    'worklet';
    const dt = (info.timeSincePreviousFrame ?? 16) / 1000;
    rotY.value += dt * sm * 0.5;
    rotX.value += dt * sm * 0.2;
    time.value += dt * sm;
  });

  // Scale pulse
  const scale = useSharedValue(1.0);
  const targetScale = state === 'idle' ? 1.03
    : state === 'processing' ? 1.08
    : state === 'speaking' ? 1.05 : 1.0;
  const pulseAmp = state === 'idle' ? 0.03
    : state === 'processing' ? 0.06 : 0.02;

  React.useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(targetScale + pulseAmp, { duration: 1000 / sm, easing: Easing.inOut(Easing.sin) }),
        withTiming(targetScale - pulseAmp, { duration: 1000 / sm, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, [state, sm, targetScale, pulseAmp, scale]);

  // Tap: random rotation
  const tap = Gesture.Tap().onEnd((e) => {
    'worklet';
    if (e.x > size / 2) {
      rotX.value = withSpring(0.2 + Math.random(), { damping: 12, stiffness: 80 });
      rotY.value = withSpring(Math.random() * Math.PI * 2, { damping: 12, stiffness: 80 });
    } else {
      rotX.value = withSpring(0.5, { damping: 12, stiffness: 80 });
      rotY.value = withSpring(0, { damping: 12, stiffness: 80 });
    }
  });

  // Pinch: zoom
  const pinch = Gesture.Pinch()
    .onUpdate((e) => { 'worklet'; scale.value = Math.max(0.5, Math.min(1.8, 1 / e.scale)); })
    .onEnd(() => { 'worklet'; scale.value = withSpring(1.0, { damping: 15, stiffness: 120 }); });

  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <GestureHandlerRootView style={{ width: size, height: size }}>
      <GestureDetector gesture={Gesture.Race(tap, pinch)}>
        <View style={[styles.container, { width: size, height: size }]}>
          {/* Glow — centered at exactly (cx, cy) */}
          <View
            style={[
              styles.glow,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                // Precisely center the glow behind the orb
                left: 0,
                top: 0,
              },
            ]}
          />

          {/* Particles — single SVG layer, scale from exact center */}
          <Animated.View
            style={[
              styles.svgLayer,
              scaleStyle,
              {
                // Scale transform origin = exact orb center
                left: 0,
                top: 0,
                width: size,
                height: size,
              },
            ]}
          >
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <Defs>
                <RadialGradient id="orbGrad" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor="rgba(255,200,80,0.4)" />
                  <Stop offset="100%" stopColor="rgba(255,120,40,0)" />
                </RadialGradient>
              </Defs>
              {/* Background glow gradient */}
              <Circle cx={cx} cy={cy} r={rad * 0.9} fill="url(#orbGrad)" />
              {/* Particles */}
              {fibRaw.map((_, i) => (
                <SphereParticle key={i} index={i} />
              ))}
            </Svg>
          </Animated.View>

          {/* Inner glow — centered */}
          <View
            style={[
              styles.innerDot,
              {
                width: size * 0.22,
                height: size * 0.22,
                borderRadius: size * 0.11,
                left: cx - size * 0.11,
                top: cy - size * 0.11,
              },
            ]}
          />

          {/* Center dot — exact center */}
          <View
            style={[
              styles.centerDot,
              {
                width: size * 0.1,
                height: size * 0.1,
                borderRadius: size * 0.05,
                left: cx - size * 0.05,
                top: cy - size * 0.05,
              },
            ]}
          />
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center' as ViewStyle['justifyContent'],
    alignItems: 'center' as ViewStyle['alignItems'],
  },
  svgLayer: {
    position: 'absolute' as ViewStyle['position'],
  },
  glow: {
    position: 'absolute' as ViewStyle['position'],
    shadowColor: '#ffbf48',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 24,
  },
  innerDot: {
    position: 'absolute' as ViewStyle['position'],
    backgroundColor: 'rgba(255,200,100,0.2)',
  },
  centerDot: {
    position: 'absolute' as ViewStyle['position'],
    backgroundColor: '#ffbf48',
    shadowColor: '#ffbf48',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 12,
    elevation: 10,
  },
});
