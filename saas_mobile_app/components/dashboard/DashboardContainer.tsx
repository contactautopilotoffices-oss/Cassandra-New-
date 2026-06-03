import React from 'react';
import { View, ScrollView, StyleSheet, ViewStyle } from 'react-native';

interface DashboardContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export default function DashboardContainer({ children, style }: DashboardContainerProps) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, style]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFC',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
});
