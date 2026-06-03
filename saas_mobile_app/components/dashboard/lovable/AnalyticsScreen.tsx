import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnalyticsTab from '../AnalyticsTab';
import { BG } from './constants';

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[styles.container, { backgroundColor: BG }]}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ 
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 20,
        }}
      >
        <AnalyticsTab />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
});
