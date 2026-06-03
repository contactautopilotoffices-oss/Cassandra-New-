import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stockService } from '@/services/stockService';
import { useAuth } from '@/hooks/useAuth';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import ScannerView from '@/components/shared/ScannerView';
import {
  Package,
  ArrowUpCircle,
  ArrowDownCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Minus,
  Plus,
} from 'lucide-react-native';

interface StockItem {
  id: string;
  name: string;
  item_code: string;
  category: string | null;
  quantity: number;
  min_threshold: number;
  unit: string | null;
  location: string | null;
  barcode: string | null;
}

type ScreenState = 'scanning' | 'found' | 'success' | 'notfound';

export default function StockScanScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [state, setState] = useState<ScreenState>('scanning');
  const [item, setItem] = useState<StockItem | null>(null);
  const [action, setAction] = useState<'add' | 'remove'>('add');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newQty, setNewQty] = useState<number | null>(null);

  const lookupItem = useCallback(async (code: string) => {
    if (!propertyId || !code) return;
    setIsLoading(true);
    try {
      const res = await stockService.scanBarcode(code, propertyId);

      if (res.success && res.data?.item) {
        setItem(res.data.item as StockItem);
        setState('found');
        setAction('add');
        setQuantity(1);
        setNotes('');
      } else {
        setState('notfound');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to look up item');
      setState('scanning');
    } finally {
      setIsLoading(false);
    }
  }, [propertyId]);

  const handleSubmit = async () => {
    if (!item || quantity <= 0) {
      Alert.alert('Error', 'Please enter a valid quantity');
      return;
    }
    if (action === 'remove' && quantity > item.quantity) {
      Alert.alert('Error', `Cannot remove more than available (${item.quantity})`);
      return;
    }

    setIsSubmitting(true);
    try {
      const qtyChange = action === 'add' ? quantity : -quantity;
      const qtyAfter = item.quantity + qtyChange;

      const res = await stockService.recordMovement({
        propertyId: propertyId as string,
        itemId: item.id,
        action,
        quantityChange: qtyChange,
        quantityBefore: item.quantity,
        quantityAfter: qtyAfter,
        notes: notes.trim() || `Stock ${action === 'add' ? 'In' : 'Out'} via scanner`,
        userId: user?.id || undefined,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to record movement');
      }

      setNewQty(res.data?.quantityAfter ?? qtyAfter);
      setState('success');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to record movement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setState('scanning');
    setItem(null);
    setQuantity(1);
    setNotes('');
    setNewQty(null);
  };

  const isLowStock = item ? item.quantity <= (item.min_threshold || 0) : false;

  if (state === 'scanning' || state === 'notfound') {
    return (
      <ScannerView
        title="Stock Scanner"
        subtitle="Scan item barcode or QR code"
        onScan={lookupItem}
        onClose={() => router.back()}
        isLoading={isLoading}
      />
    );
  }

  if (state === 'success' && item) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={StyleSheet.absoluteFillObject} />
        <ScrollView contentContainerStyle={styles.successScroll} showsVerticalScrollIndicator={false}>
          <CheckCircle2 size={64} color="#34C759" />
          <Text style={styles.successTitle}>Success!</Text>
          <Text style={styles.successSub}>
            {action === 'add' ? 'Added' : 'Removed'} {quantity} {item.unit || 'units'}
          </Text>

          <SafeBlurView intensity={40} tint="dark" style={[styles.successCard, { borderColor: 'rgba(255,255,255,0.08)' }]}>
            <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.08)']} style={StyleSheet.absoluteFillObject} />
            <View style={styles.successCardInner}>
              <Text style={styles.successItemName}>{item.name}</Text>
              <Text style={styles.successItemCode}>{item.item_code}</Text>
              <View style={styles.successQtyRow}>
                <Text style={styles.successQtyLabel}>Current Stock</Text>
                <Text style={styles.successQtyValue}>{newQty ?? item.quantity}</Text>
                <Text style={styles.successQtyUnit}>{item.unit || 'units'}</Text>
              </View>
            </View>
          </SafeBlurView>

          <View style={styles.successActions}>
            <TouchableOpacity style={styles.successBtnSecondary} onPress={handleReset}>
              <RotateCcw size={16} color="#E6EBEE" />
              <Text style={styles.successBtnSecondaryText}>Scan Another</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.successBtnPrimary} onPress={() => router.back()}>
              <Text style={styles.successBtnPrimaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (!item) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={StyleSheet.absoluteFillObject} />

      {/* Header */}
      <SafeBlurView intensity={40} tint="dark" style={[styles.header, { borderColor: 'rgba(255,255,255,0.08)' }]}>
        <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.1)']} style={StyleSheet.absoluteFillObject} />
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Text style={{ color: '#E6EBEE', fontSize: 22 }}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Record Movement</Text>
        <View style={{ width: 40 }} />
      </SafeBlurView>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Item Card */}
        <SafeBlurView intensity={40} tint="dark" style={[styles.itemCard, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.08)']} style={StyleSheet.absoluteFillObject} />
          <View style={styles.itemCardInner}>
            <View style={styles.itemRow}>
              <View style={[styles.itemIconWrap, { backgroundColor: 'rgba(112,143,150,0.15)' }]}>
                <Package size={22} color="#708F96" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemCode}>{item.item_code}</Text>
              </View>
            </View>
            <View style={styles.itemMetaRow}>
              <Text style={styles.itemMetaLabel}>Current Stock:</Text>
              <Text style={[styles.itemMetaValue, isLowStock && { color: '#FF3B30' }]}>
                {item.quantity} {item.unit || 'units'}
              </Text>
              {isLowStock && (
                <View style={styles.lowBadge}>
                  <AlertTriangle size={10} color="#FF3B30" />
                  <Text style={styles.lowBadgeText}>Low</Text>
                </View>
              )}
            </View>
          </View>
        </SafeBlurView>

        {/* Action Toggle */}
        <View style={styles.actionToggle}>
          <TouchableOpacity
            style={[styles.actionBtn, action === 'add' && styles.actionBtnAddActive]}
            onPress={() => setAction('add')}
          >
            <ArrowUpCircle size={18} color={action === 'add' ? '#FFFFFF' : '#94A3B8'} />
            <Text style={[styles.actionText, action === 'add' && styles.actionTextActive]}>Stock In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, action === 'remove' && styles.actionBtnRemoveActive]}
            onPress={() => setAction('remove')}
          >
            <ArrowDownCircle size={18} color={action === 'remove' ? '#FFFFFF' : '#94A3B8'} />
            <Text style={[styles.actionText, action === 'remove' && styles.actionTextActive]}>Stock Out</Text>
          </TouchableOpacity>
        </View>

        {/* Quantity */}
        <SafeBlurView intensity={40} tint="dark" style={[styles.qtyCard, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.08)']} style={StyleSheet.absoluteFillObject} />
          <View style={styles.qtyCardInner}>
            <Text style={styles.qtyLabel}>Quantity ({item.unit || 'units'})</Text>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={styles.qtyStepBtn}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus size={18} color="#E6EBEE" />
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{quantity}</Text>
              <TouchableOpacity
                style={styles.qtyStepBtn}
                onPress={() => setQuantity((q) => q + 1)}
              >
                <Plus size={18} color="#E6EBEE" />
              </TouchableOpacity>
            </View>
          </View>
        </SafeBlurView>

        {/* Result preview */}
        <View style={styles.resultPreview}>
          <Text style={styles.resultLabel}>Result:</Text>
          <Text style={styles.resultValue}>
            {item.quantity} {action === 'add' ? '+' : '−'} {quantity} ={' '}
            {action === 'add' ? item.quantity + quantity : Math.max(0, item.quantity - quantity)}{' '}
            {item.unit || 'units'}
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            action === 'add' ? { backgroundColor: '#10B981' } : { backgroundColor: '#EF4444' },
            isSubmitting && { opacity: 0.6 },
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <CheckCircle2 size={20} color="#FFFFFF" />
              <Text style={styles.submitText}>
                Confirm {action === 'add' ? 'Stock In' : 'Stock Out'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.rescanBtn} onPress={handleReset}>
          <RotateCcw size={14} color="#64748B" />
          <Text style={styles.rescanText}>Rescan</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8, paddingBottom: 100, gap: 14 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8, borderBottomWidth: 1, borderRadius: 0 },
  headerBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontFamily: 'Poppins-Bold', color: '#E6EBEE' },

  // Item Card
  itemCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  itemCardInner: { padding: 16, position: 'relative', zIndex: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  itemIconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  itemName: { fontSize: 16, fontFamily: 'Poppins-Bold', color: '#E6EBEE' },
  itemCode: { fontSize: 11, fontFamily: 'Urbanist-Medium', color: '#64748B', marginTop: 2, textTransform: 'uppercase' },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemMetaLabel: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#94A3B8' },
  itemMetaValue: { fontSize: 14, fontFamily: 'Poppins-Bold', color: '#E6EBEE' },
  lowBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,59,48,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,59,48,0.25)' },
  lowBadgeText: { fontSize: 10, fontFamily: 'Urbanist-Bold', color: '#FF3B30' },

  // Action Toggle
  actionToggle: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  actionBtnAddActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  actionBtnRemoveActive: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  actionText: { fontSize: 13, fontFamily: 'Poppins-Bold', color: '#94A3B8' },
  actionTextActive: { color: '#FFFFFF' },

  // Quantity
  qtyCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  qtyCardInner: { padding: 16, alignItems: 'center', position: 'relative', zIndex: 1 },
  qtyLabel: { fontSize: 12, fontFamily: 'Urbanist-Bold', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  qtyStepBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  qtyValue: { fontSize: 32, fontFamily: 'Poppins-Bold', color: '#E6EBEE', minWidth: 60, textAlign: 'center' },

  // Result
  resultPreview: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  resultLabel: { fontSize: 13, fontFamily: 'Urbanist-Medium', color: '#94A3B8' },
  resultValue: { fontSize: 14, fontFamily: 'Poppins-Bold', color: '#E6EBEE' },

  // Submit
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16, marginTop: 4 },
  submitText: { fontSize: 15, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  rescanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  rescanText: { fontSize: 13, fontFamily: 'Urbanist-Bold', color: '#64748B' },

  // Success
  successScroll: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  successTitle: { fontSize: 24, fontFamily: 'Poppins-Bold', color: '#E6EBEE', marginTop: 8 },
  successSub: { fontSize: 14, fontFamily: 'Urbanist-Medium', color: '#94A3B8' },
  successCard: { width: '100%', borderRadius: 24, borderWidth: 1, overflow: 'hidden', marginTop: 8 },
  successCardInner: { padding: 24, alignItems: 'center', position: 'relative', zIndex: 1 },
  successItemName: { fontSize: 16, fontFamily: 'Poppins-Bold', color: '#E6EBEE' },
  successItemCode: { fontSize: 11, fontFamily: 'Urbanist-Medium', color: '#64748B', marginTop: 4, textTransform: 'uppercase' },
  successQtyRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 16 },
  successQtyLabel: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#94A3B8' },
  successQtyValue: { fontSize: 36, fontFamily: 'Poppins-Bold', color: '#E6EBEE' },
  successQtyUnit: { fontSize: 14, fontFamily: 'Urbanist-Medium', color: '#94A3B8' },
  successActions: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 8 },
  successBtnSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  successBtnSecondaryText: { fontSize: 14, fontFamily: 'Poppins-Bold', color: '#E6EBEE' },
  successBtnPrimary: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#708F96', alignItems: 'center' },
  successBtnPrimaryText: { fontSize: 14, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
});
