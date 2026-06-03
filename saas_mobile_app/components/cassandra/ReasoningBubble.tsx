/**
 * ReasoningBubble — Collapsible Chain-of-Thought UI
 *
 * PRD: Cassandra UI, SSE Streaming, and Data Architecture
 * Shows the agent's internal reasoning steps as a dedicated UI component
 * while keeping the primary chat response clean.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import {
  Colors,
  Typography,
  Spacing as CassSpacing,
  Radius,
} from '@/constants/cassandra-theme';
import { CARD_SURFACES } from '@/constants/designSystem';
import Svg, { Path } from 'react-native-svg';

// ─── Icons ─────────────────────────────────────────────────────────────────
const ChevronDownIcon = ({ size = 14, color = Colors.textMuted }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M6 9l6 6 6-6" />
  </Svg>
);

const SparkleIcon = ({ size = 14, color = Colors.violet }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
    <Path d="M5 3v4M3 5h4M19 17v4M17 19h4" />
  </Svg>
);

// ─── Types ─────────────────────────────────────────────────────────────────
interface ReasoningBubbleProps {
  steps: string[];
  isActive: boolean;
  onPress?: () => void;
  onAbort?: () => void;
}

// ─── Animated Dots ─────────────────────────────────────────────────────────
const ThinkingDots = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createPulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 400, useNativeDriver: true }),
        ])
      );

    const a1 = createPulse(dot1, 0);
    const a2 = createPulse(dot2, 150);
    const a3 = createPulse(dot3, 300);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, []);

  const dots = [dot1, dot2, dot3];

  return (
    <View style={styles.dotsRow}>
      {dots.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              transform: [
                {
                  scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────
export const ReasoningBubble: React.FC<ReasoningBubbleProps> = ({
  steps,
  isActive,
  onPress,
  onAbort,
}) => {
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expanded]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // Show the latest step as preview, or a default
  const latestStep = steps.length > 0 ? steps[steps.length - 1] : 'Thinking…';
  const displaySteps = steps.length > 0 ? steps : ['Starting…'];

  return (
    <View style={styles.container}>
      {/* Collapsed / Preview Row */}
      <TouchableOpacity
        onPress={() => {
          setExpanded(!expanded);
          onPress?.();
        }}
        activeOpacity={0.8}
        style={styles.headerRow}
      >
        <View style={styles.headerLeft}>
          <SparkleIcon size={14} color={Colors.violet} />
          {isActive ? (
            <View style={styles.thinkingRow}>
              <Text style={styles.previewText} numberOfLines={1}>
                {latestStep}
              </Text>
              <ThinkingDots />
            </View>
          ) : (
            <Text style={styles.previewText} numberOfLines={1}>
              {steps.length > 1
                ? `Thought through ${steps.length} steps`
                : latestStep}
            </Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isActive && onAbort && (
            <TouchableOpacity onPress={onAbort} activeOpacity={0.7} style={styles.abortBtn}>
              <Text style={styles.abortText}>Stop</Text>
            </TouchableOpacity>
          )}
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <ChevronDownIcon size={14} color={Colors.textMuted} />
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* Expanded Steps Timeline */}
      {expanded && (
        <View style={styles.stepsContainer}>
          {displaySteps.map((step, index) => (
            <View key={`${index}-${step}`} style={styles.stepRow}>
              {/* Timeline connector */}
              <View style={styles.timeline}>
                <View style={styles.timelineDot} />
                {index < displaySteps.length - 1 && (
                  <View style={styles.timelineLine} />
                )}
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    maxWidth: '85%',
    marginBottom: CassSpacing.sm,
    backgroundColor: CARD_SURFACES.cardBg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    borderTopLeftRadius: Radius.sm,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CassSpacing.md,
    paddingVertical: CassSpacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  previewText: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    flex: 1,
  },
  abortBtn: {
    backgroundColor: 'rgba(244,63,94,0.15)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.3)',
  },
  abortText: {
    ...Typography.bodySmall,
    color: '#F43F5E',
    fontWeight: '600',
    fontSize: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.violet,
  },
  stepsContainer: {
    paddingHorizontal: CassSpacing.md,
    paddingBottom: CassSpacing.md,
    paddingTop: CassSpacing.xs,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: CassSpacing.sm,
  },
  timeline: {
    width: 16,
    alignItems: 'center',
    marginRight: 8,
    marginTop: 4,
  },
  timelineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.violet,
    opacity: 0.5,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    backgroundColor: Colors.violet,
    opacity: 0.2,
    marginTop: 2,
    minHeight: 16,
  },
  stepText: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    flex: 1,
    lineHeight: 18,
  },
});

export default ReasoningBubble;
