import React from 'react';
import { StyleSheet, View, ImageBackground } from 'react-native';
import { useDashboardStore } from '@/stores/dashboardStore';

export default function DashboardBackground() {
  const backgroundImage = useDashboardStore((s) => s.backgroundImage);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <ImageBackground 
        source={{ uri: backgroundImage }} 
        style={StyleSheet.absoluteFillObject} 
        resizeMode="cover"
      >
        {/* Dark backdrop overlay to ensure text readability */}
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(10, 10, 15, 0.85)' }]} />
      </ImageBackground>
    </View>
  );
}
