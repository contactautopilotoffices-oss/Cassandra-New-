import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@/context';

export default function TenantLayout() {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Tabs screenOptions={{ headerShown: false }} tabBar={() => null}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="requests" />
        <Tabs.Screen name="rooms" />
        <Tabs.Screen name="communities" />
        <Tabs.Screen name="visitors" />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
