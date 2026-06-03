import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  RefreshControl, 
  ActivityIndicator,
  Dimensions,
  Platform
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { serverApi } from '@/lib/serverApi';
import { createClient } from '@/utils/supabase/client';
import { useTheme } from '@/context';
import TicketCard from '@/components/shared/TicketCard';
import { LinearGradient } from 'expo-linear-gradient';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';


const supabase = createClient();

const { width: FLOWMAP_WIDTH, height: FLOWMAP_HEIGHT } = Dimensions.get('window');

type TicketStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';

interface Ticket {
  id: string;
  title: string;
  ticket_number: string;
  status: string;
  priority: string;
  created_at: string;
  assigned_to?: string;
  photo_before_url?: string;
  assignee?: {
    full_name: string;
    user_photo_url: string;
  };
  creator?: {
    full_name: string;
  };
  ticket_escalation_logs?: any[];
}

const STAGES = [
  { key: 'assigned', label: 'ASSIGNED', icon: 'people-outline', color: '#3B82F6' },
  { key: 'in_progress', label: 'IN PROGRESS', icon: 'construct-outline', color: '#F59E0B' },
  { key: 'resolved', label: 'VALIDATION', icon: 'shield-checkmark-outline', color: '#10B981' },
  { key: 'completed', label: 'COMPLETED', icon: 'checkmark-done-circle-outline', color: '#94A3B8' },
];

import { 
  Gesture, 
  GestureDetector, 
  GestureHandlerRootView 
} from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  useDerivedValue,
  withSpring, 
  runOnJS,
  interpolate,
  Extrapolate
} from 'react-native-reanimated';

export default function LiveFlowMap() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [tickets, setTickets] = useState<Ticket[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [propertyName, setPropertyName] = useState('Property');
  const [isDragging, setIsDragging] = useState(false);
  const [validationEnabled, setValidationEnabled] = useState(false);
  
  // Layout tracking for drop zones
  const sectionLayouts = useSharedValue<Record<string, { y: number, height: number }>>({});
  const [activeDropZone, setActiveDropZone] = useState<string | null>(null);

  const fetchFlowData = async () => {
    if (!propertyId) return;

    // Fetch Property Name
    const propRes = await serverApi.query({ table: 'properties', action: 'select', select: 'name', filters: [{ op: 'eq', column: 'id', value: propertyId }], single: true });
    if (propRes.data) setPropertyName((propRes.data as { name: string }).name);

    // Fetch Validation Feature Status
    const featRes = await serverApi.query({ table: 'property_features', action: 'select', select: 'is_enabled', filters: [{ op: 'eq', column: 'property_id', value: propertyId }, { op: 'eq', column: 'feature_key', value: 'ticket_validation' }], maybeSingle: true });
    setValidationEnabled((featRes.data as { is_enabled: boolean } | null)?.is_enabled === true);

    const { data, error } = await (supabase
      .from('tickets')
      .select(`
        *,
        assignee:users!assigned_to(id, full_name, user_photo_url),
        creator:users!raised_by(id, full_name),
        ticket_escalation_logs(from_level, to_level, escalated_at, from_employee:users!from_employee_id(full_name, user_photo_url), to_employee:users!to_employee_id(full_name, user_photo_url))
      `)
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false }) as any);

    if (!error) setTickets(data || []);
    setIsLoading(false);
  };

  const { refetch } = useDashboardFetch(queryKeys.property.flowMap(propertyId), fetchFlowData, {
    staleTime: 1000 * 60 * 5,
  });

  const activeStages = useMemo(() => {
    return STAGES.filter(s => s.key !== 'resolved' || validationEnabled);
  }, [validationEnabled]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const groupedTickets = useMemo(() => {
    const groups: Record<string, Ticket[]> = { assigned: [], in_progress: [], resolved: [], completed: [] };
    tickets.forEach(ticket => {
      const status = (ticket.status || '').toLowerCase();
      if (['resolved', 'closed', 'completed'].includes(status)) {
        groups.completed.push(ticket);
      } else if (status === 'resolved') {
        groups.resolved.push(ticket);
      } else if (status === 'in_progress') {
        groups.in_progress.push(ticket);
      } else {
        // Everything else (open, assigned, etc.) goes to assigned
        groups.assigned.push(ticket);
      }
    });
    return groups;
  }, [tickets, validationEnabled]);

  const updateTicketStatus = async (ticketId: string, newStageKey: string) => {
    let newStatus = newStageKey;
    let updatePayload: any = { status: newStatus };

    if (newStageKey === 'open') {
        updatePayload.status = 'open';
        updatePayload.assigned_to = null;
    } else if (newStageKey === 'completed') {
        updatePayload.status = 'resolved';
    }

    const { error } = await ((supabase as any).from('tickets').update(updatePayload).eq('id', ticketId));
    if (!error) {
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, ...updatePayload } : t));
    }
  };

  const FlowShuffleStack = ({ tickets, stageKey }: { tickets: Ticket[], stageKey: string }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const translateX = useSharedValue(0);

    const displayTickets = useMemo(() => {
        const total = tickets.length;
        if (total === 0) return [];
        const result = [];
        for (let i = 0; i < Math.min(total, 5); i++) {
          result.push(tickets[(currentIndex + i) % total]);
        }
        return result;
    }, [tickets, currentIndex]);

    const handleSwipe = () => {
        translateX.value = 0;
        setCurrentIndex(prev => (prev + 1) % Math.max(1, tickets.length));
    };

    if (tickets.length === 0) {
        return (
            <View style={styles.emptyStage}>
                <Text style={styles.emptyText}>No requests here</Text>
            </View>
        );
    }

    return (
        <View style={styles.stackWrapper}>
            {displayTickets.map((ticket, i) => (
                <FlowDraggableCard 
                    key={ticket.id}
                    ticket={ticket}
                    index={i}
                    total={displayTickets.length}
                    stageKey={stageKey}
                    translateX={translateX}
                    onSwipe={handleSwipe}
                />
            )).reverse()}
        </View>
    );
  };

  function FlowDraggableCard({ 
    ticket, index, total, stageKey, translateX, onSwipe 
  }: { 
    ticket: Ticket; index: number; total: number; stageKey: string; translateX: any; onSwipe: () => void;
  }) {
    const isTop = index === 0;
    const dragY = useSharedValue(0);
    const dragXAdjust = useSharedValue(0);
    const scale = useSharedValue(1);
    const isInteracting = useSharedValue(false);

    const derivedIndex = useDerivedValue(() => {
        return withSpring(index, { damping: 25, stiffness: 150 });
    });

    const checkDropZone = (y: number) => {
        'worklet';
        let foundZone = null;
        const layouts = sectionLayouts.value;
        for (const key in layouts) {
            const zone = layouts[key];
            if (y >= zone.y && y <= zone.y + zone.height) {
                foundZone = key;
                break;
            }
        }
        if (foundZone !== activeDropZone) {
            runOnJS(setActiveDropZone)(foundZone);
        }
        return foundZone;
    };

    const shufflePan = Gesture.Pan()
        .onUpdate((e) => {
            if (!isTop || isDragging) return;
            translateX.value = e.translationX;
        })
        .onEnd((e) => {
            if (!isTop || isDragging) return;
            if (Math.abs(e.translationX) > 120) {
                translateX.value = withSpring(e.translationX > 0 ? FLOWMAP_WIDTH : -FLOWMAP_WIDTH, {}, () => {
                    runOnJS(onSwipe)();
                });
            } else {
                translateX.value = withSpring(0);
            }
        });

    const dropPan = Gesture.Pan()
        .activateAfterLongPress(250)
        .onStart(() => {
            if (!isTop) return;
            runOnJS(setIsDragging)(true);
            isInteracting.value = true;
            scale.value = withSpring(1.08, { damping: 15 });
        })
        .onUpdate((e) => {
            if (!isTop) return;
            dragXAdjust.value = e.translationX;
            dragY.value = e.translationY;
            checkDropZone(e.absoluteY - 140);
        })
        .onEnd((e) => {
            if (!isTop) return;
            const finalZone = checkDropZone(e.absoluteY - 140);
            if (finalZone && finalZone !== stageKey) {
                runOnJS(updateTicketStatus)(ticket.id, finalZone);
            }
            
            dragXAdjust.value = withSpring(0);
            dragY.value = withSpring(0);
            scale.value = withSpring(1);
            runOnJS(setIsDragging)(false);
            runOnJS(setActiveDropZone)(null);
            isInteracting.value = false;
        });

    const combinedGesture = Gesture.Simultaneous(shufflePan, dropPan);

    const animatedStyle = useAnimatedStyle(() => {
        if (isTop) {
            return {
                transform: [
                    { translateX: translateX.value + dragXAdjust.value },
                    { translateY: dragY.value },
                    { scale: scale.value },
                    { rotate: `${interpolate(translateX.value, [-FLOWMAP_WIDTH, 0, FLOWMAP_WIDTH], [-8, 0, 8], Extrapolate.CLAMP)}deg` }
                ],
                zIndex: 1000,
                elevation: 10,
                shadowOpacity: interpolate(scale.value, [1, 1.05], [0, 0.4], Extrapolate.CLAMP),
            };
        }

        const stackScale = interpolate(Math.abs(translateX.value), [0, 150], [1 - (derivedIndex.value * 0.05), 1 - ((derivedIndex.value - 1) * 0.05)], Extrapolate.CLAMP);
        const stackTranslateY = interpolate(Math.abs(translateX.value), [0, 150], [derivedIndex.value * -15, (derivedIndex.value - 1) * -15], Extrapolate.CLAMP);

        return {
            transform: [
                { scale: withSpring(stackScale) }, 
                { translateY: withSpring(stackTranslateY) }
            ],
            zIndex: total - index,
            opacity: interpolate(derivedIndex.value, [0, 4, 5], [1, 0.8, 0], Extrapolate.CLAMP),
        };
    });

    const badgeStyle = useAnimatedStyle(() => {
        const stage = STAGES.find(s => s.key === activeDropZone);
        return {
            opacity: withSpring(activeDropZone && activeDropZone !== stageKey ? 1 : 0),
            transform: [
                { translateY: -60 },
                { scale: withSpring(activeDropZone ? 1 : 0.8) }
            ]
        };
    });

    const logs = ticket.ticket_escalation_logs;
    let escalationChain = undefined;
    if (logs && logs.length > 0) {
      const sorted = [...logs].sort((a, b) => new Date(a.escalated_at).getTime() - new Date(b.escalated_at).getTime());
      const chain: { name: string; avatar?: string }[] = [];
      sorted.forEach((log, i) => {
        if (i === 0 && log.from_employee?.full_name) chain.push({ name: log.from_employee.full_name, avatar: log.from_employee.user_photo_url });
        if (log.to_employee?.full_name) chain.push({ name: log.to_employee.full_name, avatar: log.to_employee.user_photo_url });
      });
      if (chain.length > 0) escalationChain = chain;
    }

    return (
      <GestureDetector gesture={combinedGesture}>
        <Animated.View 
            style={[styles.shuffledCard, animatedStyle]}
            pointerEvents={isTop ? 'auto' : 'none'}
        >
          {/* Action Badge */}
          {isTop && activeDropZone && activeDropZone !== stageKey && (
            <Animated.View style={[styles.actionBadge, badgeStyle, { backgroundColor: STAGES.find(s => s.key === activeDropZone)?.color || colors.primary }]}>
                <Ionicons name="arrow-down-circle" size={16} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.actionBadgeText}>Move to {STAGES.find(s => s.key === activeDropZone)?.label}</Text>
            </Animated.View>
          )}

          <TicketCard
            id={ticket.id}
            title={ticket.title}
            priority={(ticket.priority?.toUpperCase() as any) || 'MEDIUM'}
            status={
              ['resolved', 'closed', 'completed'].includes(ticket.status) ? 'COMPLETED' :
              ticket.status === 'resolved' ? 'PENDING_VALIDATION' :
              ticket.status === 'in_progress' ? 'IN_PROGRESS' :
              ticket.assigned_to ? 'ASSIGNED' : 'OPEN'
            }
            ticketNumber={ticket.ticket_number}
            createdAt={ticket.created_at}
            assignedTo={ticket.assignee?.full_name || 'Unassigned'}
            assigneePhotoUrl={ticket.assignee?.user_photo_url}
            photoUrl={ticket.photo_before_url}
            raisedByName={ticket.creator?.full_name || 'Anonymous'}
            escalationChain={escalationChain}
            onClick={() => !isDragging && router.push(`/property/${propertyId}/tickets/${ticket.id}` as any)}
            compact={true}
            glass={true}
          />
          {!isTop && (
            <View 
                style={[
                    StyleSheet.absoluteFill, 
                    { backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }
                ]} 
            />
          )}
        </Animated.View>
      </GestureDetector>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={isDark ? ['#1e293b', '#0f172a'] : ['#ffffff', '#f1f5f9']}
          style={[styles.header, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Live Flow Map</Text>
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>{propertyName.toUpperCase()}</Text>
            </View>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshIcon}>
              <Ionicons name="refresh" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <ScrollView 
          style={styles.content}
          scrollEnabled={!isDragging}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        >
          {activeStages.map((stage) => {
            const stageTickets = groupedTickets[stage.key] || [];
            const isTarget = activeDropZone === stage.key;
            
            return (
              <View 
                key={stage.key} 
                style={[styles.stageSection, isTarget && styles.stageSectionActive]}
                onLayout={(e) => {
                    const { y, height } = e.nativeEvent.layout;
                    const newLayouts = { ...sectionLayouts.value };
                    newLayouts[stage.key] = { y, height };
                    sectionLayouts.value = newLayouts;
                }}
              >
                <View style={[
                    styles.stageHeader, 
                    { 
                      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.9)',
                      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                    },
                    isTarget && { backgroundColor: stage.color + '22', borderColor: stage.color }
                ]}>
                  <View style={[styles.stageIndicator, { backgroundColor: stage.color }]} />
                  <Ionicons name={stage.icon as any} size={18} color={stage.color} style={{ marginRight: 8 }} />
                  <Text style={[styles.stageLabel, { color: colors.textPrimary }]}>{stage.label}</Text>
                  <View style={[styles.stageCount, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9' }]}>
                    <Text style={[styles.stageCountText, { color: colors.textSecondary }]}>{stageTickets.length}</Text>
                  </View>
                </View>

                <View style={[styles.stageContent, { height: stageTickets.length > 0 ? 300 : 80 }]}>
                   <FlowShuffleStack tickets={stageTickets} stageKey={stage.key} />
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>

    </GestureHandlerRootView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -10,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 1,
  },
  refreshIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingTop: 10,
  },
  stageSection: {
    marginBottom: 10,
  },
  stageSectionActive: {
    transform: [{ scale: 1.02 }],
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  stageIndicator: {
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -10,
    width: 3,
    height: 20,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  stageLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  stageCount: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    marginRight: 10,
  },
  stageCountText: {
    fontSize: 10,
    fontWeight: '800',
  },
  stageContent: {
    paddingHorizontal: 16,
    paddingTop: 55,
    paddingBottom: 20,
    alignItems: 'center',
  },
  stackWrapper: {
    width: '100%',
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shuffledCard: {
    position: 'absolute',
    width: '100%',
    height: 245,
    borderRadius: 16,
    overflow: 'hidden',
  },
  emptyStage: {
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 12,
    fontStyle: 'italic',
  },
  actionBadge: {
    position: 'absolute',
    top: 50,
    left: '10%',
    right: '10%',
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    zIndex: 2000,
    elevation: 8,
  },
  actionBadgeText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  }
});
