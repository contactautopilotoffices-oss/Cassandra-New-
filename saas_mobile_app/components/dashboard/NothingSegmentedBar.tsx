'use client';

/**
 * NothingSegmentedBar — Nothing Design System segmented progress bar
 *
 * Discrete rectangular blocks with 2px gaps, square ends.
 * Nothing Design: no border-radius > 16px on cards; bars are square.
 * Nothing Design: Space Mono for labels/numbers.
 *
 * Variants:
 * - hero:   16px tall — for KPI display
 * - standard: 8px tall — for standard progress
 * - compact:  4px tall — for inline progress
 *
 * Usage: ticket closure rate, checklist completion, occupancy bar
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

// Space Mono — monospace for all data labels
const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

type BarVariant = 'hero' | 'standard' | 'compact';

interface NothingSegmentedBarProps {
  /** Current value */
  value: number;
  /** Max value (default 100) */
  max?: number;
  /** Color of filled segments */
  fillColor?: string;
  /** Color of empty segments */
  emptyColor?: string;
  /** Variant: hero | standard | compact */
  variant?: BarVariant;
  /** Show numeric readout */
  showLabel?: boolean;
  /** Label text (e.g. "TICKETS" or "%") */
  label?: string;
  /** Number of total segments */
  segments?: number;
  /** Optional custom width */
  width?: number | string;
}

const VARIANT_HEIGHT: Record<BarVariant, number> = {
  hero: 16,
  standard: 8,
  compact: 4,
};

const SEGMENT_GAP = 2;

export default function NothingSegmentedBar({
  value,
  max = 100,
  fillColor = '#FFFFFF',
  emptyColor = 'rgba(255,255,255,0.12)',
  variant = 'standard',
  showLabel = false,
  label,
  segments = 12,
  width,
}: NothingSegmentedBarProps) {
  const filledCount = Math.round((value / max) * segments);
  const height = VARIANT_HEIGHT[variant];

  const barStyle = {
    height,
    borderRadius: 0, // Nothing Design: square ends
  };

  return (
    <View style={styles.container}>
      {/* Segmented bar */}
      <View style={[styles.bar, { width: width as any }, barStyle]}>
        {Array.from({ length: segments }).map((_, i) => {
          const isFilled = i < filledCount;
          return (
            <View
              key={i}
              style={[
                styles.segment,
                barStyle,
                {
                  backgroundColor: isFilled ? fillColor : emptyColor,
                  marginRight: i < segments - 1 ? SEGMENT_GAP : 0,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Numeric readout */}
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={styles.valueText}>
            {value}
            {label ? ` ${label}` : ''}
          </Text>
          {max !== 100 && (
            <Text style={styles.maxText}>/ {max}</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ---- Circular Arc Gauge (companion component) ----
import Svg, { Path } from 'react-native-svg';

interface NothingArcGaugeProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  fillColor?: string;
  emptyColor?: string;
  showValue?: boolean;
}

export function NothingArcGauge({
  value,
  max = 100,
  size = 80,
  strokeWidth = 3,
  fillColor = '#FFFFFF',
  emptyColor = 'rgba(255,255,255,0.12)',
  showValue = false,
}: NothingArcGaugeProps) {
  const progress = Math.min(value / max, 1);
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius; // half-circle
  const dashOffset = circumference * (1 - progress);

  // SVG arc path for a semi-circle
  const arcPath = `M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`;

  return (
    <View style={{ width: size, height: size / 2 + 10, alignItems: 'center' }}>
      <Svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        {/* Background arc */}
        <Path
          d={arcPath}
          fill="none"
          stroke={emptyColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <Path
          d={arcPath}
          fill="none"
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={[circumference]}
          strokeDashoffset={dashOffset}
        />
      </Svg>
      {showValue && (
        <View style={[styles.gaugeLabel, { bottom: 2 }]}>
          <Text style={styles.gaugeValue}>{value}</Text>
          {max !== 100 && <Text style={styles.gaugeMax}>/{max}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // nothing extra — just the bar
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
    gap: 4,
  },
  valueText: {
        fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  maxText: {
        fontSize: 11,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
  },
  gaugeLabel: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  gaugeValue: {
        fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0,
  },
  gaugeMax: {
        fontSize: 10,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.35)',
  },
});
