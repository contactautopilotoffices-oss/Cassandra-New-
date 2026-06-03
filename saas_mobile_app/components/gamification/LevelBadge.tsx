/**
 * LevelBadge — Square gradient badge showing the user's numeric level.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  level: number;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: { box: 36, num: 14 },
  md: { box: 48, num: 18 },
  lg: { box: 64, num: 24 },
};

export function LevelBadge({ level, name, size = 'md' }: Props) {
  const s = sizes[size];
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#7C5CFA', '#5B3FD6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.badge, { width: s.box, height: s.box, borderRadius: s.box * 0.25 }]}
      >
        <Text style={[styles.number, { fontSize: s.num }]}>{level}</Text>
      </LinearGradient>
      {name && (
        <View style={styles.nameContainer}>
          <Text style={styles.levelLabel}>Level {level}</Text>
          <Text style={styles.levelName}>{name}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#7C5CFA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  number: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  nameContainer: {
    justifyContent: 'center',
  },
  levelLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  levelName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 1,
  },
});
