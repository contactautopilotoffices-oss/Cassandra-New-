/**
 * PremiumSun — Ultra-subtle atmospheric sun glow
 * Inspired by Apple Weather: soft white bloom, no harsh edges, no rays.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

interface PremiumSunProps {
  size?: number;
}

export const PremiumSun: React.FC<PremiumSunProps> = ({ size = 300 }) => {
  const center = size / 2;
  const glowRadius = size * 0.48;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id="sunBloom" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.35} />
            <Stop offset="30%" stopColor="#FFF8E7" stopOpacity={0.18} />
            <Stop offset="60%" stopColor="#FFE4B5" stopOpacity={0.08} />
            <Stop offset="100%" stopColor="#FFD180" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="sunCore" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.9} />
            <Stop offset="40%" stopColor="#FFF5E1" stopOpacity={0.5} />
            <Stop offset="100%" stopColor="#FFE4B5" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Wide soft bloom */}
        <Circle cx={center} cy={center} r={glowRadius} fill="url(#sunBloom)" />

        {/* Tiny bright core */}
        <Circle cx={center} cy={center} r={size * 0.08} fill="url(#sunCore)" />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default PremiumSun;
