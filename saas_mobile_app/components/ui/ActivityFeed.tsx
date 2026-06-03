import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ActivityItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle?: string;
  time: string;
}

interface ActivityFeedProps {
  items: ActivityItem[];
  style?: ViewStyle;
}

function ActivityItemRow({ item }: { item: ActivityItem }) {
  return (
    <View style={styles.item}>
      <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
        <Ionicons name={item.icon} size={16} color={item.iconColor} />
      </View>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
        {item.subtitle && (
          <Text style={styles.itemSubtitle} numberOfLines={1}>{item.subtitle}</Text>
        )}
      </View>
      <Text style={styles.itemTime}>{item.time}</Text>
    </View>
  );
}

export function ActivityFeed({ items, style }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer, style]}>
        <Ionicons name="checkmark-circle-outline" size={32} color="#E2E8F0" />
        <Text style={styles.emptyText}>No recent activity</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {items.map((item) => (
        <ActivityItemRow key={item.id} item={item} />
      ))}
    </View>
  );
}

// Section header matching web dashboard style
export function SectionHeader({
  title,
  subtitle,
  style,
}: {
  title: string;
  subtitle?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A2332',
  },
  itemSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  itemTime: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
    flexShrink: 0,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
});

export default ActivityFeed;
