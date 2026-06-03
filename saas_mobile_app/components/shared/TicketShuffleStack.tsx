import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Platform,
  LayoutChangeEvent,
} from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withRepeat,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context';
import TicketCard from './TicketCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Layout Constants ──────────────────────────────────────
const CARD_WIDTH    = SCREEN_WIDTH - 32;
const BORDER_WIDTH  = 2;
const BORDER_RADIUS = 20;
const MAX_VISIBLE   = 3;     // Max back cards shown as peeks
const PEEK_HEIGHT   = 16;    // How many px of each back card shows above the front
const STACK_SCALE   = 0.04;  // Scale reduction per back card layer

import { RotatingBorder } from './RotatingBorder';

// ─── Ticket type ───────────────────────────────────────────
export interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  assigned_to?: string | null;
  assignee?: { full_name: string; email: string; user_photo_url?: string | null } | null;
  creator?: { full_name: string } | null;
  photo_before_url?: string;
  raised_by?: string;
  internal?: boolean;
  property_id?: string;
  ticket_escalation_logs?: {
    from_level: number; to_level: number | null; escalated_at: string;
    from_employee?: { full_name: string; user_photo_url?: string | null } | null;
    to_employee?:   { full_name: string; user_photo_url?: string | null } | null;
  }[];
}

interface TicketShuffleStackProps {
  tickets: Ticket[];
  user: any;
  propertyId: string;
  onEdit: (t: Ticket) => void;
  tick?: number;
}

// ─── Stack Container ───────────────────────────────────────
export function TicketShuffleStack({ tickets, user, propertyId, onEdit, tick }: TicketShuffleStackProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tallestCardHeight, setTallestCardHeight] = useState(200);
  const translateX = useSharedValue(0);

  const displayTickets = useMemo(() => {
    const total = tickets.length;
    if (total === 0) return [];
    const result = [];
    for (let i = 0; i < Math.min(total, MAX_VISIBLE + 1); i++) {
      result.push(tickets[(currentIndex + i) % total]);
    }
    return result;
  }, [tickets, currentIndex]);

  const handleSwipe = () => {
    translateX.value = 0;
    setCurrentIndex(prev => (prev + 1) % Math.max(1, tickets.length));
  };

  const onCardLayout = useCallback((height: number) => {
    // We want the container to at least fit the content, 
    // but maybe cap it or smooth it?
    setTallestCardHeight(prev => Math.max(prev, height));
  }, []);

  if (tickets.length === 0) return null;

  return (
    <View style={[styles.stackContainer, { height: tallestCardHeight + (MAX_VISIBLE * PEEK_HEIGHT) + 30 }]}>
      {displayTickets.map((ticket, i) => (
        <AnimatedTicketCard
          key={ticket.id}
          ticket={ticket}
          index={i}
          total={displayTickets.length}
          translateX={translateX}
          onSwipe={handleSwipe}
          propertyId={propertyId}
          onEdit={onEdit}
          onHeightMeasured={onCardLayout}
          tick={tick}
        />
      )).reverse()}
    </View>
  );
}

// ─── Individual Card ───────────────────────────────────────
function AnimatedTicketCard({
  ticket, index, total, translateX, onSwipe, propertyId, onEdit, onHeightMeasured, tick
}: {
  ticket: Ticket; index: number; total: number; translateX: any;
  onSwipe: () => void; propertyId: string; onEdit: (t: Ticket) => void;
  onHeightMeasured: (h: number) => void; tick?: number;
}) {
  const router = useRouter();
  const { isDark } = useTheme();
  const isTop = index === 0;
  const [cardHeight, setCardHeight] = useState(0);

  const baseTop = (MAX_VISIBLE - index) * PEEK_HEIGHT;

  const animatedStyle = useAnimatedStyle(() => {
    const swipeAbs = Math.abs(translateX.value);
    const swipeProgress = Math.min(swipeAbs / 160, 1);

    if (isTop) {
      return {
        transform: [
          { translateX: translateX.value },
          { scale: interpolate(swipeAbs, [0, SCREEN_WIDTH], [1, 0.94], Extrapolate.CLAMP) },
          { rotate: `${interpolate(translateX.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-8, 0, 8], Extrapolate.CLAMP)}deg` },
        ],
        zIndex: total + 1,
      };
    }

    const scale = interpolate(
      swipeProgress,
      [0, 1],
      [1 - index * STACK_SCALE, 1 - (index - 1) * STACK_SCALE],
      Extrapolate.CLAMP
    );
    const translateY = interpolate(
      swipeProgress,
      [0, 1],
      [0, PEEK_HEIGHT],
      Extrapolate.CLAMP
    );

    return {
      transform: [{ scale }, { translateY }],
      zIndex: total - index,
      opacity: interpolate(index, [0, 1, 2, 3], [1, 1, 0.85, 0.65], Extrapolate.CLAMP),
    };
  });

  const pan = Gesture.Pan()
    .enabled(isTop)
    .minDistance(5)
    .shouldCancelWhenOutside(true)
    .onUpdate((e) => { translateX.value = e.translationX; })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 100 || Math.abs(e.velocityX) > 500) {
        const dest = e.translationX > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH;
        translateX.value = withSpring(
          dest,
          { velocity: e.velocityX, damping: 15, stiffness: 120, mass: 0.8 },
          () => runOnJS(onSwipe)()
        );
      } else {
        translateX.value = withSpring(0, { damping: 15, stiffness: 120 });
      }
    });

  const onLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0 && Math.abs(cardHeight - height) > 1) {
      setCardHeight(height);
      onHeightMeasured(height);
    }
  };

  const escalationChain = useMemo(() => {
    const logs = ticket.ticket_escalation_logs;
    if (!logs || logs.length === 0) return undefined;
    const sorted = [...logs].sort((a, b) => new Date(a.escalated_at).getTime() - new Date(b.escalated_at).getTime());
    const chain: { name: string; avatar?: string | null }[] = [];
    sorted.forEach((log, i) => {
      if (i === 0 && log.from_employee?.full_name) chain.push({ name: log.from_employee.full_name, avatar: log.from_employee.user_photo_url });
      if (log.to_employee?.full_name) chain.push({ name: log.to_employee.full_name, avatar: log.to_employee.user_photo_url });
    });
    return chain.length > 0 ? chain : undefined;
  }, [ticket.ticket_escalation_logs]);

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[
        styles.animatedWrapper,
        { top: baseTop },
        animatedStyle,
        {
          shadowColor: isTop ? (isDark ? '#6366F1' : '#64748B') : 'transparent',
          shadowOpacity: isTop ? 0.32 : 0,
          shadowRadius: isTop ? 22 : 0,
          elevation: isTop ? 16 : index === 1 ? 8 : 4,
          height: cardHeight > 0 ? cardHeight + BORDER_WIDTH * 2 : undefined,
        },
        Platform.OS === 'web' && { touchAction: 'none' } as any,
      ]}>
        <View style={styles.borderContainer}>
          {/* Rotating aurora border */}
          {cardHeight > 0 && (
            <RotatingBorder
              width={CARD_WIDTH}
              height={cardHeight}
              isDark={isDark}
              speed={isTop ? 4000 : 7000}
              opacity={isTop ? 1 : index === 1 ? 0.65 : 0.4}
            />
          )}

          {/* Glass card content */}
          <View style={[
            styles.glassContent,
            { 
              backgroundColor: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,1)',
              height: cardHeight > 0 ? cardHeight : undefined // Let it be auto during first measure
            },
          ]}>
            {Platform.OS === 'ios' && (
              <SafeBlurView intensity={isTop ? 60 : 80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            )}
            
            {/* Top shimmer highlight */}
            <View pointerEvents="none" style={styles.shimmerWrapper}>
              <LinearGradient
                colors={[isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,1)', 'rgba(255,255,255,0)']}
                style={StyleSheet.absoluteFill}
              />
            </View>

            {/* Inner Content Wrapper - We measure this! */}
            <View onLayout={onLayout} style={{ width: '100%' }}>
              <TicketCard
                id={ticket.id}
                title={ticket.title}
                priority={(ticket.priority?.toUpperCase() as any) || 'MEDIUM'}
                status={
                  ['closed', 'resolved'].includes(ticket.status) ? 'COMPLETED' :
                  ticket.status === 'in_progress' ? 'IN_PROGRESS' :
                  ticket.assigned_to ? 'ASSIGNED' : 'OPEN'
                }
                ticketNumber={ticket.ticket_number || `TKT-${ticket.id.slice(0, 8)}`}
                createdAt={ticket.created_at}
                assignedTo={ticket.assignee?.full_name || 'Unassigned'}
                assigneePhotoUrl={ticket.assignee?.user_photo_url}
                photoUrl={ticket.photo_before_url}
                materialsOrdered={(ticket as any).materials_ordered}
                escalationChain={escalationChain}
                onClick={() => router.push(`/property/${propertyId}/tickets/${ticket.id}` as any)}
                onEdit={() => onEdit(ticket)}
                raisedByName={ticket.creator?.full_name || ticket.raised_by || 'Anonymous'}
                compact
                glass={false}
                style={{
                  backgroundColor: 'transparent',
                  borderWidth: 0,
                  shadowOpacity: 0,
                  elevation: 0,
                }}
                tick={tick}
              />
            </View>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  stackContainer: {
    width: CARD_WIDTH,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
    zIndex: 1,
  },
  animatedWrapper: {
    position: 'absolute',
    left: 0,
    width: CARD_WIDTH,
    borderRadius: BORDER_RADIUS,
    shadowOffset: { width: 0, height: 8 },
  },
  borderContainer: {
    borderRadius: BORDER_RADIUS,
    overflow: 'hidden',
  },
  glassContent: {
    margin: BORDER_WIDTH,
    borderRadius: BORDER_RADIUS - BORDER_WIDTH,
    overflow: 'hidden',
  },
  shimmerWrapper: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 48,
    borderTopLeftRadius:  BORDER_RADIUS - BORDER_WIDTH,
    borderTopRightRadius: BORDER_RADIUS - BORDER_WIDTH,
    overflow: 'hidden',
    zIndex: 1,
    pointerEvents: 'none',
  },
});
