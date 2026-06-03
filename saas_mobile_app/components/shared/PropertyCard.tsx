import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PropertyCardProps {
  property: {
    id: string;
    name: string;
    code: string;
    address?: string;
    image_url?: string;
  };
  onSelect?: (id: string) => void;
  onEdit?: (property: any) => void;
  onDelete?: (id: string) => void;
  showActions?: boolean;
  style?: ViewStyle;
}

export default function PropertyCard({
  property, onSelect, onEdit, onDelete, showActions = false, style,
}: PropertyCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={() => !showActions && onSelect?.(property.id)}
      activeOpacity={showActions ? 1 : 0.7}
    >
      {/* Image */}
      <View style={styles.imageContainer}>
        {property.image_url ? (
          <Image source={{ uri: property.image_url }} style={styles.image} />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="business-outline" size={40} color="#E2E8F0" />
            <Text style={styles.placeholderText}>Standard Asset View</Text>
          </View>
        )}

        {/* Code tag */}
        <View style={styles.codeTag}>
          <Text style={styles.codeText}>{property.code}</Text>
        </View>

        {/* Actions overlay */}
        {showActions && (
          <View style={styles.actionsRow}>
            {onEdit && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(property)}>
                <Ionicons name="pencil-outline" size={16} color="#475569" />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => onDelete(property.id)}>
                <Ionicons name="trash-outline" size={16} color="#475569" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{property.name}</Text>
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={14} color="#94A3B8" />
          <Text style={styles.address} numberOfLines={2}>{property.address || 'No address registered'}</Text>
        </View>

        <TouchableOpacity style={styles.viewBtn} onPress={() => onSelect?.(property.id)}>
          <Text style={styles.viewBtnText}>View Live Analytics</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF', borderRadius: 24, borderWidth: 1, borderColor: '#F1F5F9',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  imageContainer: { height: 160, backgroundColor: '#F8FAFC', position: 'relative' },
  image: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  placeholderText: { fontSize: 9, fontWeight: '900', color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: 1.5 },
  codeTag: {
    position: 'absolute', bottom: 12, left: 12,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.8)',
  },
  codeText: { fontSize: 9, fontWeight: '900', color: '#FFF', textTransform: 'uppercase', letterSpacing: 1.5 },
  actionsRow: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center', alignItems: 'center',
  },
  content: { padding: 20 },
  name: { fontSize: 17, fontWeight: '900', color: '#1A2332', marginBottom: 8 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 20 },
  address: { flex: 1, fontSize: 12, color: '#94A3B8', lineHeight: 18 },
  viewBtn: {
    height: 44, borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9',
    justifyContent: 'center', alignItems: 'center',
  },
  viewBtnText: { fontSize: 10, fontWeight: '900', color: '#708F96', textTransform: 'uppercase', letterSpacing: 1.5 },
});
