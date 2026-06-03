/**
 * AuroraBackground — Clean minimal gradient canvas
 *
 * Replaced dark atmospheric night sky with a clean, light-neutral gradient
 * that lets the glass cards breathe without visual clutter.
 */

import React from 'react';
import { StyleSheet, Dimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: W, height: H } = Dimensions.get('window');

export function AuroraBackground({ colors }: { colors?: any }) {
  return (
    <View style={styles.container} pointerEvents="none">
      {/* Clean light gradient — warm white to soft gray */}
      <LinearGradient
        colors={['#F8F9FB', '#EEF1F5', '#E8ECF2']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
});
