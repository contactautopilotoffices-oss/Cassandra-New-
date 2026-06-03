import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ContextLevel {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface ContextBarProps {
  organization?: { name: string } | null;
  property?: { name: string } | null;
  building?: { name: string } | null;
  floor?: { name: string } | null;
  onNavigateUp?: () => void;
}

export function ContextBar({
  organization,
  property,
  building,
  floor,
  onNavigateUp,
}: ContextBarProps) {
  const levels: ContextLevel[] = [];

  if (organization) levels.push({ name: organization.name, icon: 'home-outline' });
  if (property) levels.push({ name: property.name, icon: 'business-outline' });
  if (building) levels.push({ name: building.name, icon: 'layers-outline' });
  if (floor) levels.push({ name: floor.name, icon: 'albums-outline' });

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.breadcrumbRow} showsVerticalScrollIndicator={false}>
        {levels.map((level, i) => {
          const isLast = i === levels.length - 1;
          const canNavigate = !isLast && onNavigateUp;

          return (
            <React.Fragment key={`${level.name}-${i}`}>
              <TouchableOpacity
                style={styles.crumbItem}
                disabled={!canNavigate}
                onPress={canNavigate ? onNavigateUp : undefined}
                activeOpacity={canNavigate ? 0.6 : 1}
              >
                <Ionicons
                  name={level.icon}
                  size={14}
                  color={isLast ? '#708F96' : '#94A3B8'}
                />
                <Text
                  style={[styles.crumbText, isLast && styles.crumbTextActive]}
                  numberOfLines={1}
                >
                  {level.name}
                </Text>
              </TouchableOpacity>

              {!isLast && (
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color="rgba(148,163,184,0.4)"
                  style={{ marginHorizontal: 4 }}
                />
              )}
            </React.Fragment>
          );
        })}
      </ScrollView>

      {/* Status indicator */}
      <View style={styles.statusRow}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>Operational</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  crumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  crumbText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    maxWidth: 120,
  },
  crumbTextActive: {
    color: '#1A2332',
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

export default ContextBar;
