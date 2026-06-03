/**
 * AchievementBadge — Tile showing a single achievement (locked or unlocked).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import type { Achievement } from '@/lib/gamification';

interface Props {
  achievement: Achievement;
  delay?: number;
}

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  'first-ticket': 'checkmark-circle',
  'week-streak': 'flame',
  'ticket-master': 'trophy',
  'night-owl': 'moon',
  'top-resolver': 'medal',
  'power-saver': 'flash',
};

export function AchievementBadge({ achievement, delay = 0 }: Props) {
  const iconName = iconMap[achievement.id] || 'star';

  return (
    <Animated.View
      entering={FadeIn.delay(delay).springify()}
      style={[
        styles.container,
        achievement.unlocked ? styles.unlocked : styles.locked,
      ]}
    >
      <View
        style={[
          styles.iconBox,
          {
            backgroundColor: achievement.unlocked
              ? achievement.tint + '38'
              : 'rgba(255,255,255,0.06)',
            shadowColor: achievement.unlocked ? achievement.tint : 'transparent',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.35,
            shadowRadius: 18,
            elevation: achievement.unlocked ? 8 : 0,
          },
        ]}
      >
        <Ionicons
          name={iconName}
          size={20}
          color={achievement.unlocked ? achievement.tint : 'rgba(255,255,255,0.35)'}
        />
      </View>
      <Text style={styles.name}>{achievement.name}</Text>
      <Text style={styles.description}>{achievement.description}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    minWidth: 0,
  },
  unlocked: {
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  locked: {
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    opacity: 0.6,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  description: {
    marginTop: 2,
    fontSize: 10,
    color: 'rgba(255,255,255,0.50)',
    textAlign: 'center',
  },
});
