import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  FlatList,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { stockService } from '@/services/stockService';

interface StockItem {
  id: string;
  name: string;
  item_code: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  barcode: string | null;
  min_threshold?: number;
  organization_id?: string | null;
}

interface QueuedItem extends StockItem {
  action: 'IN' | 'OUT';
  qty: number;
  notes: string;
  scanMode: string;
  error?: string;
}

// Map UI action label to DB action value
const toDbAction = (uiAction: 'IN' | 'OUT'): 'add' | 'remove' =>
  uiAction === 'IN' ? 'add' : 'remove';

interface StockScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  userId?: string;
}

type ScanMode = 'camera' | 'gallery' | 'manual';

const BARCODE_TYPES = [
  'qr', 'code128', 'code39', 'code93', 'ean13', 'ean8', 'upc_a', 'upc_e',
  'aztec', 'datamatrix', 'pdf417', 'codabar', 'itf14',
] as const;

export default function StockScannerModal({
  isOpen,
  onClose,
  propertyId,
  userId,
}: StockScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanMode, setScanMode] = useState<ScanMode>('camera');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [galleryUri, setGalleryUri] = useState<string | null>(null);
  const [galleryProcessing, setGalleryProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Batch queue
  const [queue, setQueue] = useState<QueuedItem[]>([]);

  // Track which items were already scanned (by barcode) to avoid duplicates
  const scannedCodesRef = useRef<Set<string>>(new Set());
  const cameraRef = useRef<CameraView>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setScanMode('camera');
      setLoading(false);
      setError(null);
      setManualInput('');
      setGalleryUri(null);
      setGalleryProcessing(false);
      setQueue([]);
      setIsSubmitting(false);
      scannedCodesRef.current = new Set();
    }
  }, [isOpen]);

  // Fetch item by barcode
  const fetchItemByBarcode = useCallback(async (barcode: string): Promise<StockItem | null> => {
    try {
      const res = await stockService.scanBarcode(barcode, propertyId);
      if (res.success && res.data?.item) {
        return res.data.item as StockItem;
      }
      return null;
    } catch (err: any) {
      console.error('Fetch error:', err);
      return null;
    }
  }, [propertyId]);

  // Add item to queue
  const addToQueue = useCallback((item: StockItem, mode: string) => {
    const code = item.barcode || item.item_code || item.id;
    if (scannedCodesRef.current.has(code)) {
      setError(`"${item.name}" is already in the queue`);
      return;
    }
    scannedCodesRef.current.add(code);
    setQueue(prev => [...prev, { ...item, action: 'IN', qty: 1, notes: '', scanMode: mode }]);
    setError(null);
  }, []);

  // Handle successful barcode detection
  const handleBarCodeScanned = useCallback(async ({ data }: { data: string }) => {
    const code = data.trim();
    if (!code) return;
    if (scannedCodesRef.current.has(code)) {
      setError(`Already in queue — scan a different item`);
      return;
    }
    setLoading(true);
    setError(null);
    const item = await fetchItemByBarcode(code);
    setLoading(false);
    if (item) {
      addToQueue(item, 'camera');
    } else {
      setError(`No item found for "${code}"`);
    }
  }, [fetchItemByBarcode, addToQueue]);

  // Gallery scan
  const handleGalleryPick = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const uri = result.assets[0].uri;
      setGalleryUri(uri);
      setGalleryProcessing(true);
      setError(null);

      const { scanFromURLAsync } = await import('expo-camera');
      try {
        const results = await scanFromURLAsync(uri, [...BARCODE_TYPES] as any);
        if (results && results.length > 0 && results[0].data?.trim()) {
          const code = results[0].data.trim();
          if (scannedCodesRef.current.has(code)) {
            setError(`Already in queue — scan a different item`);
            setGalleryUri(null);
            return;
          }
          setLoading(true);
          const item = await fetchItemByBarcode(code);
          setLoading(false);
          setGalleryUri(null);
          if (item) {
            addToQueue(item, 'gallery');
          } else {
            setError(`No item found for "${code}"`);
          }
          return;
        }
        setError('No barcode detected in this image. Try a clearer photo.');
      } catch (scanErr) {
        console.warn('Gallery scan error:', scanErr);
        setError('Could not detect a barcode. Try a clearer photo.');
      }
    } catch (err) {
      setError('Failed to open image picker');
    } finally {
      setGalleryProcessing(false);
    }
  }, [fetchItemByBarcode, addToQueue]);

  // Manual input
  const handleManualSubmit = useCallback(async () => {
    const code = manualInput.trim();
    if (!code) return;
    if (scannedCodesRef.current.has(code)) {
      setError(`Already in queue — scan a different item`);
      return;
    }
    setLoading(true);
    setError(null);
    const item = await fetchItemByBarcode(code);
    setLoading(false);
    setManualInput('');
    if (item) {
      addToQueue(item, 'manual');
    } else {
      setError(`No item found for "${code}"`);
    }
  }, [manualInput, fetchItemByBarcode, addToQueue]);

  // Auto-trigger manual after 8 chars
  useEffect(() => {
    if (scanMode === 'manual' && manualInput.length >= 8) {
      const timer = setTimeout(() => handleManualSubmit(), 500);
      return () => clearTimeout(timer);
    }
  }, [manualInput, scanMode, handleManualSubmit]);

  // Update queue item
  const updateQueueItem = (id: string, changes: Partial<QueuedItem>) => {
    setQueue(prev => prev.map(item =>
      item.id === id ? { ...item, ...changes } : item
    ));
  };

  // Remove item from queue
  const removeFromQueue = (id: string, code: string) => {
    scannedCodesRef.current.delete(code);
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  // Submit all queued items
  const handleSubmitAll = useCallback(async () => {
    if (queue.length === 0) return;

    // Validate all items
    for (const item of queue) {
      if (item.qty < 1) {
        Alert.alert('Invalid Quantity', `"${item.name}" has invalid quantity. Please fix before submitting.`);
        return;
      }
      if (item.action === 'OUT' && item.qty > item.quantity) {
        Alert.alert('Insufficient Stock', `"${item.name}" only has ${item.quantity} in stock.`);
        return;
      }
    }

    setIsSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    try {
      for (const item of queue) {
        try {
          const quantityBefore = item.quantity;
          const quantityChange = item.action === 'IN' ? item.qty : -item.qty;
          const quantityAfter = quantityBefore + quantityChange;

          const res = await stockService.recordMovement({
            propertyId,
            itemId: item.id,
            action: toDbAction(item.action),
            quantityChange,
            quantityBefore,
            quantityAfter,
            notes: item.notes.trim() || `Scanned via mobile (${item.scanMode.toUpperCase()})`,
            userId: userId || undefined,
          });

          if (!res.success) throw new Error(res.error || 'Failed to record movement');

          // Update queued item's quantity so the UI stays in sync
          updateQueueItem(item.id, { quantity: quantityAfter });

          successCount++;
        } catch (err: any) {
          failCount++;
          errors.push(`${item.name}: ${err.message || 'Failed'}`);
        }
      }

      if (failCount === 0) {
        Alert.alert(
          'All Done!',
          `${successCount} stock movement${successCount !== 1 ? 's' : ''} recorded successfully.`,
          [{ text: 'OK', onPress: () => handleClose() }]
        );
      } else {
        Alert.alert(
          'Partial Success',
          `${successCount} succeeded, ${failCount} failed.\n\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? `\n...and ${errors.length - 3} more` : ''}`,
          [{ text: 'OK' }]
        );
        // Clear successful items from queue
        setQueue(prev => prev.filter(item => errors.some(e => e.startsWith(item.name))));
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [queue, propertyId, userId, updateQueueItem]);

  const handleClose = useCallback(() => {
    setQueue([]);
    setError(null);
    setManualInput('');
    setGalleryUri(null);
    scannedCodesRef.current = new Set();
    onClose();
  }, [onClose]);

  const dismissError = () => setError(null);

  // ─── Render Item Card in Queue ────────────────────────────────────────────────
  const renderQueueItem = ({ item, index }: { item: QueuedItem; index: number }) => {
    const stockColor = item.quantity === 0 ? '#EF4444'
      : item.quantity < (item.min_threshold || 10) ? '#F59E0B'
      : '#10B981';

    const isIN = item.action === 'IN';
    const accentColor = isIN ? '#10B981' : '#EF4444';

    return (
      <View style={[
        styles.queueItem,
        {
          backgroundColor: isIN ? '#052E164D' : '#3B0A0A4D',
          borderColor: accentColor,
          borderWidth: 1.5,
        }
      ]}>
        {/* Top row: accent bar, index badge, item name, stock info, remove button */}
        <View style={styles.queueItemTop}>
          <View style={[styles.queueItemAccent, { backgroundColor: accentColor }]} />
          <View style={[styles.queueIndexBadge, { backgroundColor: accentColor + '25', borderColor: accentColor }]}>
            <Text style={[styles.queueIndexBadgeText, { color: accentColor }]}>{index + 1}</Text>
          </View>
          <View style={styles.queueItemNameGroup}>
            <Text style={[styles.queueItemName, { color: '#FFFFFF' }]} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={[styles.queueItemMeta, { color: 'rgba(255,255,255,0.5)' }]}>
              {item.item_code || item.id.slice(0, 8)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.queueRemoveBtn}
            onPress={() => removeFromQueue(item.id, item.barcode || item.item_code || item.id)}
          >
            <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        </View>

        {/* Stock info row — prominent */}
        <View style={styles.queueStockRow}>
          <View style={[styles.queueStockBadge, { backgroundColor: stockColor + '20' }]}>
            <Ionicons name="cube-outline" size={14} color={stockColor} />
            <Text style={[styles.queueStockBadgeText, { color: stockColor }]}>
              {item.quantity} {item.unit || 'units'}
            </Text>
            <Text style={[styles.queueStockBadgeLabel, { color: 'rgba(255,255,255,0.4)' }]}>
              in stock
            </Text>
          </View>
        </View>

        {/* Action row: ADD STOCK and TAKE STOCK buttons — both always visible */}
        <View style={styles.queueActionRow}>
          <TouchableOpacity
            style={[
              styles.queueActionBtn,
              isIN ? styles.queueActionBtnINActive : styles.queueActionBtnInactive,
            ]}
            onPress={() => updateQueueItem(item.id, { action: 'IN' })}
          >
            <Ionicons
              name="arrow-up-circle"
              size={22}
              color={isIN ? '#FFF' : 'rgba(16,185,129,0.4)'}
            />
            <Text style={[
              styles.queueActionBtnText,
              { color: isIN ? '#FFF' : 'rgba(16,185,129,0.4)' }
            ]}>
              ADD STOCK
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.queueActionBtn,
              !isIN ? styles.queueActionBtnOUTActive : styles.queueActionBtnInactive,
            ]}
            onPress={() => updateQueueItem(item.id, { action: 'OUT' })}
          >
            <Ionicons
              name="arrow-down-circle"
              size={22}
              color={!isIN ? '#FFF' : 'rgba(239,68,68,0.4)'}
            />
            <Text style={[
              styles.queueActionBtnText,
              { color: !isIN ? '#FFF' : 'rgba(239,68,68,0.4)' }
            ]}>
              TAKE STOCK
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quantity row: label + big input */}
        <View style={styles.queueQtyRow}>
          <View style={styles.queueQtyLabelGroup}>
            <Text style={[styles.queueQtyLabel, { color: accentColor }]}>QTY</Text>
            <Text style={[styles.queueQtyUnit, { color: 'rgba(255,255,255,0.4)' }]}>
              ({item.unit || 'units'})
            </Text>
          </View>
          <View style={styles.queueQtyInputRow}>
            <TouchableOpacity
              style={[styles.queueQtyBtnLarge, { borderColor: accentColor + '50', backgroundColor: accentColor + '18' }]}
              onPress={() => updateQueueItem(item.id, { qty: Math.max(1, item.qty - 1) })}
            >
              <Ionicons name="remove" size={20} color={accentColor} />
            </TouchableOpacity>
            <TextInput
              style={[styles.queueQtyInput, {
                backgroundColor: accentColor + '18',
                borderColor: accentColor + '70',
                color: '#FFFFFF',
              }]}
              value={String(item.qty)}
              onChangeText={v => {
                const n = parseInt(v);
                if (!isNaN(n) && n >= 1) updateQueueItem(item.id, { qty: n });
                else if (v === '' || v === '0') updateQueueItem(item.id, { qty: 1 });
              }}
              keyboardType="number-pad"
            />
            <TouchableOpacity
              style={[styles.queueQtyBtnLarge, { borderColor: accentColor + '50', backgroundColor: accentColor + '18' }]}
              onPress={() => updateQueueItem(item.id, { qty: item.qty + 1 })}
            >
              <Ionicons name="add" size={20} color={accentColor} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // ─── Main Render ─────────────────────────────────────────────────────────────
  return (
    <Modal visible={isOpen} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: '#000' }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>SCAN & ADD</Text>
            {queue.length > 0 && (
              <View style={styles.queueBadge}>
                <Text style={styles.queueBadgeText}>{queue.length}</Text>
              </View>
            )}
          </View>
          {queue.length > 0 ? (
            <TouchableOpacity
              style={[styles.submitAllBtn, isSubmitting && styles.submitAllBtnDisabled]}
              onPress={handleSubmitAll}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Text style={styles.submitAllBtnText}>SUBMIT</Text>
                  <Text style={styles.submitAllBtnCount}>{queue.length}</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 64 }} />
          )}
        </View>

        {/* Mode Tabs */}
        <View style={styles.tabs}>
          {([
            { mode: 'camera', icon: 'camera-outline', label: 'Camera' },
            { mode: 'gallery', icon: 'image-outline', label: 'Gallery' },
            { mode: 'manual', icon: 'keypad-outline', label: 'Manual' },
          ] as const).map(({ mode, icon, label }) => (
            <TouchableOpacity
              key={mode}
              style={[styles.tab, scanMode === mode && styles.tabActive]}
              onPress={() => { setScanMode(mode); setError(null); setGalleryUri(null); }}
            >
              <Ionicons
                name={icon as any}
                size={18}
                color={scanMode === mode ? '#FFF' : 'rgba(255,255,255,0.5)'}
              />
              <Text style={[styles.tabText, scanMode === mode && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Error Banner */}
        {error && (
          <TouchableOpacity style={styles.errorBanner} onPress={dismissError} activeOpacity={0.8}>
            <Ionicons name="warning-outline" size={18} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <Ionicons name="close" size={16} color="#EF4444" />
          </TouchableOpacity>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {/* ── Camera Mode ── */}
          {scanMode === 'camera' && (
            <View style={styles.cameraWrapper}>
              {!permission?.granted ? (
                <View style={styles.permissionView}>
                  <Ionicons name="camera-outline" size={48} color="rgba(255,255,255,0.4)" />
                  <Text style={styles.permissionTitle}>Camera Access Required</Text>
                  <Text style={styles.permissionSubtitle}>
                    Allow camera access to scan barcodes
                  </Text>
                  <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
                    <Text style={styles.permissionBtnText}>Grant Permission</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.cameraContainer}>
                  <CameraView
                    ref={cameraRef as any}
                    style={StyleSheet.absoluteFill}
                    onBarcodeScanned={handleBarCodeScanned}
                    barcodeScannerSettings={{
                      barcodeTypes: BARCODE_TYPES as any,
                    }}
                  >
                    <View style={styles.overlay}>
                      <View style={styles.darkOverlay} />
                      <View style={styles.middleRow}>
                        <View style={styles.darkOverlay} />
                        <View style={styles.scanWindow}>
                          <View style={[styles.corner, styles.cornerTL]} />
                          <View style={[styles.corner, styles.cornerTR]} />
                          <View style={[styles.corner, styles.cornerBL]} />
                          <View style={[styles.corner, styles.cornerBR]} />
                          {loading && (
                            <View style={styles.scanLoading}>
                              <ActivityIndicator size="large" color="#708F96" />
                            </View>
                          )}
                        </View>
                        <View style={styles.darkOverlay} />
                      </View>
                      <View style={styles.darkOverlay}>
                        <Text style={styles.instructionText}>
                          {queue.length > 0
                            ? `${queue.length} item${queue.length !== 1 ? 's' : ''} queued — keep scanning!`
                            : 'Align barcode within the frame'
                          }
                        </Text>
                      </View>
                    </View>
                  </CameraView>
                </View>
              )}
            </View>
          )}

          {/* ── Gallery Mode ── */}
          {scanMode === 'gallery' && (
            <View style={styles.galleryWrapper}>
              {!galleryUri ? (
                <TouchableOpacity style={styles.galleryPicker} onPress={handleGalleryPick} activeOpacity={0.8}>
                  <View style={styles.galleryPickerIcon}>
                    <Ionicons name="image-outline" size={48} color="#708F96" />
                  </View>
                  <Text style={styles.galleryPickerTitle}>Choose from Photos</Text>
                  <Text style={styles.galleryPickerSub}>
                    Select an image containing a QR code or barcode
                  </Text>
                  {loading && (
                    <View style={{ marginTop: 16 }}>
                      <ActivityIndicator size="small" color="#708F96" />
                      <Text style={[styles.galleryPickerSub, { marginTop: 8 }]}>Looking up item...</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={styles.galleryPreviewContainer}>
                  <Image source={{ uri: galleryUri }} style={styles.galleryPreview} />
                  {galleryProcessing && (
                    <View style={styles.galleryProcessingOverlay}>
                      <ActivityIndicator size="large" color="#708F96" />
                      <Text style={styles.galleryProcessingText}>Scanning image...</Text>
                    </View>
                  )}
                </View>
              )}
              <TouchableOpacity
                style={styles.galleryCancelBtn}
                onPress={() => { setGalleryUri(null); setError(null); }}
              >
                <Text style={styles.galleryCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Manual Mode ── */}
          {scanMode === 'manual' && (
            <ScrollView style={styles.manualWrapper} contentContainerStyle={{ padding: 16 }}>
              <View style={styles.manualCard}>
                <Text style={styles.manualTitle}>Enter Item Code</Text>
                <Text style={styles.manualSub}>
                  Type the item code or barcode value (auto-searches after 8+ characters)
                </Text>
                <TextInput
                  style={[styles.manualInput, { borderColor: 'rgba(255,255,255,0.2)', color: '#FFF' }]}
                  value={manualInput}
                  onChangeText={setManualInput}
                  onSubmitEditing={handleManualSubmit}
                  placeholder="e.g. PROP-ITEM-001"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  autoCapitalize="characters"
                  returnKeyType="search"
                />
                <TouchableOpacity
                  style={[styles.manualBtn, (!manualInput.trim() || loading) && styles.manualBtnDisabled]}
                  onPress={handleManualSubmit}
                  disabled={!manualInput.trim() || loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="search-outline" size={20} color="#FFF" />
                      <Text style={styles.manualBtnText}>Look Up Item</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* ── Queue Section (full height when items present) ── */}
          {queue.length > 0 && (
            <View style={[styles.queueSection, { backgroundColor: '#0F172A' }]}>
              {/* Summary Bar */}
              <View style={styles.queueSummaryBar}>
                <View style={styles.queueSummaryLeft}>
                  <Ionicons name="cube-outline" size={16} color="#708F96" />
                  <Text style={styles.queueSummaryText}>
                    {queue.length} item{queue.length !== 1 ? 's' : ''} queued
                  </Text>
                </View>
                <View style={styles.queueSummaryRight}>
                  {queue.filter(i => i.action === 'IN').length > 0 && (
                    <View style={styles.queueSummaryBadge}>
                      <Text style={styles.queueSummaryBadgeTextIn}>
                        {queue.filter(i => i.action === 'IN').length} ADD
                      </Text>
                    </View>
                  )}
                  {queue.filter(i => i.action === 'OUT').length > 0 && (
                    <View style={styles.queueSummaryBadge}>
                      <Text style={styles.queueSummaryBadgeTextOut}>
                        {queue.filter(i => i.action === 'OUT').length} TAKE
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Item List */}
              <FlatList
                data={queue}
                keyExtractor={item => item.id}
                renderItem={renderQueueItem}
                style={styles.queueList}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
                ListFooterComponent={
                  <TouchableOpacity
                    style={styles.scanMoreBtn}
                    onPress={() => setScanMode('camera')}
                  >
                    <Ionicons name="qr-code-outline" size={18} color="#708F96" />
                    <Text style={styles.scanMoreBtnText}>Scan More Items</Text>
                  </TouchableOpacity>
                }
              />
            </View>
          )}

          {/* ── Empty / Camera State ── */}
          {queue.length === 0 && !loading && (
            <View style={styles.emptyQueue}>
              <View style={styles.emptyIcon}>
                <Ionicons name="qr-code-outline" size={48} color="rgba(255,255,255,0.1)" />
              </View>
              <Text style={styles.emptyTitle}>No items scanned</Text>
              <Text style={styles.emptySub}>Point camera at barcode to scan</Text>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: {
    color: '#FFF', fontSize: 16, fontWeight: '900',
    letterSpacing: 2,
  },
  queueBadge: {
    backgroundColor: '#708F96', borderRadius: 10, minWidth: 20, height: 20,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  queueBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  submitAllBtn: {
    backgroundColor: '#708F96', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  submitAllBtnDisabled: { opacity: 0.6 },
  submitAllBtnText: { color: '#FFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  submitAllBtnCount: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700' },

  // Tabs
  tabs: {
    flexDirection: 'row', marginHorizontal: 16, gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 4,
    marginBottom: 8,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  tabActive: { backgroundColor: 'rgba(112,143,150,0.4)' },
  tabText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  tabTextActive: { color: '#FFF' },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.15)', marginHorizontal: 16, marginBottom: 8,
    padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: { color: '#EF4444', fontSize: 13, fontWeight: '600', flex: 1 },

  // Camera
  cameraWrapper: { flex: 1 },
  permissionView: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12,
  },
  permissionTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  permissionSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center' },
  permissionBtn: {
    backgroundColor: '#708F96', paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 14, marginTop: 8,
  },
  permissionBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  cameraContainer: { flex: 1 },
  overlay: { flex: 1 },
  darkOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  middleRow: { flexDirection: 'row', flex: 1.5 },
  scanWindow: {
    width: 240, height: 240, backgroundColor: 'transparent',
    position: 'relative', alignItems: 'center', justifyContent: 'center',
  },
  corner: { position: 'absolute', width: 32, height: 32, borderColor: '#708F96' },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  scanLoading: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', borderRadius: 12,
  },
  instructionText: {
    color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600',
    textAlign: 'center', padding: 12,
  },

  // Gallery
  galleryWrapper: { flex: 1, padding: 16 },
  galleryPicker: {
    flex: 1, borderWidth: 2, borderColor: 'rgba(112,143,150,0.3)',
    borderStyle: 'dashed', borderRadius: 20, justifyContent: 'center',
    alignItems: 'center', gap: 16,
  },
  galleryPickerIcon: {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: 'rgba(112,143,150,0.1)', justifyContent: 'center', alignItems: 'center',
  },
  galleryPickerTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  galleryPickerSub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center' },
  galleryPreviewContainer: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  galleryPreview: { width: '100%', height: '100%', borderRadius: 16 },
  galleryProcessingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', gap: 12, borderRadius: 16,
  },
  galleryProcessingText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  galleryCancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginTop: 12,
  },
  galleryCancelText: { color: 'rgba(255,255,255,0.5)', fontWeight: '700', fontSize: 14 },

  // Manual
  manualWrapper: { flex: 1 },
  manualCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, gap: 12 },
  manualTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  manualSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 18 },
  manualInput: {
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, fontWeight: '600', letterSpacing: 1,
  },
  manualBtn: {
    backgroundColor: '#708F96', borderRadius: 12, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  manualBtnDisabled: { opacity: 0.4 },
  manualBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

  // Queue Section
  queueSection: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    flex: 1,
  },
  queueSummaryBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  queueSummaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  queueSummaryRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  queueSummaryText: { fontSize: 13, fontWeight: '800', color: '#708F96', letterSpacing: 0.3 },
  queueSummaryBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  queueSummaryBadgeTextIn: { fontSize: 10, fontWeight: '900', color: '#10B981' },
  queueSummaryBadgeTextOut: { fontSize: 10, fontWeight: '900', color: '#EF4444' },
  queueList: { flex: 1, paddingTop: 12 },
  scanMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, marginHorizontal: 0,
    borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(112,143,150,0.3)',
    borderStyle: 'dashed', marginTop: 8, marginBottom: 8,
  },
  scanMoreBtnText: { fontSize: 13, fontWeight: '700', color: '#708F96' },

  // Queue Item (full card)
  queueItem: {
    padding: 14, borderRadius: 16, marginBottom: 12,
    gap: 12,
  },
  queueItemTop: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  queueItemAccent: {
    width: 4, height: 40, borderRadius: 2, flexShrink: 0,
  },
  queueItemTopLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1,
  },
  queueIndexBadge: {
    width: 28, height: 28, borderRadius: 8, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  queueIndexBadgeText: {
    fontSize: 12, fontWeight: '900',
  },
  queueItemNameGroup: { flex: 1, minWidth: 0 },
  queueItemName: { fontSize: 15, fontWeight: '800', marginBottom: 2, letterSpacing: -0.2 },
  queueItemMeta: { fontSize: 11, fontWeight: '600' },
  queueRemoveBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },

  // Stock info row
  queueStockRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  queueStockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  queueStockBadgeText: {
    fontSize: 14, fontWeight: '900',
  },
  queueStockBadgeLabel: {
    fontSize: 12, fontWeight: '500',
  },

  // Action row — ADD / TAKE buttons
  queueActionRow: {
    flexDirection: 'row', gap: 10,
  },
  queueActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12,
    borderWidth: 2,
  },
  queueActionBtnINActive: {
    backgroundColor: '#10B981', borderColor: '#10B981',
  },
  queueActionBtnOUTActive: {
    backgroundColor: '#EF4444', borderColor: '#EF4444',
  },
  queueActionBtnInactive: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)',
  },
  queueActionBtnText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },

  // Quantity row
  queueQtyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  queueQtyLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  queueQtyLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: 'rgba(255,255,255,0.5)' },
  queueQtyUnit: { fontSize: 11 },
  queueQtyInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  queueQtyBtnLarge: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  queueQtyInput: {
    width: 70, height: 44, borderRadius: 10,
    borderWidth: 1.5, fontSize: 22, fontWeight: '900',
    textAlign: 'center',
  },

  // Empty State
  emptyQueue: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 40,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  emptyTitle: { color: 'rgba(255,255,255,0.3)', fontSize: 16, fontWeight: '700' },
  emptySub: { color: 'rgba(255,255,255,0.15)', fontSize: 13, textAlign: 'center' },
});
