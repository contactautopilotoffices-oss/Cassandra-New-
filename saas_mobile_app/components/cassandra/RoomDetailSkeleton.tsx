/**
 * RoomDetailSkeleton — section-by-section placeholders for room detail
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/cassandra-theme';

function ShimmerBar({ width, height = 14, style }: { width: number | string; height?: number; style?: any }) {
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

function SectionSkeleton({ title }: { title?: string }) {
  return (
    <View style={styles.section}>
      {title && (
        <ShimmerBar width={100} height={18} style={{ marginBottom: Spacing.md }} />
      )}
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={styles.segmentRow}>
          <View style={styles.segmentMeta}>
            <ShimmerBar width={60} height={20} style={{ borderRadius: Radius.full }} />
            <ShimmerBar width={30} height={10} />
          </View>
          <ShimmerBar width="100%" height={14} />
        </View>
      ))}
    </View>
  );
}

export default function RoomDetailSkeleton() {
  return (
    <View style={styles.container}>
      {/* Room meta */}
      <View style={styles.metaSection}>
        <ShimmerBar width="40%" height={12} />
        <ShimmerBar width="70%" height={16} style={{ marginTop: 6 }} />
      </View>

      {/* Summary */}
      <SectionSkeleton title="Summary" />

      {/* Action items */}
      <SectionSkeleton title="Action Items" />

      {/* Transcript */}
      <SectionSkeleton title="Transcript" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  metaSection: {
    marginBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  segmentRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGlass,
    gap: 6,
  },
  segmentMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
