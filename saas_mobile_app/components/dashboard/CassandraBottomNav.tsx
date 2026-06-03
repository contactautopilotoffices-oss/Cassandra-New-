/**
 * CassandraBottomNav — Pill-shaped floating nav bar
 * Inspired by modern fitness/wellness app bottom navs.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Colors, Radius } from '@/constants/cassandra-theme';
import { SPACING } from '@/constants/designSystem';

export type NavItem = 'home' | 'calendar' | 'activity' | 'rewards';

interface CassandraBottomNavProps {
  active: NavItem;
  onChange: (item: NavItem) => void;
}

const NAV_ITEMS: { key: NavItem; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  {
    key: 'home',
    label: 'Home',
    icon: (active) => (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill={active ? '#1a1a1a' : 'none'} stroke={active ? '#1a1a1a' : 'rgba(255,255,255,0.70)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <Path d="M9 22V12h6v10" />
      </Svg>
    ),
  },
  {
    key: 'calendar',
    label: 'Schedule',
    icon: (active) => (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill={active ? '#1a1a1a' : 'none'} stroke={active ? '#1a1a1a' : 'rgba(255,255,255,0.70)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
        <Path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
      </Svg>
    ),
  },
  {
    key: 'activity',
    label: 'Activity',
    icon: (active) => (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill={active ? '#1a1a1a' : 'none'} stroke={active ? '#1a1a1a' : 'rgba(255,255,255,0.70)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M6.5 6.5h11M6.5 17.5h11M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 12h.01" />
        <Path d="M4 4h16v16H4z" opacity={0} />
        <Path d="M4 10h16M4 14h16" />
      </Svg>
    ),
  },
  {
    key: 'rewards',
    label: 'Rewards',
    icon: (active) => (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill={active ? '#1a1a1a' : 'none'} stroke={active ? '#1a1a1a' : 'rgba(255,255,255,0.70)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </Svg>
    ),
  },
];

export const CassandraBottomNav: React.FC<CassandraBottomNavProps> = ({
  active,
  onChange,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.pill}>
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => onChange(item.key)}
              activeOpacity={0.8}
              style={styles.item}
            >
              {isActive && (
                <View
                  style={styles.activePill}
                />
              )}
              <View style={styles.iconWrapper}>{item.icon(isActive)}</View>
              {isActive && (
                <Text style={styles.activeLabel}>{item.label}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30,30,35,0.92)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    position: 'relative',
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderRadius: 999,
  },
  iconWrapper: {
    zIndex: 1,
  },
  activeLabel: {
    color: '#1a1a1a',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
    zIndex: 1,
  },
});

export default CassandraBottomNav;
