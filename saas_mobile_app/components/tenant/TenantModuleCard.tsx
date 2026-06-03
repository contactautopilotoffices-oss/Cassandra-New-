import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import SafeBlurView from '@/components/ui/SafeBlurView';

const { width: SCREEN_W } = Dimensions.get('window');
const TILE_GAP = 12;
const TILES_PER_ROW = 3;
const TILE_WIDTH = (SCREEN_W - 48 - TILE_GAP * (TILES_PER_ROW - 1)) / TILES_PER_ROW;

interface TenantModuleCardProps {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBgColor?: string;
  count?: number;
  delay?: number;
  onPress?: () => void;
}

export default function TenantModuleCard({
  title,
  subtitle,
  icon,
  iconColor = '#FFFFFF',
  iconBgColor = 'rgba(255,255,255,0.15)',
  count,
  delay = 0,
  onPress,
}: TenantModuleCardProps) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(500)} style={styles.wrapper}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} disabled={!onPress} style={styles.touchable}>
        <SafeBlurView intensity={40} style={styles.card} tint="dark">
          <View style={styles.content}>
            <View style={styles.topRow}>
              <View style={[styles.iconCircle, { backgroundColor: iconBgColor }]}>
                <Ionicons name={icon} size={22} color={iconColor} />
              </View>
              {count !== undefined && count > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countValue}>{count}</Text>
                </View>
              )}
            </View>

            <Text style={styles.title} numberOfLines={2}>{title}</Text>
            <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
          </View>
        </SafeBlurView>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: TILE_WIDTH,
  },
  touchable: {
    width: '100%',
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  content: {
    padding: 14,
    alignItems: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
    position: 'relative',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  countValue: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  title: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'center',
    lineHeight: 16,
  },
  subtitle: {
    fontFamily: 'System',
    fontSize: 10,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 14,
  },
});
