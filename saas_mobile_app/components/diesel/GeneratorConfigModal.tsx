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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/utils/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import SafeBlurView from '@/components/ui/SafeBlurView';

interface Generator {
  id: string;
  name: string;
  make?: string;
  capacity_kva?: number;
  tank_capacity_litres?: number;
  status: string;
  initial_run_hours?: number;
  initial_kwh_reading?: number;
  initial_diesel_level?: number;
}

interface GeneratorConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  propertyId: string;
  existingGenerator?: Generator;
}

export default function GeneratorConfigModal({
  visible,
  onClose,
  onSuccess,
  propertyId,
  existingGenerator,
}: GeneratorConfigModalProps) {
  const { theme } = useTheme();
  const { user: authUser } = useAuth();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const isNew = !existingGenerator;

  const [name, setName] = useState('');
  const [make, setMake] = useState('');
  const [capacityKva, setCapacityKva] = useState('500');
  const [tankCapacity, setTankCapacity] = useState('1000');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [initialKwh, setInitialKwh] = useState('0');
  const [initialRunHours, setInitialRunHours] = useState('0');
  const [initialDiesel, setInitialDiesel] = useState('0');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      if (existingGenerator) {
        setName(existingGenerator.name);
        setMake(existingGenerator.make || '');
        setCapacityKva(String(existingGenerator.capacity_kva ?? 500));
        setTankCapacity(String(existingGenerator.tank_capacity_litres ?? 1000));
        setStatus(existingGenerator.status === 'inactive' ? 'inactive' : 'active');
        setInitialKwh(String(existingGenerator.initial_kwh_reading ?? 0));
        setInitialRunHours(String(existingGenerator.initial_run_hours ?? 0));
        setInitialDiesel(String(existingGenerator.initial_diesel_level ?? 0));
        setEffectiveFrom(new Date().toISOString().split('T')[0]);
      } else {
        setName('');
        setMake('');
        setCapacityKva('500');
        setTankCapacity('1000');
        setStatus('active');
        setInitialKwh('0');
        setInitialRunHours('0');
        setInitialDiesel('0');
        setEffectiveFrom(new Date().toISOString().split('T')[0]);
      }
      setError(null);
    }
  }, [visible, existingGenerator]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Generator name is required');
      return;
    }
    const cap = parseFloat(capacityKva);
    const tank = parseFloat(tankCapacity);
    if (cap <= 0) {
      setError('Capacity must be greater than 0');
      return;
    }
    if (tank <= 0) {
      setError('Tank capacity must be greater than 0');
      return;
    }
    const initDiesel = parseFloat(initialDiesel);
    if (initDiesel > tank) {
      setError('Initial diesel level cannot exceed tank capacity');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      if (isNew) {
        const { data: gen, error: genErr } = await supabase
          .from('generators')
          .insert({
            property_id: propertyId,
            name: name.trim(),
            make: make.trim() || null,
            capacity_kva: cap,
            tank_capacity_litres: tank,
            status,
            initial_kwh_reading: parseFloat(initialKwh) || 0,
            initial_run_hours: parseFloat(initialRunHours) || 0,
            initial_diesel_level: initDiesel,
            effective_from_date: effectiveFrom,
          } as any)
          .select()
          .single() as any;

        if (genErr) throw genErr;

        const kwh = parseFloat(initialKwh) || 0;
        const hrs = parseFloat(initialRunHours) || 0;
        if (kwh > 0 || hrs > 0 || initDiesel > 0) {
          const { error: readingErr } = await supabase
            .from('diesel_readings')
            .insert({
              property_id: propertyId,
              generator_id: gen.id,
              reading_date: effectiveFrom,
              opening_hours: 0,
              closing_hours: hrs,
              opening_kwh: 0,
              closing_kwh: kwh,
              opening_diesel_level: 0,
              closing_diesel_level: initDiesel,
              diesel_added_litres: 0,
              computed_consumed_litres: initDiesel,
              notes: 'Initial setup reading',
              created_by: authUser?.id
            } as any);
          if (readingErr) console.error('[Generators] Error recording initial reading:', readingErr.message);
        }
      } else {
        const { error: updateErr } = await (supabase as any)
          .from('generators')
          .update({
            name: name.trim(),
            make: make.trim() || null,
            capacity_kva: cap,
            tank_capacity_litres: tank,
            status,
          })
          .eq('id', existingGenerator!.id);
        
        if (updateErr) throw updateErr;
      }
      await onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to save generator');
    } finally {
      setIsSubmitting(false);
    }
  };

  const SectionTitle = ({ icon, title }: { icon: string; title: string }) => (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: colors.primary + '18' }]}>
        <Ionicons name={icon as any} size={16} color={colors.primary} />
      </View>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
    </View>
  );

  const Label = ({ text, required }: { text: string; required?: boolean }) => (
    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
      {text}{required && <Text style={{ color: colors.error }}> *</Text>}
    </Text>
  );

  const Input = ({ value, onChange, placeholder, keyboard = 'default' }: any) => (
    <TextInput
      style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      keyboardType={keyboard}
    />
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {/* Header */}
          <SafeBlurView intensity={80} tint="dark" style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerIconWrap, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name={isNew ? 'add-circle' : 'create'} size={22} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                  {isNew ? 'Add Generator' : 'Edit Generator'}
                </Text>
                <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
                  {isNew ? 'Register a new DG set' : 'Update generator details'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.headerClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </SafeBlurView>

          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {error && (
              <View style={[styles.errorBox, { backgroundColor: colors.error + '12', borderColor: colors.error + '30' }]}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            )}

            {/* Identity Card */}
            <SafeBlurView intensity={40} tint="dark" style={styles.card}>
              <LinearGradient
                colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)', 'rgba(0,0,0,0.1)']}
                style={StyleSheet.absoluteFillObject}
              />
              <SectionTitle icon="hardware-chip-outline" title="Identity" />
              <Label text="Generator Name" required />
              <Input value={name} onChange={setName} placeholder="e.g. DG-1 Main Power" />
              <Label text="Make / Manufacturer" />
              <Input value={make} onChange={setMake} placeholder="e.g. Cummins, Kirloskar" />
            </SafeBlurView>

            {/* Capacity Card */}
            <SafeBlurView intensity={40} tint="dark" style={styles.card}>
              <LinearGradient
                colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)', 'rgba(0,0,0,0.1)']}
                style={StyleSheet.absoluteFillObject}
              />
              <SectionTitle icon="speedometer-outline" title="Capacity & Tank" />
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Label text="Capacity (kVA)" required />
                  <Input value={capacityKva} onChange={setCapacityKva} placeholder="500" keyboard="decimal-pad" />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Label text="Tank (Litres)" required />
                  <Input value={tankCapacity} onChange={setTankCapacity} placeholder="1000" keyboard="decimal-pad" />
                </View>
              </View>
            </SafeBlurView>

            {/* Status Card */}
            <SafeBlurView intensity={40} tint="dark" style={styles.card}>
              <LinearGradient
                colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)', 'rgba(0,0,0,0.1)']}
                style={StyleSheet.absoluteFillObject}
              />
              <SectionTitle icon="power-outline" title="Status" />
              <View style={styles.row}>
                <TouchableOpacity
                  style={[
                    styles.statusBtn,
                    status === 'active'
                      ? { backgroundColor: '#22C55E18', borderColor: '#22C55E' }
                      : { backgroundColor: colors.surface, borderColor: colors.border }
                  ]}
                  onPress={() => setStatus('active')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-circle" size={18} color={status === 'active' ? '#22C55E' : colors.textTertiary} />
                  <Text style={[styles.statusText, { color: status === 'active' ? '#22C55E' : colors.textSecondary }]}>
                    Active
                  </Text>
                </TouchableOpacity>
                <View style={{ width: 12 }} />
                <TouchableOpacity
                  style={[
                    styles.statusBtn,
                    status === 'inactive'
                      ? { backgroundColor: '#EF444418', borderColor: '#EF4444' }
                      : { backgroundColor: colors.surface, borderColor: colors.border }
                  ]}
                  onPress={() => setStatus('inactive')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="pause-circle" size={18} color={status === 'inactive' ? '#EF4444' : colors.textTertiary} />
                  <Text style={[styles.statusText, { color: status === 'inactive' ? '#EF4444' : colors.textSecondary }]}>
                    Inactive
                  </Text>
                </TouchableOpacity>
              </View>
            </SafeBlurView>

            {/* Initial Setup Card (new only) */}
            {isNew && (
              <SafeBlurView intensity={40} tint="dark" style={[styles.card, { borderColor: colors.primary + '40' }]}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)', 'rgba(0,0,0,0.1)']}
                  style={StyleSheet.absoluteFillObject}
                />
                <SectionTitle icon="flag-outline" title="Initial Setup" />
                <Text style={[styles.setupHint, { color: colors.textSecondary }]}>
                  Starting values for the first log entry
                </Text>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Label text="Initial kWh" />
                    <Input value={initialKwh} onChange={setInitialKwh} placeholder="0" keyboard="decimal-pad" />
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Label text="Run Hours" />
                    <Input value={initialRunHours} onChange={setInitialRunHours} placeholder="0" keyboard="decimal-pad" />
                  </View>
                </View>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Label text="Diesel Level (L)" />
                    <Input value={initialDiesel} onChange={setInitialDiesel} placeholder="0" keyboard="decimal-pad" />
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Label text="Effective From" />
                    <View style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, justifyContent: 'center' }]}>
                      <Text style={{ color: colors.text, fontFamily: 'Urbanist-Medium', fontSize: 15 }}>
                        {new Date(effectiveFrom + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                  </View>
                </View>
              </SafeBlurView>
            )}

            {/* Actions */}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary }, isSubmitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {isNew ? 'Add Generator' : 'Save Changes'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontFamily: 'Poppins-Bold' },
  headerSub: { fontSize: 12, fontFamily: 'Urbanist-Medium', marginTop: 2 },
  headerClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16, gap: 12 },
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 15, fontFamily: 'Poppins-Bold' },
  fieldLabel: { fontSize: 12, fontFamily: 'Urbanist-Bold', marginBottom: 8, marginTop: 12 },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 15,
    fontFamily: 'Urbanist-Medium',
  },
  row: { flexDirection: 'row', marginTop: 4 },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  statusText: { fontSize: 14, fontFamily: 'Poppins-Bold' },
  setupHint: { fontSize: 12, fontFamily: 'Urbanist-Medium', marginBottom: 10, marginTop: -6 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 4,
  },
  errorText: { fontSize: 13, fontFamily: 'Urbanist-SemiBold', flex: 1 },
  submitBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnText: { fontSize: 16, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  cancelBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cancelBtnText: { fontSize: 14, fontFamily: 'Poppins-Bold' },
});
