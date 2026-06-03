/**
 * useWeather - Atmospheric weather hook
 *
 * Returns:
 * - condition: clear-night | sunny | cloudy | rainy | cosmic
 * - temperature: displayed temp string (e.g. "31°")
 * - locationName: city name from reverse geocoding
 * - label: human-readable label (e.g. "Sunny")
 * - greeting: time-appropriate greeting
 *
 * Mode is derived from:
 * 1. Live Open-Meteo data (if location is enabled in settings)
 * 2. Fallback: strictly "sunny" if location disabled or fetch fails
 */

import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type WeatherCondition = 'clear-night' | 'sunny' | 'cloudy' | 'rainy' | 'cosmic';

export interface WeatherData {
  condition: WeatherCondition;
  label: string;
  temperature: string;
  locationName: string | null;
  greeting: string;
  description: string;
  lastUpdated: Date;
  auroraColors?: AuroraColors;
  period?: string;
  weatherIcon?: string;
  isDaylight?: boolean;
}

// Backward-compatible legacy exports
export type WeatherIconType = 'sun' | 'moon' | 'partly-cloudy' | 'cloudy' | 'rainy';
export interface AuroraColors {
  primaryTop: string;
  primaryMid: string;
  primaryBottom: string;
  orb1: string;
  orb2: string;
  orb3: string;
  textPrimary: string;
  textSecondary: string;
  glassBg: string;
  glassBorder: string;
}
export type WeatherPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

const WEATHER_MODES: Array<{ id: WeatherCondition; label: string; temp: string }> = [
  { id: 'clear-night', label: 'Clear Night', temp: '22°' },
  { id: 'sunny', label: 'Sunny', temp: '31°' },
  { id: 'cloudy', label: 'Cloudy', temp: '26°' },
  { id: 'rainy', label: 'Rainy', temp: '19°' },
  { id: 'cosmic', label: 'Cosmic', temp: '18°' },
];

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  if (hour >= 17 && hour < 21) return 'Good Evening';
  return 'Good Night';
}

function mapMeteoCondition(weathercode: number, isDay: number): WeatherCondition {
  if (weathercode >= 51) return 'rainy';
  if (weathercode === 3 || weathercode === 45 || weathercode === 48) return 'cloudy';
  if (weathercode === 2) return 'cloudy';
  return isDay === 0 ? 'clear-night' : 'sunny';
}

function getConditionDescription(condition: WeatherCondition): string {
  switch (condition) {
    case 'rainy':
      return 'Rain showers';
    case 'cloudy':
      return 'Partly cloudy';
    case 'clear-night':
      return 'Clear night';
    case 'cosmic':
      return 'Ambient mode';
    case 'sunny':
    default:
      return 'Clear sky';
  }
}

async function fetchLiveWeather(
  lat: number,
  lng: number
): Promise<{ condition: WeatherCondition; temp: string; description: string } | null> {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`
    );
    if (!response.ok) return null;

    const data = await response.json();
    const current = data.current_weather;
    if (!current) return null;

    const temp = Math.round(current.temperature);
    const condition = mapMeteoCondition(current.weathercode, current.is_day);

    return {
      condition,
      temp: `${temp}°`,
      description: getConditionDescription(condition),
    };
  } catch {
    return null;
  }
}

async function getLocationName(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'FMS-Mobile-App/1.0' } }
    );
    if (!response.ok) return null;

    const data = await response.json();
    return data.address?.city ?? data.address?.town ?? data.address?.village ?? null;
  } catch {
    return null;
  }
}

export function useWeather() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const computeWeather = useCallback(async (lat: number | null, lng: number | null) => {
    const now = new Date();
    const greeting = getGreeting(now.getHours());

    let condition: WeatherCondition = 'sunny';
    let temp = WEATHER_MODES.find((mode) => mode.id === 'sunny')!.temp;
    let description = getConditionDescription('sunny');
    let locationName: string | null = null;

    const storedBg = await AsyncStorage.getItem('fms_dashboard_background');
    if (storedBg) {
      const bgToCondition: Record<string, WeatherCondition> = {
        sunny: 'sunny',
        night: 'clear-night',
        midnight: 'clear-night',
        cloudy: 'cloudy',
        raining: 'rainy',
        cosmic: 'cosmic',
      };

      if (storedBg in bgToCondition) {
        condition = bgToCondition[storedBg];
        const meta = WEATHER_MODES.find((mode) => mode.id === condition);
        if (meta) {
          temp = meta.temp;
          description = getConditionDescription(condition);
        }
      }
    } else if (lat !== null && lng !== null) {
      const live = await fetchLiveWeather(lat, lng);
      if (live) {
        condition = live.condition;
        temp = live.temp;
        description = live.description;
      }
      locationName = await getLocationName(lat, lng);
    }

    const modeMeta = WEATHER_MODES.find((mode) => mode.id === condition) ?? WEATHER_MODES[1];

    setWeather({
      condition,
      label: modeMeta.label.toUpperCase(),
      temperature: temp,
      locationName,
      greeting,
      description,
      lastUpdated: now,
    });
    setLoading(false);
  }, []);

  const initWeather = useCallback(async () => {
    try {
      const locationEnabled = await AsyncStorage.getItem('fms_weather_location_enabled');
      if (locationEnabled === 'false') {
        await computeWeather(null, null);
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        await computeWeather(null, null);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
      await computeWeather(loc.coords.latitude, loc.coords.longitude);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Location unavailable');
      await computeWeather(null, null);
    }
  }, [computeWeather]);

  useEffect(() => {
    initWeather();
  }, [initWeather]);

  useEffect(() => {
    if (!weather?.locationName) return;
    const interval = setInterval(initWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [weather?.locationName, initWeather]);

  return { weather, loading, error, refreshWeather: initWeather };
}
