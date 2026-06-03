/**
 * XPBar — Slim animated progress bar showing XP toward the next level.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  xp: number;
  xpForNext: number;
}

export function XPBar({ xp, xpForNext }: Props) {
  const pct = Math.min(100, (xp / xpForNext) * 100);
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: pct,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>XP</Text>
        <Text style={styles.value}>
          {xp.toLocaleString()} / {xpForNext.toLocaleString()}
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: animWidth.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        >
          <LinearGradient
            colors={['#7C5CFA', '#A855F7', '#22D3EE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.80)',
    letterSpacing: 0.5,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginTop: 6,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 6,
  },
});
