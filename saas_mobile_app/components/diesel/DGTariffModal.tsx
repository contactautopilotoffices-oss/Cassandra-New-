import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/utils/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface DGTariff {
  id: string;
  generator_id: string;
  cost_per_litre: number;
  effective_from: string;
  effective_to?: string | null;
}

interface DGTariffModalProps {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
  generators: { id: string; name: string; make?: string; capacity_kva?: number }[];
  initialGenId?: string;
}

export default function DGTariffModal({
  visible,
  onClose,
  propertyId,
  generators,
  initialGenId,
}: DGTariffModalProps) {
  const { theme } = useTheme();
  const { user: authUser } = useAuth();
  const colors = Colors[theme];

  const [selectedGenId, setSelectedGenId] = useState<string>('');
  const [costPerLitre, setCostPerLitre] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [tariffs, setTariffs] = useState<DGTariff[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGenPicker, setShowGenPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      if (initialGenId) {
        setSelectedGenId(initialGenId);
      } else if (generators.length > 0 && !selectedGenId) {
        setSelectedGenId(generators[0].id);
      }
      setCostPerLitre('');
      setEffectiveFrom(new Date().toISOString().split('T')[0]);
      setError(null);
    }
  }, [visible, initialGenId]);

  const fetchTariffs = async () => {
    if (!selectedGenId) return;
    setIsLoading(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from('dg_tariffs')
        .select('*')
        .eq('generator_id', selectedGenId)
        .order('effective_from', { ascending: false }) as any;
      
      if (fetchErr) throw fetchErr;
      setTariffs(data || []);
    } catch (err) {
      console.error('Error fetching DG tariffs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (visible && selectedGenId) {
      fetchTariffs();
    }
  }, [visible, selectedGenId]);

  const handleSubmit = async () => {
    if (!selectedGenId) {
      setError('Please select a generator');
      return;
    }
    const cost = parseFloat(costPerLitre);
    if (!costPerLitre || isNaN(cost) || cost <= 0) {
      setError('Please enter a valid cost per litre');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      // 1. Close existing active tariff
      const dayBefore = new Date(effectiveFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeStr = dayBefore.toISOString().split('T')[0];

      await (supabase as any)
        .from('dg_tariffs')
        .update({ effective_to: dayBeforeStr })
        .eq('generator_id', selectedGenId)
        .is('effective_to', null)
        .lt('effective_from', effectiveFrom);

      // 2. Insert new tariff
      const { error: insertErr } = await supabase
        .from('dg_tariffs')
        .insert({
          generator_id: selectedGenId,
          cost_per_litre: cost,
          effective_from: effectiveFrom,
          created_by: authUser?.id
        } as any);

      if (insertErr) throw insertErr;

      setCostPerLitre('');
      await fetchTariffs();
    } catch (e: any) {
      setError(e.message || 'Failed to save tariff');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete Price Entry', 'Are you sure you want to delete this price entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error: delErr } = await supabase
              .from('dg_tariffs')
              .delete()
              .eq('id', id);
            
            if (delErr) throw delErr;
            await fetchTariffs();
          } catch (e: any) {
            setError(e.message || 'Failed to delete tariff');
          }
        },
      },
    ]);
  };

  const selectedGen = generators.find(g => g.id === selectedGenId);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.headerIcon, { backgroundColor: colors.success + '18' }]}>
                <Ionicons name="flame-outline" size={20} color={colors.success} />
              </View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Fuel Cost Configuration</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            {error && (
              <View style={[styles.errorBox, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            )}

            {/* Generator Picker */}
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Select Generator</Text>
            <TouchableOpacity
              style={[styles.pickerBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowGenPicker(true)}
            >
              <Text style={[styles.pickerBtnText, { color: selectedGen ? colors.text : colors.textTertiary }]}>
                {selectedGen?.name ?? 'Select a generator'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Cost per Litre */}
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Update Diesel Price</Text>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Cost per Litre (₹)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={costPerLitre}
              onChangeText={setCostPerLitre}
              placeholder="e.g. 94.50"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
            />

            {/* Effective From */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Effective From</Text>
            <TouchableOpacity style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, justifyContent: 'center' }]}>
              <Text style={{ color: colors.text, fontFamily: 'Urbanist-Medium', fontSize: 15 }}>
                {new Date(effectiveFrom + 'T00:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>
            </TouchableOpacity>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.success }, isSubmitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={isSubmitting || !costPerLitre}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>Update Price</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={[styles.divider, { borderColor: colors.border }]} />

            {/* Price History */}
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Price History</Text>
            {isLoading ? (
              <View style={styles.historyLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : tariffs.length === 0 ? (
              <View style={[styles.emptyHistory, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="cash-outline" size={28} color={colors.textTertiary} />
                <Text style={[styles.emptyHistoryText, { color: colors.textSecondary }]}>
                  No prices configured
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {tariffs.map((tariff, idx) => (
                  <View
                    key={tariff.id}
                    style={[
                      styles.tariffCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: idx === 0 ? colors.success + '40' : colors.border,
                        borderWidth: idx === 0 ? 1.5 : 1,
                      },
                    ]}
                  >
                    <View style={styles.tariffCardTop}>
                      <Text style={[styles.tariffPrice, { color: colors.text }]}>
                        ₹{tariff.cost_per_litre.toFixed(2)}/L
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {idx === 0 && (
                          <View style={[styles.activeBadge, { backgroundColor: colors.success + '18' }]}>
                            <Text style={[styles.activeBadgeText, { color: colors.success }]}>Active</Text>
                          </View>
                        )}
                        <TouchableOpacity onPress={() => handleDelete(tariff.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.tariffCardDates}>
                      <Text style={[styles.tariffDateText, { color: colors.textTertiary }]}>
                        From: {new Date(tariff.effective_from + 'T00:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </Text>
                      {tariff.effective_to && (
                        <Text style={[styles.tariffDateText, { color: colors.textTertiary }]}>
                          To: {new Date(tariff.effective_to + 'T00:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* Generator Picker Modal */}
      <Modal visible={showGenPicker} transparent animationType="fade" onRequestClose={() => setShowGenPicker(false)}>
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowGenPicker(false)}
        >
          <View style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.pickerSheetTitle, { color: colors.text }]}>Select Generator</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {generators.map(gen => (
                <TouchableOpacity
                  key={gen.id}
                  style={[
                    styles.pickerOption,
                    { borderColor: colors.border },
                    selectedGenId === gen.id && { backgroundColor: colors.primary + '15' },
                  ]}
                  onPress={() => { setSelectedGenId(gen.id); setShowGenPicker(false); }}
                >
                  <Text style={[styles.pickerOptionText, { color: colors.text }]}>{gen.name}</Text>
                  {selectedGenId === gen.id && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Urbanist-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Urbanist-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    fontFamily: 'Urbanist-Medium',
  },
  pickerBtn: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerBtnText: {
    fontSize: 15,
    fontFamily: 'Urbanist-Medium',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Urbanist-SemiBold',
    flex: 1,
  },
  submitBtn: {
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
    color: '#FFFFFF',
  },
  divider: {
    borderTopWidth: 1,
    marginTop: 20,
    marginBottom: 4,
  },
  historyLoading: {
    padding: 20,
    alignItems: 'center',
  },
  emptyHistory: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  emptyHistoryText: {
    fontSize: 13,
    fontFamily: 'Urbanist-SemiBold',
  },
  tariffCard: {
    padding: 14,
    borderRadius: 12,
  },
  tariffCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tariffPrice: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activeBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tariffCardDates: {
    flexDirection: 'row',
    gap: 12,
  },
  tariffDateText: {
    fontSize: 11,
    fontFamily: 'Urbanist-SemiBold',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  pickerSheet: {
    borderRadius: 20,
    padding: 20,
    maxHeight: 400,
  },
  pickerSheetTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  pickerOptionText: {
    fontSize: 15,
    fontFamily: 'Urbanist-Medium',
  },
});
