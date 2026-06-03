import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useWeather } from '@/hooks/useWeather';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import SafeBlurView from '@/components/ui/SafeBlurView';
import TenantBottomNav from '@/components/tenant/TenantBottomNav';
import { SPACING } from '@/constants/designSystem';

const FONT_DISPLAY = Platform.select({
  web: 'Poppins, -apple-system, BlinkMacSystemFont, sans-serif',
  ios: 'Poppins',
  android: 'Poppins',
  default: 'Poppins',
});
const FONT_BODY = Platform.select({
  web: 'Urbanist, -apple-system, BlinkMacSystemFont, sans-serif',
  ios: 'Urbanist',
  android: 'Urbanist',
  default: 'Urbanist',
});

export default function TenantCommunitiesPage() {
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const insets = useSafeAreaInsets();
  const { weather } = useWeather();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1a1a1a', '#121212', '#0a0a0a']} style={StyleSheet.absoluteFillObject} />
      {weather && <WeatherBackground condition={weather.condition} />}

      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Communities</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.content}>
        <Animated.View entering={FadeInUp.delay(100).duration(600)}>
          <SafeBlurView intensity={40} tint="dark" style={styles.glassCard}>
            <LinearGradient
              colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.1)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.cardContent}>
              <View style={styles.iconCircle}>
                <Ionicons name="people" size={40} color="#B8956A" />
              </View>
              <Text style={styles.title}>Coming Soon</Text>
              <Text style={styles.subtitle}>
                Communities will let you connect with fellow clients, join interest groups, and stay updated with building announcements.
              </Text>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Ionicons name="chatbubbles-outline" size={14} color="#B8956A" />
                  <Text style={styles.badgeText}>Discussions</Text>
                </View>
                <View style={styles.badge}>
                  <Ionicons name="megaphone-outline" size={14} color="#B8956A" />
                  <Text style={styles.badgeText}>Announcements</Text>
                </View>
                <View style={styles.badge}>
                  <Ionicons name="calendar-outline" size={14} color="#B8956A" />
                  <Text style={styles.badgeText}>Events</Text>
                </View>
              </View>
            </View>
          </SafeBlurView>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(250).duration(600)} style={styles.hintBox}>
          <Ionicons name="information-circle-outline" size={18} color="rgba(255,255,255,0.4)" />
          <Text style={styles.hintText}>
            You&apos;ll be notified when Communities goes live.
          </Text>
        </Animated.View>
      </View>

      <TenantBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    marginBottom: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    justifyContent: 'center',
  },
  glassCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cardContent: {
    padding: 28,
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(184,149,106,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: FONT_BODY,
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  badgeText: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    justifyContent: 'center',
  },
  hintText: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
});
