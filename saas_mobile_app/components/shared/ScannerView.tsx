import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  X,
  Flashlight,
  FlashlightOff,
  Keyboard,
  Scan,
  Camera as CameraIcon,
} from 'lucide-react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SCAN_SIZE = Math.min(SCREEN_W, SCREEN_H) * 0.65;

type ScanMode = 'camera' | 'manual';

interface ScannerViewProps {
  title?: string;
  subtitle?: string;
  onScan: (code: string) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export default function ScannerView({
  title = 'Scan QR Code',
  subtitle = 'Position the code within the frame',
  onScan,
  onClose,
  isLoading = false,
}: ScannerViewProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanMode, setScanMode] = useState<ScanMode>('camera');
  const [torchOn, setTorchOn] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [scanned, setScanned] = useState(false);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanned || isLoading) return;
      setScanned(true);
      onScan(data.trim());
      // Reset scan lock after delay
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = setTimeout(() => setScanned(false), 2000);
    },
    [scanned, isLoading, onScan]
  );

  const handleManualSubmit = () => {
    const code = manualInput.trim();
    if (!code) return;
    onScan(code);
  };

  if (!permission?.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={StyleSheet.absoluteFillObject} />
        <SafeBlurView intensity={60} tint="dark" style={[styles.permissionCard, { borderColor: 'rgba(255,255,255,0.08)' }]}>
          <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.1)']} style={StyleSheet.absoluteFillObject} />
          <View style={styles.permissionInner}>
            <CameraIcon size={48} color="#708F96" />
            <Text style={styles.permissionTitle}>Camera Access Needed</Text>
            <Text style={styles.permissionSub}>
              Allow camera access to scan QR codes and barcodes.
            </Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.permissionClose} onPress={onClose}>
              <Text style={styles.permissionCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeBlurView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Camera Background */}
      {scanMode === 'camera' && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          enableTorch={torchOn}
          onBarcodeScanned={handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a', 'itf14', 'datamatrix'],
          }}
        />
      )}

      {/* Dark overlay with scan window cutout */}
      {scanMode === 'camera' && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          {/* Top */}
          <View style={[styles.overlay, { height: (SCREEN_H - SCAN_SIZE) / 2 - insets.top / 2 }]} />
          {/* Middle row */}
          <View style={styles.middleRow}>
            <View style={[styles.overlay, { flex: 1 }]} />
            {/* Scan frame */}
            <View style={[styles.scanFrame, { width: SCAN_SIZE, height: SCAN_SIZE }]}>
              {/* Corner markers */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              {isLoading && (
                <View style={styles.scanningIndicator}>
                  <ActivityIndicator color="#708F96" />
                  <Text style={styles.scanningText}>Looking up...</Text>
                </View>
              )}
            </View>
            <View style={[styles.overlay, { flex: 1 }]} />
          </View>
          {/* Bottom */}
          <View style={[styles.overlay, { flex: 1 }]} />
        </View>
      )}

      {/* Manual entry background */}
      {scanMode === 'manual' && (
        <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={StyleSheet.absoluteFillObject} />
      )}

      {/* Header */}
      <SafeBlurView intensity={40} tint="dark" style={[styles.header, { borderColor: 'rgba(255,255,255,0.08)' }]}>
        <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.1)']} style={StyleSheet.absoluteFillObject} />
        <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
          <X size={22} color="#E6EBEE" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSub}>{subtitle}</Text>
        </View>
        <View style={{ width: 40 }} />
      </SafeBlurView>

      {/* Mode toggle */}
      <SafeBlurView intensity={40} tint="dark" style={[styles.modeToggle, { borderColor: 'rgba(255,255,255,0.08)' }]}>
        <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.1)']} style={StyleSheet.absoluteFillObject} />
        <TouchableOpacity
          style={[styles.modeBtn, scanMode === 'camera' && styles.modeBtnActive]}
          onPress={() => setScanMode('camera')}
        >
          <Scan size={16} color={scanMode === 'camera' ? '#E6EBEE' : '#94A3B8'} />
          <Text style={[styles.modeText, scanMode === 'camera' && styles.modeTextActive]}>Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, scanMode === 'manual' && styles.modeBtnActive]}
          onPress={() => setScanMode('manual')}
        >
          <Keyboard size={16} color={scanMode === 'manual' ? '#E6EBEE' : '#94A3B8'} />
          <Text style={[styles.modeText, scanMode === 'manual' && styles.modeTextActive]}>Manual</Text>
        </TouchableOpacity>
      </SafeBlurView>

      {/* Manual input */}
      {scanMode === 'manual' && (
        <View style={styles.manualWrap}>
          <TextInput
            value={manualInput}
            onChangeText={setManualInput}
            placeholder="Enter item code or barcode..."
            placeholderTextColor="#64748B"
            style={styles.manualInput}
            onSubmitEditing={handleManualSubmit}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.manualBtn} onPress={handleManualSubmit}>
            <Text style={styles.manualBtnText}>Search</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom controls */}
      {scanMode === 'camera' && (
        <View style={[styles.bottomControls, { bottom: Math.max(insets.bottom, 20) + 16 }]}>
          <TouchableOpacity style={styles.torchBtn} onPress={() => setTorchOn((t) => !t)}>
            {torchOn ? <Flashlight size={24} color="#F59E0B" /> : <FlashlightOff size={24} color="#E6EBEE" />}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Permission
  permissionCard: { flex: 1, margin: 24, borderRadius: 24, borderWidth: 1, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  permissionInner: { padding: 32, alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 },
  permissionTitle: { fontSize: 20,  color: '#E6EBEE', textAlign: 'center' },
  permissionSub: { fontSize: 14,  color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
  permissionBtn: { backgroundColor: '#708F96', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  permissionBtnText: { fontSize: 14,  color: '#FFFFFF' },
  permissionClose: { paddingVertical: 8 },
  permissionCloseText: { fontSize: 14,  color: '#64748B' },

  // Header
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, zIndex: 10 },
  headerBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  headerTextWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16,  color: '#E6EBEE' },
  headerSub: { fontSize: 11,  color: '#94A3B8', marginTop: 2 },

  // Overlay
  overlay: { backgroundColor: 'rgba(0,0,0,0.55)' },
  middleRow: { flexDirection: 'row' },
  scanFrame: { backgroundColor: 'transparent', position: 'relative' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#708F96' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  scanningIndicator: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 8 },
  scanningText: { marginTop: 8, fontSize: 12,  color: '#E6EBEE' },

  // Mode toggle
  modeToggle: { position: 'absolute', top: 76, alignSelf: 'center', flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 3, gap: 3, zIndex: 10 },
  modeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 11 },
  modeBtnActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  modeText: { fontSize: 12,  color: '#94A3B8' },
  modeTextActive: { color: '#E6EBEE' },

  // Manual
  manualWrap: { marginTop: 180, marginHorizontal: 24, gap: 12 },
  manualInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, color: '#E6EBEE', fontSize: 15, },
  manualBtn: { backgroundColor: '#708F96', paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  manualBtnText: { fontSize: 14,  color: '#FFFFFF' },

  // Bottom
  bottomControls: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  torchBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
});
