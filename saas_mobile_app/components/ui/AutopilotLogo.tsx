import React from 'react';
import { View, Text, StyleSheet, ViewStyle, Image } from 'react-native';
import Svg, { Path, SvgProps } from 'react-native-svg';

interface AutopilotLogoProps {
  size?: 'sm' | 'md' | 'lg' | number;
  variant?: 'light' | 'dark';
  style?: ViewStyle;
}

const SIZE_MAP = {
  sm: { height: 24, fontSize: 14 },
  md: { height: 32, fontSize: 18 },
  lg: { height: 48, fontSize: 26 },
};

export const AutopilotLogo: React.FC<AutopilotLogoProps> = ({
  size = 'md',
  variant = 'dark',
  style,
}) => {
  const sizeConfig = typeof size === 'number'
    ? { height: size, fontSize: size * 0.7 }
    : SIZE_MAP[size];
  const { height, fontSize } = sizeConfig;
  const color = variant === 'dark' ? '#000000' : '#FFFFFF';

  return (
    <View style={[styles.container, style]}>
      <Image
        source={require('../../assets/autopilot-logo-new.png')}
        style={{ width: height * 5, height: height, resizeMode: 'contain', tintColor: color }}
      />
    </View>
  );
};

export const AutopilotIcon: React.FC<{ size?: number; variant?: 'light' | 'dark'; style?: ViewStyle }> = ({
  size = 32,
  variant = 'dark',
  style,
}) => {
  const color = variant === 'dark' ? '#000000' : '#FFFFFF';

  return (
    <View style={style}>
      <Svg width={size * 0.8} height={size} viewBox="0 0 32 40" fill={color}>
        <Path d="M0 40 L16 0 L32 40 L24 40 L16 16 L8 40 Z" />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  text: {
    fontWeight: '400',
    letterSpacing: -0.5,
  },
});

export default AutopilotLogo;
