import React, { useState } from 'react';
import { serverApi } from '@/lib/serverApi';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Switch,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createClient } from '@/utils/supabase/client';

interface Props {
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (property: any) => void;
}

const CITIES = ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad'];

export default function CreatePropertyModal({ organizationId, isOpen, onClose, onSuccess }: Props) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [capacity, setCapacity] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  const handleSubmit = async () => {
    setError('');
    if (!name.trim()) { setError('Property name is required.'); return; }
    setIsSubmitting(true);

    try {
      const { data, error: insertError } = await serverApi.query({
        table: 'properties',
        action: 'insert',
        values: {
          organization_id: organizationId,
          name: name.trim(),
          address: address || null,
          city: city || null,
          total_seats: capacity ? parseInt(capacity) : null,
          is_active: isActive,
        },
        single: true,
      });

      if (insertError) throw insertError;
      onSuccess(data);
      onClose();
      // Reset
      setName(''); setAddress(''); setCity(''); setCapacity('');
    } catch (err: any) {
      setError(err.message || 'Failed to create property.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIcon}>
                  <Ionicons name="business-outline" size={24} color="#6366F1" />
                </View>
                <View>
                  <Text style={styles.headerTitle}>Create New Property</Text>
                  <Text style={styles.headerSub}>Add a property to this organization</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.label}>Property Name *</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g., SS Plaza Tower A" placeholderTextColor="#94A3B8" />
            </View>

            {/* Address */}
            <View style={styles.field}>
              <Text style={styles.label}>Address</Text>
              <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="e.g., Koramangala, 5th Block" placeholderTextColor="#94A3B8" />
            </View>

            {/* City picker */}
            <View style={styles.field}>
              <Text style={styles.label}>City</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {CITIES.map(c => (
                    <TouchableOpacity key={c} style={[styles.chip, city === c && styles.chipActive]} onPress={() => setCity(c)}>
                      <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Capacity */}
            <View style={styles.field}>
              <Text style={styles.label}>Capacity</Text>
              <TextInput style={styles.input} value={capacity} onChangeText={setCapacity} placeholder="e.g., 150" placeholderTextColor="#94A3B8" keyboardType="number-pad" />
            </View>

            {/* Active toggle */}
            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleLabel}>Active Status</Text>
                <Text style={styles.toggleSub}>Property is active and available</Text>
              </View>
              <Switch value={isActive} onValueChange={setIsActive} trackColor={{ false: '#CBD5E1', true: '#10B981' }} />
            </View>

            {/* Error */}
            {error !== '' && (
              <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
            )}

            {/* Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, isSubmitting && { opacity: 0.5 }]} onPress={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? <ActivityIndicator size="small" color="#FFF" /> : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                    <Text style={styles.submitText}>Create Property</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modal: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(99,102,241,0.08)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#1A2332' },
  headerSub: { fontSize: 13, color: '#94A3B8' },
  closeBtn: { padding: 8, borderRadius: 8 },
  field: { marginBottom: 16 },
  label: { fontSize: 10, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 16, fontSize: 14, fontWeight: '500', color: '#1A2332' },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#FFF' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#F8FAFC', borderRadius: 12, marginBottom: 16 },
  toggleLabel: { fontSize: 13, fontWeight: '700', color: '#475569' },
  toggleSub: { fontSize: 11, color: '#94A3B8' },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  submitBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: '#708F96', justifyContent: 'center', alignItems: 'center' },
  submitText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
