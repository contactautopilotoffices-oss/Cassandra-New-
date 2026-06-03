import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const SkeletonItem = ({ style }: { style: any }) => {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.skeletonBase, style, animatedStyle]} />;
};

export default function SkeletonLoader() {
  return (
    <View style={styles.container}>
      {/* Header Skeleton */}
      <View style={styles.header}>
        <View>
          <SkeletonItem style={styles.title} />
          <SkeletonItem style={styles.subtitle} />
        </View>
        <SkeletonItem style={styles.avatar} />
      </View>

      {/* Search Bar Skeleton */}
      <SkeletonItem style={styles.searchBar} />

      {/* Cards Skeleton */}
      {[1, 2, 3, 4].map((i) => (
        <SkeletonItem key={i} style={styles.card} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  skeletonBase: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 12,
  },
  title: {
    width: 140,
    height: 32,
    marginBottom: 8,
    borderRadius: 8,
  },
  subtitle: {
    width: 180,
    height: 16,
    borderRadius: 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  searchBar: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    marginBottom: 24,
  },
  card: {
    width: '100%',
    height: 120,
    borderRadius: 24,
    marginBottom: 14,
  },
});
