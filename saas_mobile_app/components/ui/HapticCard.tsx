import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Pressable,
  ViewStyle,
} from 'react-native';

const DWELL_DURATION_MS = 2000;

interface HapticCardProps {
  id: string;
  isExpanded: boolean;
  onActivate: (id: string | null) => void;
  baseContent: React.ReactNode;
  expandedContent?: React.ReactNode;
  style?: ViewStyle;
}

export const HapticCard: React.FC<HapticCardProps> = ({
  id,
  isExpanded,
  onActivate,
  baseContent,
  expandedContent,
  style,
}) => {
  const [isDwelling, setIsDwelling] = useState(false);
  const [dwellProgress, setDwellProgress] = useState(0);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;

  const clearTimers = useCallback(() => {
    if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    dwellTimerRef.current = null;
    progressIntervalRef.current = null;
  }, []);

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isExpanded ? 1.02 : 1,
      damping: 15,
      stiffness: 200,
      useNativeDriver: true,
    }).start();

    Animated.timing(expandAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isExpanded]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const handlePressIn = () => {
    if (isExpanded) return;
    setIsDwelling(true);
    setDwellProgress(0);

    const startTime = Date.now();
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setDwellProgress(Math.min((elapsed / DWELL_DURATION_MS) * 100, 100));
    }, 50);

    dwellTimerRef.current = setTimeout(() => {
      clearTimers();
      setIsDwelling(false);
      onActivate(id);
    }, DWELL_DURATION_MS);
  };

  const handlePressOut = () => {
    clearTimers();
    setIsDwelling(false);
    setDwellProgress(0);
    if (isExpanded) onActivate(null);
  };

  return (
    <Animated.View
      style={[
        styles.card,
        { transform: [{ scale: scaleAnim }] },
        isExpanded && styles.expanded,
        isDwelling && styles.dwelling,
        style,
      ]}
    >
      <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut}>
        {/* Dwell Progress */}
        {isDwelling && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${dwellProgress}%` as any }]} />
          </View>
        )}

        {/* Base Content */}
        <View style={styles.content}>{baseContent}</View>

        {/* Expanded Content */}
        {isExpanded && expandedContent && (
          <View style={styles.expandedContent}>{expandedContent}</View>
        )}
      </Pressable>
    </Animated.View>
  );
};

interface HapticCardGridProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const HapticCardGrid: React.FC<HapticCardGridProps> = ({ children, style }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const enhancedChildren = React.Children.map(children, (child) => {
    if (React.isValidElement<HapticCardProps>(child)) {
      const isExpanded = child.props.id === expandedId;
      return React.cloneElement(child, {
        isExpanded,
        onActivate: setExpandedId,
      });
    }
    return child;
  });

  return <View style={[styles.grid, style]}>{enhancedChildren}</View>;
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  expanded: {
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  dwelling: {
    borderColor: '#CBD5E1',
    borderWidth: 2,
  },
  content: {
    padding: 24,
  },
  expandedContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#F1F5F9',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#94A3B8',
    borderRadius: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
});

export default HapticCard;
