import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * PageTransition - In React Native, page transitions are handled by
 * the navigation library (Expo Router / React Navigation).
 * This component is a pass-through wrapper to maintain API compatibility.
 */
interface PageTransitionProps {
  children: React.ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
  return <View style={styles.container}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
