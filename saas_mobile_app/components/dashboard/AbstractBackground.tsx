import React, { useMemo, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  Easing,
  interpolate
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

interface BlobProps {
  color: string;
  size: number;
  initialX: number;
  initialY: number;
  duration: number;
}

const Blob = ({ color, size, initialX, initialY, duration }: BlobProps) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [duration, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(progress.value, [0, 1], [-20, 20]);
    const translateY = interpolate(progress.value, [0, 1], [-30, 30]);
    const scale = interpolate(progress.value, [0, 1], [1, 1.2]);
    
    return {
      transform: [
        { translateX: initialX + translateX },
        { translateY: initialY + translateY },
        { scale }
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.blob,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
};

export default function AbstractBackground() {
  const blobs = useMemo(() => [
    { color: 'rgba(14, 165, 233, 0.45)', size: width * 1.3, x: -width * 0.2, y: -height * 0.1, duration: 8000 },
    { color: 'rgba(56, 189, 248, 0.35)', size: width * 1.6, x: width * 0.1, y: height * 0.2, duration: 10000 },
    { color: 'rgba(99, 102, 241, 0.3)', size: width * 1.4, x: -width * 0.3, y: height * 0.5, duration: 12000 },
    { color: 'rgba(34, 211, 238, 0.4)', size: width * 1.5, x: width * 0.2, y: height * 0.4, duration: 9000 },
  ], []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Base Gradient - Lighter Blue */}
      <LinearGradient
        colors={['#075985', '#0369A1', '#075985']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Animated Blobs */}
      <View style={styles.blobsContainer}>
        {blobs.map((blob, i) => (
          <Blob 
            key={i}
            color={blob.color}
            size={blob.size}
            initialX={blob.x}
            initialY={blob.y}
            duration={blob.duration}
          />
        ))}
      </View>

      {/* Glass Overlay (Subtle) */}
      <View style={[StyleSheet.absoluteFill, styles.overlay]} />
    </View>
  );
}

const styles = StyleSheet.create({
  blobsContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    opacity: 0.6,
    // Blur is handled via a combination of large size, low opacity, 
    // and potentially a real blur if available, but large circles work well for mesh look.
  },
  overlay: {
    backgroundColor: 'rgba(15, 23, 42, 0.2)',
  },
});
