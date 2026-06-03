import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (asset: ImagePicker.ImagePickerAsset) => void;
  title?: string;
}

export default function CameraCaptureModal({ isOpen, onClose, onCapture, title = 'Take Photo' }: CameraCaptureModalProps) {
  const [capturedImage, setCapturedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  const launchCamera = async () => {
    setIsLaunching(true);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setCapturedImage(null);
        setIsLaunching(false);
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        setCapturedImage(result.assets[0]);
      }
    } catch (err) {
      console.error('Camera launch failed:', err);
    } finally {
      setIsLaunching(false);
    }
  };

  const confirmPhoto = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      setCapturedImage(null);
      onClose();
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    launchCamera();
  };

  const handleClose = () => {
    setCapturedImage(null);
    onClose();
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          {capturedImage ? (
            <Image source={{ uri: capturedImage.uri }} style={styles.preview} resizeMode="contain" />
          ) : (
            <View style={styles.placeholder}>
              <View style={styles.cameraIcon}>
                <Ionicons name="camera" size={40} color="rgba(255,255,255,0.2)" />
              </View>
              <TouchableOpacity onPress={launchCamera} style={styles.launchBtn} disabled={isLaunching}>
                {isLaunching ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.launchBtnText}>Open Camera</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.readyText}>Ready to capture</Text>
            </View>
          )}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {capturedImage ? (
            <View style={styles.reviewRow}>
              <TouchableOpacity onPress={retakePhoto} style={styles.retakeBtn}>
                <Ionicons name="refresh" size={22} color="rgba(255,255,255,0.7)" />
                <Text style={styles.retakeText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmPhoto} style={styles.confirmBtn}>
                <Ionicons name="checkmark-circle" size={20} color="#000" />
                <Text style={styles.confirmBtnText}>Use Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.shutterRow}>
              <TouchableOpacity onPress={launchCamera} disabled={isLaunching} style={styles.shutterOuter}>
                <View style={styles.shutterInner} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 14, fontWeight: '900', color: '#FFF', textTransform: 'uppercase', letterSpacing: 2 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  preview: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', gap: 16 },
  cameraIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
  launchBtn: { paddingHorizontal: 32, paddingVertical: 16, backgroundColor: '#FFF', borderRadius: 20 },
  launchBtnText: { fontSize: 14, fontWeight: '900', color: '#000', textTransform: 'uppercase', letterSpacing: 2 },
  readyText: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 2 },
  controls: { padding: 24 },
  reviewRow: { flexDirection: 'row', gap: 12 },
  retakeBtn: { flex: 1, paddingVertical: 16, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 16 },
  retakeText: { fontSize: 10, fontWeight: '900', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 2 },
  confirmBtn: { flex: 2, flexDirection: 'row', paddingVertical: 16, backgroundColor: '#FFF', borderRadius: 16, justifyContent: 'center', alignItems: 'center', gap: 8 },
  confirmBtnText: { fontSize: 14, fontWeight: '900', color: '#000', textTransform: 'uppercase', letterSpacing: 1 },
  shutterRow: { alignItems: 'center' },
  shutterOuter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFF' },
});
