import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
export function GlassModuleCard({
  icon,
  title,
  description,
  badge,
  statusLine,
  rightStatusText,
  delay = 0,
  onPress,
}: {
  icon: string;
  title: string;
  description: string;
  badge?: number;
  statusLine: string;
  rightStatusText?: string;
  delay?: number;
  onPress?: () => void;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(500)} style={{ width: '100%' }}>
      <TouchableOpacity activeOpacity={0.9} onPress={onPress} disabled={!onPress} style={styles.cardTouchable}>
        <SafeBlurView intensity={40} tint="dark" style={styles.card}>
          <LinearGradient
            colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.1)']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.cardContent}>
            <View style={styles.cardTopRow}>
              <View style={styles.iconCircle}>
                <Ionicons name={icon as any} size={28} color="#A5A5B5" />
              </View>
              {typeof badge === 'number' && badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardDescription}>{description}</Text>
            <View style={styles.statusRow}>
              <Text style={styles.cardStatus}>{statusLine}</Text>
              {rightStatusText && <Text style={styles.cardStatusRight}>{rightStatusText}</Text>}
            </View>
          </View>
        </SafeBlurView>
      </TouchableOpacity>
    </Animated.View>
  );
}

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

const styles = StyleSheet.create({
  cardTouchable: { width: '100%' },
  card: { borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  cardContent: { padding: 20 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  iconCircle: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  badge: { minWidth: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(239,68,68,0.9)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontFamily: FONT_BODY, fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  cardTitle: { fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3, lineHeight: 24 },
  cardDescription: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '400', color: 'rgba(255,255,255,0.55)', lineHeight: 20, marginTop: 4 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  cardStatus: { fontFamily: FONT_BODY, fontSize: 11, fontWeight: '700', color: '#B8956A', letterSpacing: 1.2, textTransform: 'uppercase' },
  cardStatusRight: { fontFamily: FONT_BODY, fontSize: 11, fontWeight: '700', color: '#4ade80', letterSpacing: 1.2, textTransform: 'uppercase' },
});
