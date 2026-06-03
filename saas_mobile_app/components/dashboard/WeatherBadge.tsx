import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export type WeatherCondition = 'clear-night' | 'sunny' | 'cloudy' | 'rainy' | 'cosmic';

interface WeatherMeta {
  id: WeatherCondition;
  label: string;
  temp: string;
  image: any;
  tempColor: string;
  haloColor: string;
}

const WEATHER_META: WeatherMeta[] = [
  {
    id: 'clear-night',
    label: 'Clear Night',
    temp: '22°',
    image: require('@/assets/images/weather-moon.png'),
    tempColor: '#1a1a2e',
    haloColor: 'rgba(240,235,220,0.35)',
  },
  {
    id: 'sunny',
    label: 'Sunny',
    temp: '31°',
    image: require('@/assets/images/weather-sun.png'),
    tempColor: '#FFFFFF',
    haloColor: 'rgba(232,160,60,0.55)',
  },
  {
    id: 'cloudy',
    label: 'Cloudy',
    temp: '26°',
    image: require('@/assets/images/weather-cloud.png'),
    tempColor: '#1e2e3e',
    haloColor: 'rgba(255,255,255,0.30)',
  },
  {
    id: 'rainy',
    label: 'Rainy',
    temp: '19°',
    image: require('@/assets/images/weather-rain.png'),
    tempColor: '#FFFFFF',
    haloColor: 'rgba(80,120,160,0.40)',
  },
  {
    id: 'cosmic',
    label: 'Cosmic',
    temp: '24°',
    image: require('@/assets/images/weather-moon.png'),
    tempColor: '#FFFFFF',
    haloColor: 'rgba(100,60,180,0.45)',
  },
];

interface WeatherBadgeProps {
  condition: WeatherCondition;
  temperature?: string;
  locationName?: string | null;
  onChange?: (condition: WeatherCondition | null) => void;
}

function OrbAnimation({ condition, children }: { condition: WeatherCondition; children: React.ReactNode }) {
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  React.useEffect(() => {
    if (condition === 'clear-night') {
      rotation.value = withRepeat(
        withTiming(360, { duration: 60000, easing: Easing.linear }),
        -1,
        false
      );
    } else if (condition === 'sunny') {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else if (condition === 'cloudy') {
      translateX.value = withRepeat(
        withSequence(
          withTiming(6, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(-6, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      translateY.value = withRepeat(
        withSequence(
          withTiming(-3, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(3, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else if (condition === 'rainy') {
      translateY.value = withRepeat(
        withSequence(
          withTiming(-4, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    }
  }, [condition]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return <Animated.View style={[styles.orbImageWrap, animatedStyle]}>{children}</Animated.View>;
}

export default function WeatherBadge({
  condition,
  temperature,
  locationName,
}: WeatherBadgeProps) {
  const meta = WEATHER_META.find((m) => m.id === condition) || WEATHER_META[1];
  const displayTemp = temperature || meta.temp;

  return (
    <>
      <View
        style={styles.container}
      >
        {/* Halo */}
        <View style={[styles.halo, { backgroundColor: meta.haloColor }]} />

        {/* Orb image with animation */}
        <OrbAnimation condition={condition}>
          <Animated.Image
            source={meta.image}
            style={styles.orbImage}
            resizeMode="contain"
          />
        </OrbAnimation>

        {/* Temperature centered on orb */}
        <Text style={[styles.tempText, { color: meta.tempColor }]}>
          {displayTemp}
        </Text>

        {/* Label + location */}
        <View style={styles.labelRow}>
          <Text style={styles.labelText}>{meta.label.toUpperCase()}</Text>
        </View>
        {locationName && (
          <Text style={styles.locationText}>{locationName}</Text>
        )}
      </View>

    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 100,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  halo: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    top: 8,
  },
  orbImageWrap: {
    position: 'absolute',
    width: 90,
    height: 90,
    top: 8,
  },
  orbImage: {
    width: '100%',
    height: '100%',
  },
  tempText: {
    position: 'absolute',
    top: 32,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 78,
  },
  labelText: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  locationText: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
    letterSpacing: 0.5,
  },
});
