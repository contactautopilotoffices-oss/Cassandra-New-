/**
 * Leaderboard — Ranked list of users with rank icon, avatar, and XP.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { LeaderRow } from '@/lib/gamification';

interface Props {
  rows: LeaderRow[];
}

export function Leaderboard({ rows }: Props) {
  if (!rows || rows.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="trophy-outline" size={36} color="rgba(255,255,255,0.25)" />
        <Text style={styles.emptyTitle}>No scores yet today</Text>
        <Text style={styles.emptyHint}>Resolve tickets to appear on the board</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {rows.map((r, i) => {
        const top = r.rank === 1;
        const podium = r.rank <= 3;
        return (
          <Animated.View
            key={r.user_id ?? `${r.rank}-${r.name}`}
            entering={FadeInDown.delay(i * 80).springify()}
            style={[
              styles.row,
              r.isMe ? styles.meRow : styles.otherRow,
            ]}
          >
            <View style={styles.rankBox}>
              {top ? (
                <Ionicons name="trophy" size={16} color="#FBBF24" />
              ) : podium ? (
                <Ionicons
                  name="medal"
                  size={16}
                  color={r.rank === 2 ? '#C0C0C0' : '#CD7F32'}
                />
              ) : (
                <Text style={styles.rankText}>{r.rank}</Text>
              )}
            </View>

            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{r.initials}</Text>
            </View>

            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={styles.property} numberOfLines={1}>
                {r.property}
              </Text>
            </View>

            <View style={styles.scoreBox}>
              <Text style={styles.score}>{r.xp.toLocaleString()}</Text>
              <Text style={styles.scoreLabel}>XP</Text>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  meRow: {
    borderColor: 'rgba(124,92,250,0.45)',
    backgroundColor: 'rgba(124,92,250,0.18)',
  },
  otherRow: {
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  rankBox: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.50)',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#4C3FB8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  property: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
  },
  scoreBox: {
    alignItems: 'flex-end',
  },
  score: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
  },
  emptyHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.30)',
    textAlign: 'center',
  },
});
