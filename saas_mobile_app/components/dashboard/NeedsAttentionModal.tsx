import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import {
  SPACING,
  CARD_SURFACES,
  STATUS_COLORS,
} from '@/constants/designSystem';
import SafeBlurView from '@/components/ui/SafeBlurView';

const fontSans = Platform.OS === 'ios' ? 'System' : 'sans-serif';
const fontDisplay = Platform.OS === 'web' ? 'Poppins' : 'System';

export interface AttentionItem {
  id: string;
  entity_id: string;
  entity_type: string;
  severity: string;
  type: string;
  title: string;
  description: string;
  action_label: string;
  priorityScore?: number;
  photoBeforeUrl?: string | null;
}

type FilterKey = 'all' | 'critical' | 'tenant' | 'sla_breach';

interface NeedsAttentionModalProps {
  visible: boolean;
  onClose: () => void;
  items: AttentionItem[];
  propertyName: string;
  onItemPress: (item: AttentionItem) => void;
}

function getSeverityColor(severity: string) {
  if (severity === 'critical') return '#EF4444';
  if (severity === 'high') return '#F59E0B';
  if (severity === 'medium') return '#3B82F6';
  return '#6B7280';
}

function getTypeIcon(type: string) {
  if (type === 'critical_ticket') return 'alert-circle';
  if (type === 'tenant_ticket') return 'people';
  if (type === 'stale_ticket') return 'time';
  if (type === 'sop_missed') return 'checkbox';
  return 'warning';
}

function getTypeLabel(type: string) {
  if (type === 'critical_ticket') return 'Critical';
  if (type === 'tenant_ticket') return 'Tenant';
  if (type === 'stale_ticket') return 'SLA Breach';
  if (type === 'sop_missed') return 'SOP Missed';
  return 'Alert';
}

function filterItems(items: AttentionItem[], filter: FilterKey): AttentionItem[] {
  if (filter === 'all') return items;
  if (filter === 'critical') return items.filter((i) => i.severity === 'critical');
  if (filter === 'tenant') return items.filter((i) => i.type === 'tenant_ticket');
  if (filter === 'sla_breach')
    return items.filter(
      (i) => i.type === 'stale_ticket' || i.description?.toLowerCase().includes('sla'),
    );
  return items;
}

function getFilterLabel(filter: FilterKey): string {
  if (filter === 'critical') return 'Critical';
  if (filter === 'tenant') return 'Tenant';
  if (filter === 'sla_breach') return 'SLA Breach';
  return 'All';
}

export default function NeedsAttentionModal({
  visible,
  onClose,
  items,
  propertyName,
  onItemPress,
}: NeedsAttentionModalProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const criticalCount = useMemo(() => items.filter((i) => i.severity === 'critical').length, [items]);
  const tenantCount = useMemo(() => items.filter((i) => i.type === 'tenant_ticket').length, [items]);
  const slaCount = useMemo(
    () => items.filter((i) => i.type === 'stale_ticket' || i.description?.toLowerCase().includes('sla')).length,
    [items],
  );

  const displayedItems = useMemo(() => filterItems(items, activeFilter), [items, activeFilter]);

  // Reset filter when modal closes
  const handleClose = () => {
    setActiveFilter('all');
    onClose();
  };

  const toggleFilter = (key: FilterKey) => {
    setActiveFilter((prev) => (prev === key ? 'all' : key));
  };

  const chips: { key: FilterKey; label: string; count: number; color: string }[] = [
    { key: 'all', label: 'TOTAL', count: items.length, color: '#FFFFFF' },
    { key: 'critical', label: 'CRITICAL', count: criticalCount, color: '#EF4444' },
    { key: 'tenant', label: 'TENANT', count: tenantCount, color: '#3B82F6' },
    { key: 'sla_breach', label: 'SLA BREACH', count: slaCount, color: '#F59E0B' },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={handleClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

      <View style={styles.sheetContainer}>
        <View style={styles.sheetContent}>
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: SPACING.xl }}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.headerLeft}>
                <View style={styles.labelRow}>
                  <Ionicons name="warning" size={14} color="rgba(255,255,255,0.60)" />
                  <Text style={styles.labelText}>NEEDS ATTENTION</Text>
                </View>
                <Text style={styles.titleText}>{propertyName} · Alerts</Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.80)" />
              </TouchableOpacity>
            </View>

            {/* Filter Chips — tap to filter list */}
            <View style={styles.metricsRow}>
              {chips.map((chip) => {
                const isActive = activeFilter === chip.key;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    style={[
                      styles.metricCell,
                      isActive && {
                        backgroundColor: chip.color + '18',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: chip.color + '55',
                      },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => toggleFilter(chip.key)}
                  >
                    <Text style={[styles.metricValue, { color: chip.color }]}>
                      {chip.count}
                    </Text>
                    <Text
                      style={[
                        styles.metricLabel,
                        isActive && { color: chip.color, fontWeight: '800' },
                      ]}
                    >
                      {chip.label}
                    </Text>
                    {isActive && (
                      <View
                        style={[
                          styles.activeIndicator,
                          { backgroundColor: chip.color },
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* List header */}
            <View style={{ marginHorizontal: SPACING.xl }}>
              <Text style={styles.listTitle}>
                {displayedItems.length} {getFilterLabel(activeFilter)}{' '}
                Alert{displayedItems.length !== 1 ? 's' : ''} requiring action
              </Text>
            </View>

            {/* Empty state */}
            {displayedItems.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle" size={40} color="rgba(31,194,110,0.6)" />
                <Text style={styles.emptyText}>
                  No {getFilterLabel(activeFilter).toLowerCase()} alerts right now
                </Text>
              </View>
            )}

            {/* Ticket list */}
            {displayedItems.map((item, index) => {
              const severityColor = getSeverityColor(item.severity);
              const iconName = getTypeIcon(item.type);
              const typeLabel = getTypeLabel(item.type);

              return (
                <Animated.View
                  key={item.id}
                  entering={FadeInUp.delay(index * 50).duration(350)}
                  style={{ marginHorizontal: SPACING.xl, marginBottom: 10 }}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => onItemPress(item)}
                    style={[styles.attentionCard, { borderLeftColor: severityColor, borderLeftWidth: 3 }]}
                  >
                    <SafeBlurView intensity={30} style={StyleSheet.absoluteFillObject} tint="dark" />
                    <View style={styles.attentionCardInner}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={[styles.attentionIconBadge, { backgroundColor: severityColor + '15' }]}>
                          {item.photoBeforeUrl ? (
                            <Image source={{ uri: item.photoBeforeUrl }} style={styles.badgeImage} resizeMode="cover" />
                          ) : (
                            <Ionicons name={iconName as any} size={14} color={severityColor} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                            <Text style={styles.attentionTitle} numberOfLines={1}>{item.title}</Text>
                            <View style={[styles.typeBadge, { backgroundColor: severityColor + '15' }]}>
                              <Text style={[styles.typeBadgeText, { color: severityColor }]}>{typeLabel}</Text>
                            </View>
                          </View>
                          <Text style={styles.attentionDesc} numberOfLines={2}>
                            {item.description}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.25)" />
                      </View>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    marginTop: Platform.OS === 'ios' ? 80 : 60,
  },
  sheetContent: {
    flex: 1,
    backgroundColor: '#0f0f1a',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.xl,
    padding: SPACING.xl,
    paddingBottom: 0,
  },
  headerLeft: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  labelText: {
        fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  titleText: {
        fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CARD_SURFACES.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
  },

  // Filter chips row
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: CARD_SURFACES.cardBg,
    borderRadius: CARD_SURFACES.cardRadius,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    padding: 6,
    marginBottom: SPACING.xl,
    marginHorizontal: SPACING.xl,
    gap: 4,
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    position: 'relative',
  },
  metricValue: {
        fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  metricLabel: {
        fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -6,
    left: '25%',
    right: '25%',
    height: 2,
    borderRadius: 1,
  },

  // List
  listTitle: {
        fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
        fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '600',
  },

  // Attention card
  attentionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    overflow: 'hidden',
  },
  attentionCardInner: {
    padding: 10,
  },
  attentionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  badgeImage: {
    width: '100%',
    height: '100%',
  },
  attentionTitle: {
        fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  attentionDesc: {
        fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
    lineHeight: 16,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
        fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
