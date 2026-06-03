'use client';

/**
 * AppleWeatherBackground — Clean atmospheric backdrop
 * Layers:
 * 1. Sky gradient (weather condition-aware)
 * 2. Vignette overlay for depth
 * 3. Optional property photo as base
 * All touch events pass through (pointerEvents="none").
 */

import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { useWeather, WeatherCondition } from '@/hooks/useWeather';

// ---- Condition → Sky Gradients ----
interface SkyPalette {
  top: string;
  mid: string;
  bottom: string;
}

const SKY_PALETTES: Record<WeatherCondition, SkyPalette> = {
  'clear-night': { top: '#03030a', mid: '#060618', bottom: '#0a0a25' },
  'sunny': { top: '#f47133', mid: '#e85d1e', bottom: '#d14309' }, // Glossy vibrant orange-red
  'cloudy': { top: '#6a788c', mid: '#505d70', bottom: '#3c4858' },
  'rainy': { top: '#2c3e50', mid: '#202e3c', bottom: '#2E335A' },
  'cosmic': {
    top: '#0C0E12',
    mid: '#151A22',
    bottom: '#040506',
  },
};

// ---- Main Component ----
interface AppleWeatherBackgroundProps {
  /** Property photo URL as base layer */
  photoUrl?: string | null;
  /** Override the condition (e.g. for property detail view) */
  conditionOverride?: WeatherCondition;
  /** Dark overlay opacity over photo */
  photoOverlayOpacity?: number;
}

export default function AppleWeatherBackground({
  photoUrl,
  conditionOverride,
  photoOverlayOpacity = 0.40,
}: AppleWeatherBackgroundProps) {
  const { weather } = useWeather();
  const condition = conditionOverride ?? weather?.condition ?? 'sunny';
  const sky = SKY_PALETTES[condition];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Layer 1: Photo OR sky gradient */}
      {photoUrl ? (
        <View style={styles.photoLayer}>
          <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
          <View style={[styles.photoOverlay, { opacity: photoOverlayOpacity }]} />
        </View>
      ) : (
        <View style={styles.skyLayer}>
          <View style={[styles.skyTop, { backgroundColor: sky.top }]} />
          <View style={[styles.skyMid, { backgroundColor: sky.mid }]} />
          <View style={[styles.skyBottom, { backgroundColor: sky.bottom }]} />
        </View>
      )}

      {/* Layer 2: Vignette for depth */}
      <View style={styles.vignette} />
    </View>
  );
}

// ---- Styles ----
const styles = StyleSheet.create({
  // Sky gradient
  skyLayer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  skyTop: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%' },
  skyMid: { position: 'absolute', top: '28%', left: 0, right: 0, height: '42%', opacity: 0.85 },
  skyBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '48%', opacity: 0.75 },

  // Photo base
  photoLayer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  photo: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  photoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },

  // Vignette
  vignette: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)',
  },
});
