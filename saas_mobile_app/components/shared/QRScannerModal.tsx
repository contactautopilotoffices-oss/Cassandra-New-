import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
  title?: string;
  instruction?: string;
}

const { width, height } = Dimensions.get('window');

export default function QRScannerModal({
  isOpen,
  onClose,
  onScan,
  title = "Scan QR Code",
  instruction = "Align the code within the frame",
}: QRScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setScanned(false);
      if (!permission?.granted) {
        requestPermission();
      }
    }
  }, [isOpen, permission]);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    onScan(data);
  };

  if (!permission) return null;

  return (
    <Modal visible={isOpen} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        {!permission.granted ? (
          <View style={styles.permissionView}>
            <Text style={styles.permissionText}>We need your permission to use the camera</Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
            >
              <View style={styles.overlay}>
                <View style={styles.unfocusedContainer}></View>
                <View style={styles.middleContainer}>
                  <View style={styles.unfocusedContainer}></View>
                  <View style={styles.focusedContainer}>
                    <View style={[styles.corner, styles.topLeft]} />
                    <View style={[styles.corner, styles.topRight]} />
                    <View style={[styles.corner, styles.bottomLeft]} />
                    <View style={[styles.corner, styles.bottomRight]} />
                  </View>
                  <View style={styles.unfocusedContainer}></View>
                </View>
                <View style={styles.unfocusedContainer}>
                    <Text style={styles.instructionText}>{instruction}</Text>
                </View>
              </View>
            </CameraView>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, zIndex: 10 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#FFF', fontSize: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  permissionView: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  permissionText: { color: '#FFF', textAlign: 'center', marginBottom: 20, fontSize: 16 },
  permissionBtn: { backgroundColor: '#4F46E5', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  permissionBtnText: { color: '#FFF', fontWeight: '800' },
  cameraContainer: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'transparent' },
  unfocusedContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  middleContainer: { flexDirection: 'row', flex: 2 },
  focusedContainer: { flex: 4, position: 'relative' },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: '#4F46E5', borderWidth: 4 },
  topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  instructionText: { color: '#FFF', fontSize: 14, fontWeight: '700', textAlign: 'center', paddingHorizontal: 40 },
});
