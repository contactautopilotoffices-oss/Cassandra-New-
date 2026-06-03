'use client';
/**
 * SidekickFace — Animated AI face with multi-hue ambient glow
 *
 * White face with radial gradient, blinking eyes, morphing mouth.
 * Counter-rotating face so content stays upright while the whole orb rotates.
 * Halo approximated with multiple colored rings (conic-gradient not supported in RN).
 *
 * Props:
 *  size      — diameter in px (default 120, compact 52)
 *  state     — 'idle' | 'listening' | 'speaking'
 *  onClick   — callback
 *  compact   — uses default size 52
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';

export type FaceState = 'idle' | 'listening' | 'speaking' | 'thinking' | 'alert';

interface SidekickFaceProps {
  size?: number;
  state?: FaceState;
  compact?: boolean;
  onClick?: () => void;
}

// Multi-hue halo colors (oklch approximation as hex)
// oklch(0.85 0.18 30) → orange/amber
// oklch(0.85 0.18 145) → green
// oklch(0.85 0.18 235) → blue
// oklch(0.85 0.18 295) → purple
// Alert: amber → red
const DEFAULT_HALO_COLORS = [
  'rgba(245,160,0,0.55)',   // amber
  'rgba(56,216,112,0.55)',  // green
  'rgba(91,154,245,0.55)',  // blue
  'rgba(176,106,240,0.55)', // purple
];

const ALERT_HALO_COLORS = [
  'rgba(217,38,28,0.65)',   // critical red
  'rgba(217,100,38,0.55)',   // orange-red
  'rgba(217,38,28,0.45)',   // deep red
  'rgba(196,30,28,0.40)',   // blood red
];

const FACE_GRADIENT_STOPS = [
  { color: '#FFFFFF', offset: '0%' },   // white center
  { color: '#EFF4FF', offset: '55%' },  // oklch(0.96 0.02 250)
  { color: '#DDE5FF', offset: '100%' }, // oklch(0.85 0.05 280)
];

export default function SidekickFace({
  size,
  state: stateProp,
  compact = false,
  onClick,
}: SidekickFaceProps) {
  const [internalState, setInternalState] = useState<FaceState>('idle');
  const state = stateProp ?? internalState;
  const [blink, setBlink] = useState(false);

  // Blink timer
  useEffect(() => {
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const next = 2200 + Math.random() * 3200;
      const timeoutId = setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        setTimeout(() => {
          if (!alive) return;
          setBlink(false);
          loop();
        }, 130);
      }, next);
      return () => clearTimeout(timeoutId);
    };
    loop();
    return () => { alive = false; };
  }, []);

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    setInternalState((s) =>
      s === 'idle' ? 'listening' : s === 'listening' ? 'speaking' : 'idle'
    );
  };

  const dim = size ?? (compact ? 52 : 120);
  const faceDim = dim * 0.82;

  // Eye scaleY: blink=true → 0.08, listening → 0.85, thinking → 0.6 (dimmer), normal → 1
  const eyeScaleY = blink
    ? 0.08
    : state === 'listening'
    ? 0.85
    : state === 'thinking'
    ? 0.6
    : 1;

  // Eye opacity: thinking = dimmer (0.6), others = 1
  const eyeOpacity = state === 'thinking' ? 0.6 : 1;

  // Mouth path by state (Lovable design)
  const mouthPath = (() => {
    if (state === 'idle')    return 'M 38 60 Q 60 70 82 60';   // smile
    if (state === 'listening') return 'M 38 62 Q 60 62 82 62'; // flat / listening
    if (state === 'thinking')  return 'M 42 62 Q 60 60 78 62';  // slight frown (processing)
    if (state === 'alert')    return 'M 38 64 Q 60 56 82 64';  // concerned / alert
    return 'M 38 58 Q 60 78 82 58';                              // speaking — open
  })();

  // Halo colors: alert = red tones, others = default
  const haloColors = state === 'alert' ? ALERT_HALO_COLORS : DEFAULT_HALO_COLORS;

  // Outer rotation animation (18s full cycle)
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const rotateLoop = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    rotateLoop.current = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 18000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    rotateLoop.current.start();
    return () => {
      if (rotateLoop.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (rotateLoop.current as any).stop?.();
      }
    };
  }, [rotateAnim]);

  // Counter-rotation for inner content
  const counterRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });

  // Scale pulse animation
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const scaleLoop = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    // Stop any running animation
    if (scaleLoop.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (scaleLoop.current as any).stop?.();
      scaleLoop.current = null;
    }
    if (state === 'speaking') {
      scaleLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.06,
            duration: 250,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 250,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      scaleLoop.current.start();
    } else if (state === 'listening') {
      scaleLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.025,
            duration: 1100,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 1100,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      scaleLoop.current.start();
    } else {
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [state, scaleAnim]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Pressable
      onPress={handleClick}
      accessibilityLabel={`Sidekick face — ${state}`}
      style={[styles.container, { width: dim, height: dim }]}
    >
      {/* Multi-hue ambient halo — approximated with 4 offset colored circles */}
      <View style={[StyleSheet.absoluteFill, styles.haloContainer]} pointerEvents="none">
        {haloColors.map((color, i) => {
          const offsets = [0, 0.18, 0.38, 0.58];
          const haloSize = dim * (1.08 + offsets[i] * 0.3);
          const haloTop = -(haloSize - dim) / 2;
          const haloLeft = -(haloSize - dim) / 2;
          return (
            <View
              key={i}
              style={[
                styles.haloRing,
                {
                  width: haloSize,
                  height: haloSize,
                  borderRadius: haloSize / 2,
                  backgroundColor: color,
                  top: haloTop,
                  left: haloLeft,
                  opacity: 0.55 - i * 0.08,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Rotating face container */}
      <Animated.View
        style={[
          styles.faceWrapper,
          {
            width: faceDim,
            height: faceDim,
            borderRadius: faceDim / 2,
            backgroundColor: '#FFFFFF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 8,
            transform: [
              { rotate: rotation },
              { scale: scaleAnim },
            ],
          },
        ]}
      >
        {/* Counter-rotated inner content so face stays upright */}
        <Animated.View
          style={[
            styles.innerContent,
            {
              transform: [{ rotate: counterRotate }],
            },
          ]}
        >
          {/* Radial gradient overlay approximated with layered Views */}
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.faceGradient,
              { borderRadius: faceDim / 2 },
            ]}
          />
          {/* SVG face features */}
          <Svg
            viewBox="0 0 120 120"
            width={faceDim * 0.78}
            height={faceDim * 0.78}
            style={styles.faceSvg}
          >
            {/* Left eye */}
            <Ellipse
              cx={42}
              cy={50}
              rx={5.5}
              ry={8.5 * eyeScaleY}
              fill="#3D4F8C"
              opacity={eyeOpacity}
            />
            {/* Right eye */}
            <Ellipse
              cx={78}
              cy={50}
              rx={5.5}
              ry={8.5 * eyeScaleY}
              fill="#3D4F8C"
              opacity={eyeOpacity}
            />
            {/* Mouth */}
            <Path
              d={mouthPath}
              fill="none"
              stroke="#3D4F8C"
              strokeWidth={3.5}
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>

        {/* Inner glow for depth */}
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.innerGlow,
            { borderRadius: faceDim / 2 },
          ]}
          pointerEvents="none"
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  haloContainer: {
    position: 'absolute',
  },
  haloRing: {
    position: 'absolute',
  },
  faceWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  innerContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceGradient: {
    backgroundColor: '#EFF4FF',
  },
  faceSvg: {
    position: 'absolute',
  },
  innerGlow: {
    backgroundColor: 'rgba(100,120,200,0.08)',
  },
});
