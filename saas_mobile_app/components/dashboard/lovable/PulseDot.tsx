import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface PulseDotProps {
  color: string;
}

export default function PulseDot({ color }: PulseDotProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    scale.value = withRepeat(
      withTiming(0.85, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [scale, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.statusDotBase,
        {
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 1,
          shadowRadius: 6,
          elevation: 4,
        },
        animStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  statusDotBase: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
