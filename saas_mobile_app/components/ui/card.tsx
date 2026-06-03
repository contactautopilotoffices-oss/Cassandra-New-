import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle, TouchableOpacity, StyleProp } from 'react-native';

interface CardProps {
  glass?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pressable?: boolean;
  onPress?: () => void;
}

export const Card: React.FC<CardProps> = ({ glass = false, children, style, pressable, onPress }) => {
  const cardStyle = [glass ? styles.glassCard : styles.modernCard, style];
  const content = <View style={cardStyle}>{children}</View>;

  if (pressable && onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

export const CardHeader: React.FC<{ children: React.ReactNode; style?: ViewStyle }> = ({ children, style }) => (
  <View style={[styles.header, style]}>{children}</View>
);

export const CardTitle: React.FC<{ children: React.ReactNode; style?: TextStyle }> = ({ children, style }) => (
  <Text style={[styles.title, style]}>{children}</Text>
);

export const CardDescription: React.FC<{ children: React.ReactNode; style?: TextStyle }> = ({ children, style }) => (
  <Text style={[styles.description, style]}>{children}</Text>
);

export const CardContent: React.FC<{ children: React.ReactNode; style?: ViewStyle }> = ({ children, style }) => (
  <View style={[styles.content, style]}>{children}</View>
);

export const CardFooter: React.FC<{ children: React.ReactNode; style?: ViewStyle }> = ({ children, style }) => (
  <View style={[styles.footer, style]}>{children}</View>
);

// Design tokens — Apple-inspired
const CARD_PADDING = 20;
const CARD_RADIUS = 22;  // Apple Weather-style large radius
const CARD_SHADOW = {
  shadowColor: 'rgba(0,0,0,0.06)',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 1,
  shadowRadius: 12,
  elevation: 2,
};
const GLASS_SHADOW = {
  shadowColor: 'rgba(0,0,0,0.04)',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 1,
  shadowRadius: 8,
  elevation: 1,
};

const styles = StyleSheet.create({
  modernCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: '#E8E8ED',
    padding: CARD_PADDING,
    ...CARD_SHADOW,
    overflow: 'hidden',
  },
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    padding: CARD_PADDING,
    ...GLASS_SHADOW,
    overflow: 'hidden',
  },
  header: {
    paddingBottom: 12,
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1D1D1F',
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  content: {
    paddingTop: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#E8E8ED',
  },
});

export default Card;
