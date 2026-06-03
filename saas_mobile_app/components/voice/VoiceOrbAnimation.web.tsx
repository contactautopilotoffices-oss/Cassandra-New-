'use client';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const GooFilter = () => (
  // We use standard web SVG tags here since this file ONLY evaluates on Web!
  <svg style={{ height: 0, width: 0, position: 'absolute' }}>
    <defs>
      <filter id="goo">
        <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
        <feColorMatrix
          in="blur"
          mode="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
          result="goo"
        />
        <feBlend in="SourceGraphic" in2="goo" />
      </filter>
    </defs>
  </svg>
);

export function VoiceOrbAnimation({ state, size = 110 }: any) {
  const glowOpacity = useSharedValue(0.3);
  const glowScale = useSharedValue(1);
  const [webTime, setWebTime] = useState(0);

  useEffect(() => {
    cancelAnimation(glowOpacity);
    cancelAnimation(glowScale);

    let speed = 1;
    if (state === 'idle') speed = 0.5;
    else if (state === 'listening') speed = 2.5;
    else if (state === 'processing') speed = 4;
    else if (state === 'speaking') speed = 1.5;

    const dur = 4000 / speed;

    let frame = 0;
    let t = webTime;
    const loop = () => {
      t += 0.05 * speed;
      setWebTime(t);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(state === 'speaking' ? 0.8 : 0.6, { duration: dur / 2 }),
        withTiming(state === 'speaking' ? 0.4 : 0.2, { duration: dur / 2 })
      ),
      -1,
      true
    );
    
    glowScale.value = state === 'speaking' 
      ? withSpring(1.1) 
      : withRepeat(
          withSequence(
            withTiming(1.08, { duration: dur }),
            withTiming(1.0, { duration: dur })
          ),
          -1, true
        );

    return () => cancelAnimationFrame(frame);
  }, [state]);

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.35;

  const cx1 = centerX + Math.cos(webTime) * (radius * 0.5);
  const cy1 = centerY + Math.sin(webTime) * (radius * 0.5);
  const cx2 = centerX + Math.cos(webTime + Math.PI * 0.7) * (radius * 0.6);
  const cy2 = centerY + Math.sin(webTime + Math.PI * 0.7) * (radius * 0.6);
  const cx3 = centerX + Math.cos(webTime + Math.PI * 1.4) * (radius * 0.4);
  const cy3 = centerY + Math.sin(webTime + Math.PI * 1.4) * (radius * 0.4);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
    shadowColor: '#ff4d6d',
  }));

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value * 0.95 }],
  }));

  return (
    <Animated.View style={[styles.container, { width: size, height: size }, containerStyle]}>
      {/* Dynamic pulsing glow */}
      <Animated.View
        style={[
          styles.glowRing,
          { width: size * 0.8, height: size * 0.8, borderRadius: (size * 0.8) / 2 },
          glowStyle,
        ]}
      />
      <GooFilter />
      {/* The HTML div handles the GPU-accelerated Gooey filter on Web perfectly! */}
      <div style={{ width: size, height: size, filter: 'url(#goo)' }}>
        <Svg width={size} height={size}>
          <Circle cx={cx1} cy={cy1} r={radius} fill="#ff4d6d" />
          <Circle cx={cx2} cy={cy2} r={radius * 0.85} fill="#ff758f" />
          <Circle cx={cx3} cy={cy3} r={radius * 1.15} fill="#ff4d6d" />
        </Svg>
      </div>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'center', alignItems: 'center' },
  glowRing: {
    position: 'absolute',
    backgroundColor: '#ff4d6d',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 25,
    elevation: 20,
    opacity: 0.4,
  },
});
