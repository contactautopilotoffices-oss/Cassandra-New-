import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createClient } from '@/utils/supabase/client';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import Loader from '../ui/Loader';

interface Property {
  id: string;
  name: string;
  code: string;
  address?: string;
}

interface PropertySelectionViewProps {
  propertyIds: string[];
  onSelect: (id: string) => void;
}

export default function PropertySelectionView({ propertyIds, onSelect }: PropertySelectionViewProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchProperties = useCallback(async () => {
    if (propertyIds.length === 0) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .in('id', propertyIds);

      if (error) throw error;
      setProperties(
        (data || []).map((property: any) => ({
          ...property,
          address: property.address ?? undefined,
        }))
      );
    } catch (err) {
      console.error('Error fetching properties:', err);
    } finally {
      setIsLoading(false);
    }
  }, [propertyIds, supabase]);

  useDashboardFetch(queryKeys.property.propertySelection(...propertyIds), fetchProperties, {
    staleTime: 1000 * 60 * 5,
    enabled: propertyIds.length > 0,
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Loader size="lg" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="business-outline" size={32} color="#708F96" />
        </View>
        <Text style={styles.title}>Select Location</Text>
        <Text style={styles.subtitle}>
          You have access to multiple properties. Choose a location to view its dashboard.
        </Text>
      </View>

      {/* Property List */}
      {properties.length > 0 ? (
        <FlatList
          data={properties}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.propertyCard}
              onPress={() => onSelect(item.id)}
              activeOpacity={0.7}
            >
              <View style={styles.propertyIcon}>
                <Ionicons name="business" size={20} color="#708F96" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.propertyName}>{item.name}</Text>
                {item.code && (
                  <Text style={styles.propertyCode}>{item.code}</Text>
                )}
                {item.address && (
                  <Text style={styles.propertyAddress} numberOfLines={1}>{item.address}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
            </TouchableOpacity>
          )}
        />
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="grid-outline" size={48} color="#E2E8F0" />
          <Text style={styles.emptyText}>No properties assigned to your account</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 32, gap: 8 },
  iconCircle: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: 'rgba(124,58,237,0.08)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8, borderWidth: 1, borderColor: 'rgba(124,58,237,0.05)',
  },
  title: { fontSize: 28, fontWeight: '900', color: '#1A2332', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  list: { gap: 12 },
  propertyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  propertyIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(124,58,237,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },
  propertyName: { fontSize: 15, fontWeight: '700', color: '#1A2332' },
  propertyCode: { fontSize: 11, color: '#94A3B8', fontWeight: '500', marginTop: 2 },
  propertyAddress: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12,
    padding: 48, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed',
    borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
  },
  emptyText: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 },
});
