'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse } from 'react-native-svg';
import { GLView } from 'expo-gl';
import { ExpoWebGLRenderingContext } from 'expo-gl/src/GLView.types';

// ---------------------------------------------------------------------------
// GLSL Shaders — GPU crystal orb (for forceGPU=true)
// ---------------------------------------------------------------------------
const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform float uTime;
uniform vec2  uResolution;
uniform vec3  uPrimaryColor;
uniform vec3  uSecondaryColor;
uniform float uSpeed;
uniform float uIntensity;
varying vec2 vUv;

vec3 mod289v3(vec3 x)  { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289v2(vec2 x)  { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x)   { return mod289v3(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289v2(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x  = 2.0 * fract(p * C.www) - 1.0;
  vec3 h  = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p, float t) {
  float v = 0.0; float a = 0.5;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 4; i++) {
    v += a * snoise(p + t * 0.15);
    p  = rot * p * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / min(uResolution.x, uResolution.y);
  float dist = length(uv);
  float sdf = 0.42 - dist;
  if (sdf < 0.0) { gl_FragColor = vec4(0.0); return; }

  vec2 n2d = uv / dist;
  float nz  = sqrt(max(0.0, 1.0 - dot(n2d, n2d)));
  float fresnel = pow(1.0 - nz, 2.8);
  float pulse = 0.88 + 0.12 * sin(uTime * 1.4);

  float t   = uTime * uSpeed;
  vec2  nUv = n2d * 2.8 + nz * 0.5;
  float fluid = (fbm(nUv + t * 0.4, t) * 0.5 + fbm(nUv * 1.7 - t * 0.25, t) * 0.3) * smoothstep(0.0, 0.6, nz);

  vec3 color = mix(uPrimaryColor, uSecondaryColor, smoothstep(-0.3, 0.5, fluid) * 0.65);
  color *= (1.0 + fluid * 0.4);
  color += uSecondaryColor * fresnel * pulse * uIntensity * 1.2;
  color += uPrimaryColor * fresnel * 0.3;
  color += exp(-dist * 4.5) * uPrimaryColor * 0.6;
  float alpha = clamp(smoothstep(0.0, 0.06, sdf) * (0.85 + fresnel * 0.15) * uIntensity, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse "#rrggbb" → [r, g, b] in 0..1 */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full  = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ] as [number, number, number];
}

// ---------------------------------------------------------------------------
// Native Crystal Orb — layered Views + Reanimated
// Premium glass/liquid energy orb using only React Native primitives.
// 7 stacked layers: outer glow → inner glow → color field → energy core
// → highlight ring → specular dots → scale pulse
// ---------------------------------------------------------------------------

interface NativeOrbProps {
  size?: number;
  primaryColor?: string;
  secondaryColor?: string;
  speed?: number;
  intensity?: number;
}

function NativeCrystalOrb({
  size = 70,
  primaryColor = '#ffb347',
  secondaryColor = '#ff6b35',
  speed = 1.0,
}: NativeOrbProps) {
  const s = size;

  // Shared values for all animated layers
  const pulse       = useSharedValue(0);   // 0..1 → outer glow scale
  const pulse2      = useSharedValue(0);   // inner core scale phase
  const glow        = useSharedValue(0);   // glow intensity
  const floatY      = useSharedValue(0);   // gentle float
  const rotate      = useSharedValue(0);   // rotation for ring
  const energyPulse = useSharedValue(0);   // energy ripple

  useEffect(() => {
    // Slow pulse: outer glow breathes
    pulse.value = withRepeat(
      withTiming(1, { duration: 2200 / speed, easing: Easing.inOut(Easing.sin) }),
      -1, true
    );
    // Faster pulse: inner core
    pulse2.value = withRepeat(
      withTiming(1, { duration: 1400 / speed, easing: Easing.inOut(Easing.sin) }),
      -1, true
    );
    // Glow intensity
    glow.value = withRepeat(
      withTiming(1, { duration: 1800 / speed, easing: Easing.inOut(Easing.sin) }),
      -1, true
    );
    // Gentle float
    floatY.value = withRepeat(
      withTiming(1, { duration: 3000 / speed, easing: Easing.inOut(Easing.sin) }),
      -1, true
    );
    // Rotation
    rotate.value = withRepeat(
      withTiming(360, { duration: 12000 / speed, easing: Easing.linear }),
      -1, false
    );
    // Energy ripple
    energyPulse.value = withRepeat(
      withTiming(1, { duration: 2000 / speed, easing: Easing.out(Easing.cubic) }),
      -1, false
    );
  }, [speed]);

  // ── Layer 1: Outer ambient glow ─────────────────────────────────────────
  const outerGlowStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [0.92, 1.08], Extrapolation.CLAMP);
    const opacity = interpolate(pulse.value, [0, 1], [0.35, 0.55], Extrapolation.CLAMP);
    const translate = interpolate(floatY.value, [0, 1], [-s * 0.012, s * 0.012], Extrapolation.CLAMP);
    return {
      transform: [{ scale }, { translateY: translate }],
      opacity,
    };
  });

  // ── Layer 2: Mid glow ──────────────────────────────────────────────────
  const midGlowStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse2.value, [0, 1], [0.95, 1.05], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  // ── Layer 3: Main orb body ─────────────────────────────────────────────
  const orbBodyStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [0.97, 1.03], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  // ── Layer 4: Inner energy core ─────────────────────────────────────────
  const coreStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse2.value, [0, 1], [0.85, 1.12], Extrapolation.CLAMP);
    const opacity = interpolate(pulse2.value, [0, 1], [0.55, 0.8], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  // ── Layer 5: Energy ring (rotating highlight) ───────────────────────────
  const ringStyle = useAnimatedStyle(() => {
    const rotateDeg = interpolate(rotate.value, [0, 360], [0, 360]);
    return { transform: [{ rotateZ: `${rotateDeg}deg` }] };
  });

  // ── Layer 6: Hot center ────────────────────────────────────────────────
  const centerStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse2.value, [0, 1], [0.9, 1.1], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  // ── Layer 7: Energy ripple ─────────────────────────────────────────────
  const rippleStyle = useAnimatedStyle(() => {
    const scale = interpolate(energyPulse.value, [0, 1], [0.3, 1.4], Extrapolation.CLAMP);
    const opacity = interpolate(energyPulse.value, [0, 1], [0.6, 0], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  const r = s * 0.35; // main orb radius

  return (
    <Animated.View style={[styles.container, { width: s, height: s }, floatY ? { transform: [{ translateY: 0 }] } : {}]}>
      {/* Layer 1: Outer ambient glow */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.centered, outerGlowStyle]}>
        <View style={[
          styles.glowCircle,
          {
            width: s * 1.2, height: s * 1.2, borderRadius: s * 0.6,
            backgroundColor: primaryColor,
            opacity: 0.18,
            shadowColor: primaryColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: s * 0.18,
          }
        ]} />
      </Animated.View>

      {/* Layer 2: Mid glow halo */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.centered, midGlowStyle]}>
        <View style={[
          styles.glowCircle,
          {
            width: s * 0.92, height: s * 0.92, borderRadius: s * 0.46,
            backgroundColor: secondaryColor,
            opacity: 0.22,
            shadowColor: secondaryColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: s * 0.12,
          }
        ]} />
      </Animated.View>

      {/* Layer 3: Main orb body */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.centered, orbBodyStyle]}>
        {/* SVG radial gradient orb */}
        <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ position: 'absolute' }}>
          <Defs>
            <RadialGradient id={`orb-grad-${primaryColor}`} cx="38%" cy="32%" rx="62%" ry="68%">
              <Stop offset="0%"   stopColor={primaryColor}   stopOpacity="1"    />
              <Stop offset="25%"  stopColor={secondaryColor}  stopOpacity="0.85" />
              <Stop offset="55%"  stopColor={primaryColor}   stopOpacity="0.5"  />
              <Stop offset="80%"  stopColor={secondaryColor}  stopOpacity="0.25" />
              <Stop offset="100%" stopColor={primaryColor}   stopOpacity="0.05" />
            </RadialGradient>
          </Defs>
          <Circle cx={s / 2} cy={s / 2} r={r} fill={`url(#orb-grad-${primaryColor})`} />
        </Svg>
      </Animated.View>

      {/* Layer 4: Inner energy core */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.centered, coreStyle]}>
        <View style={[
          styles.glowCircle,
          {
            width: s * 0.55, height: s * 0.55, borderRadius: s * 0.275,
            backgroundColor: secondaryColor,
            opacity: 0.45,
            shadowColor: primaryColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: s * 0.1,
          }
        ]} />
      </Animated.View>

      {/* Layer 5: Rotating ring */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.centered, ringStyle]}>
        <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ position: 'absolute' }}>
          <Defs>
            <RadialGradient id={`ring-grad-${primaryColor}`} cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="60%" stopColor={primaryColor}   stopOpacity="0"   />
              <Stop offset="80%" stopColor={primaryColor}   stopOpacity="0.7" />
              <Stop offset="100%" stopColor={secondaryColor} stopOpacity="0.9" />
            </RadialGradient>
          </Defs>
          {/* Elliptical ring — tilted to look 3D */}
          <Ellipse
            cx={s / 2}
            cy={s / 2}
            rx={r * 1.05}
            ry={r * 0.38}
            fill="none"
            stroke={primaryColor}
            strokeWidth={s * 0.022}
            strokeOpacity={0.5}
            transform={[{ rotate: '-25deg' }]}
            origin={`${s / 2}, ${s / 2}`}
          />
          <Ellipse
            cx={s / 2}
            cy={s / 2}
            rx={r * 1.05}
            ry={r * 0.38}
            fill="none"
            stroke="#ffffff"
            strokeWidth={s * 0.008}
            strokeOpacity={0.35}
            transform={[{ rotate: '-25deg' }]}
            origin={`${s / 2}, ${s / 2}`}
          />
        </Svg>
      </Animated.View>

      {/* Layer 6: Hot center */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.centered, centerStyle]}>
        <View style={[
          styles.glowCircle,
          {
            width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1,
            backgroundColor: '#ffffff',
            opacity: 0.75,
            shadowColor: '#ffffff',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: s * 0.08,
          }
        ]} />
      </Animated.View>

      {/* Layer 7: Energy ripple */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.centered, rippleStyle]}>
        <View style={[
          styles.glowCircle,
          {
            width: s * 0.7, height: s * 0.7, borderRadius: s * 0.35,
            borderWidth: s * 0.012,
            borderColor: primaryColor,
            opacity: 0.4,
          }
        ]} />
      </Animated.View>

      {/* Glass highlight: top-left curved reflection */}
      <View style={[StyleSheet.absoluteFill, styles.centered]}>
        <View style={{
          position: 'absolute',
          top: s * 0.08,
          left: s * 0.14,
          width: s * 0.28,
          height: s * 0.18,
          borderRadius: s * 0.09,
          backgroundColor: 'rgba(255,255,255,0.42)',
          transform: [{ rotate: '-30deg' }],
        }} />
        {/* Secondary highlight */}
        <View style={{
          position: 'absolute',
          top: s * 0.18,
          left: s * 0.12,
          width: s * 0.12,
          height: s * 0.07,
          borderRadius: s * 0.035,
          backgroundColor: 'rgba(255,255,255,0.6)',
          transform: [{ rotate: '-30deg' }],
        }} />
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// WebGL Orb — GPU shader (opt-in via forceGPU=true)
// ---------------------------------------------------------------------------

interface GLOrbProps {
  size?: number;
  primaryColor?: string;
  secondaryColor?: string;
  speed?: number;
  intensity?: number;
}

function GLOrb({ size = 70, primaryColor = '#ffb347', secondaryColor = '#ff6b35', speed = 1.0, intensity = 1.0 }: GLOrbProps) {
  const glRef    = useRef<ExpoWebGLRenderingContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);
  const propsRef  = useRef({ speed, intensity });

  useEffect(() => { propsRef.current = { speed, intensity }; }, [speed, intensity]);

  const primaryRGB   = hexToRgb(primaryColor);
  const secondaryRGB = hexToRgb(secondaryColor);

  const setupGL = useCallback((gl: ExpoWebGLRenderingContext) => {
    if (!gl || typeof gl.viewport !== 'function') return;
    glRef.current = gl;

    function compileShader(type: number, src: string): WebGLShader | null {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('[GLOrb] shader error:', gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    }

    const vert = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const frag = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vert || !frag) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[GLOrb] link error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const quad  = new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1]);
    const buf   = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    const posLoc    = gl.getAttribLocation(program, 'position');
    const uTime     = gl.getUniformLocation(program, 'uTime');
    const uRes      = gl.getUniformLocation(program, 'uResolution');
    const uPriCol   = gl.getUniformLocation(program, 'uPrimaryColor');
    const uSecCol   = gl.getUniformLocation(program, 'uSecondaryColor');
    const uSpeed    = gl.getUniformLocation(program, 'uSpeed');
    const uIntensity = gl.getUniformLocation(program, 'uIntensity');

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(uPriCol,   primaryRGB);
    gl.uniform3fv(uSecCol,   secondaryRGB);
    gl.uniform2f(uRes, size, size);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const ctx = glRef.current;
      if (!ctx || !uTime) return;
      const { speed: spd, intensity: intens } = propsRef.current;
      ctx.uniform1f(uTime,      (Date.now() - startRef.current) / 1000);
      ctx.uniform1f(uSpeed,     spd);
      ctx.uniform1f(uIntensity, intens);
      ctx.clearColor(0, 0, 0, 0);
      ctx.clear(ctx.COLOR_BUFFER_BIT);
      ctx.drawArrays(ctx.TRIANGLE_STRIP, 0, 4);
    }, 16);
  }, [primaryRGB, secondaryRGB, size]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    glRef.current = null;
  }, []);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={setupGL} msaaSamples={4} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export interface CrystalOrbCoreProps {
  size?: number;
  primaryColor?: string;
  secondaryColor?: string;
  speed?: number;
  intensity?: number;
  /** Force WebGL GPU mode. Default: false (uses native View layers) */
  forceGPU?: boolean;
}

export default function CrystalOrbCore(props: CrystalOrbCoreProps) {
  if (props.forceGPU) return <GLOrb {...props} />;
  return <NativeCrystalOrb {...props} />;
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowCircle: {
    position: 'absolute',
  },
});
