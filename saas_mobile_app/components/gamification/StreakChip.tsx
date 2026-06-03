/**
 * StreakChip — Small flame chip showing the user's day-streak count.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  streak: number;
}

export function StreakChip({ streak }: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name="flame" size={14} color="#FBBF24" />
      <Text style={styles.text}>{streak}d</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    backgroundColor: 'rgba(251,191,36,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FDE68A',
  },
});
