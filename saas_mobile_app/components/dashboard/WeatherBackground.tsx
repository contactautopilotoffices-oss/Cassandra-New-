import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';

export type WeatherCondition = 'clear-night' | 'sunny' | 'cloudy' | 'rainy' | 'clear-day' | 'cloudy-day' | 'cloudy-night' | 'cosmic';

interface WeatherBackgroundProps {
  condition: WeatherCondition;
}

const BACKGROUND_IMAGES: Record<string, any> = {
  'sunny': require('@/assets/images/weather-sun.png'),
  'clear-day': require('@/assets/images/weather-sun.png'),
  'clear-night': require('@/assets/images/weather-moon.png'),
  'cloudy': require('@/assets/images/weather-cloud.png'),
  'cloudy-day': require('@/assets/images/weather-cloud.png'),
  'cloudy-night': require('@/assets/images/weather-cloud.png'),
  'rainy': require('@/assets/images/weather-rain.png'),
  'cosmic': require('@/assets/images/weather-moon.png'),
};

const THEME_GRADIENTS: Record<string, readonly [string, string, ...string[]]> = {
  'sunny': ['#f47133', '#e85d1e', '#d14309'],        // Glossy vibrant orange-red
  'clear-day': ['#f47133', '#e85d1e', '#d14309'],
  'clear-night': ['#030712', '#0f172a', '#1e293b'],  // Starry Deep Night
  'cloudy': ['#1e293b', '#334155', '#475569'],       // Elegant Slate Cloudy
  'cloudy-day': ['#1e293b', '#334155', '#475569'],
  'cloudy-night': ['#090d16', '#121824', '#1b2333'],
  'rainy': ['#0f172a', '#1e293b', '#334155'],        // Deep Stormy Rain
  'cosmic': ['#0a0a1a', '#1a1040', '#0d1b3e'],       // Deep cosmic purple-blue
};

export default function WeatherBackground({ condition }: WeatherBackgroundProps) {
  // Resolve condition safely, fallback to sunny
  const mappedCondition = condition?.toLowerCase() || 'sunny';
  const backgroundImage = BACKGROUND_IMAGES[mappedCondition] || BACKGROUND_IMAGES['sunny'];
  const gradientColors = THEME_GRADIENTS[mappedCondition] || THEME_GRADIENTS['sunny'];

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View key={mappedCondition} entering={FadeIn.duration(800)} style={StyleSheet.absoluteFillObject}>
        {/* Base Climate-tailored Gradient */}
        <LinearGradient
          colors={gradientColors}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        
        {/* Climate High-Fidelity Asset Image */}
        <Image
          source={backgroundImage}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      </Animated.View>
    </View>
  );
}
