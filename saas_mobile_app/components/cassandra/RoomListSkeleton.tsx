/**
 * RoomListSkeleton — exact layout match to room cards for seamless loading state
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated } from 'react-native';
import { Colors, Spacing, Radius } from '@/constants/cassandra-theme';

const { width: SCREEN_W } = Dimensions.get('window');

const CARD_WIDTH = SCREEN_W - Spacing.lg * 2;

function SkeletonBar({ width, height = 14, style }: { width: number | string; height?: number; style?: any }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] });

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          backgroundColor: 'rgba(255,255,255,0.12)',
          borderRadius: 4,
          opacity,
        },
        style,
      ]}
    />
  );
}

function RoomCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.titleRow}>
          <SkeletonBar width={CARD_WIDTH * 0.55} height={16} />
          <SkeletonBar width={52} height={20} style={{ borderRadius: Radius.full }} />
        </View>
        <SkeletonBar width={CARD_WIDTH * 0.3} height={12} style={{ marginTop: 4 }} />
      </View>
      <View style={styles.metaRow}>
        <SkeletonBar width={70} height={12} />
        <SkeletonBar width={60} height={12} />
        <SkeletonBar width={80} height={12} />
      </View>
      <View style={styles.footerRow}>
        <SkeletonBar width={CARD_WIDTH * 0.4} height={4} style={{ borderRadius: 2 }} />
        <SkeletonBar width={70} height={10} />
      </View>
    </View>
  );
}

export default function RoomListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <React.Fragment key={i}>
          <RoomCardSkeleton />
          {i < count - 1 && <View style={styles.separator} />}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  cardTop: {
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
  },
  separator: {
    height: 12,
  },
});
