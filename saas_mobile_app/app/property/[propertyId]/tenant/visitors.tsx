import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useWeather } from '@/hooks/useWeather';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import TenantBottomNav from '@/components/tenant/TenantBottomNav';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { createClient } from '@/utils/supabase/client';
import { vmsService } from '@/services/vmsService';
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

export default function TenantVisitorsPage() {
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const weatherHook = useWeather();

  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [purpose, setPurpose] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!visitorName || !visitDate || !visitTime) {
      Alert.alert('Missing Info', 'Please fill in visitor name, date and time.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await vmsService.checkIn({
        propertyId: propertyId!,
        name: visitorName,
        mobile: visitorPhone || undefined,
        category: 'expected',
        whom_to_meet: user?.user_metadata?.full_name || 'Host',
        whom_to_meet_uid: user?.id,
        coming_from: purpose || undefined,
      });

      if (error) throw new Error(typeof error === 'string' ? error : error?.message ?? 'Failed to create visitor');

      Alert.alert('Success', 'Visitor pre-registered successfully!');
      setVisitorName('');
      setVisitorPhone('');
      setVisitDate('');
      setVisitTime('');
      setPurpose('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not register visitor.');
    } finally {
      setIsSubmitting(false);
    }
  }, [visitorName, visitorPhone, visitDate, visitTime, purpose, propertyId, user]);

  const today = new Date().toISOString().split('T')[0];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1a1a1a', '#121212', '#0a0a0a']} style={StyleSheet.absoluteFillObject} />
      {weatherHook.weather && <WeatherBackground condition={weatherHook.weather.condition} />}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Visitor Management</Text>
          <View style={{ width: 44 }} />
        </View>

        <Animated.View entering={FadeInUp.delay(80).duration(500)} style={styles.introCard}>
          <SafeBlurView intensity={40} style={styles.introBlur} tint="dark">
            <LinearGradient
              colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)', 'rgba(0,0,0,0.2)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.introContent}>
              <View style={[styles.introIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                <Ionicons name="people-outline" size={28} color="#10B981" />
              </View>
              <Text style={styles.introTitle}>Pre-register Visitors</Text>
              <Text style={styles.introDesc}>
                Secure building access & visitor check-in system. Pre-register your guests for a smooth entry experience.
              </Text>
            </View>
          </SafeBlurView>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(160).duration(500)} style={styles.formSection}>
          <Text style={styles.sectionLabel}>Visitor Details</Text>

          <Text style={styles.inputLabel}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. John Smith"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={visitorName}
            onChangeText={setVisitorName}
          />

          <Text style={styles.inputLabel}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 98765 43210"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={visitorPhone}
            onChangeText={setVisitorPhone}
            keyboardType="phone-pad"
          />

          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Visit Date *</Text>
              <TextInput
                style={styles.input}
                placeholder={today}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={visitDate}
                onChangeText={setVisitDate}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Visit Time *</Text>
              <TextInput
                style={styles.input}
                placeholder="14:00"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={visitTime}
                onChangeText={setVisitTime}
              />
            </View>
          </View>

          <Text style={styles.inputLabel}>Purpose of Visit</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="e.g. Business meeting, Interview, Delivery..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={purpose}
            onChangeText={setPurpose}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            <Text style={styles.submitBtnText}>
              {isSubmitting ? 'Submitting...' : 'Pre-register Visitor'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

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
  introCard: {
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  introBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  introContent: {
    padding: 20,
    alignItems: 'center',
  },
  introIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  introTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  introDesc: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
  },
  formSection: {
    paddingHorizontal: SPACING.xl,
  },
  sectionLabel: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  textArea: {
    minHeight: 80,
    paddingTop: 14,
  },
  timeRow: {
    flexDirection: 'row',
  },
  submitBtn: {
    backgroundColor: '#708F96',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontFamily: FONT_BODY,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
