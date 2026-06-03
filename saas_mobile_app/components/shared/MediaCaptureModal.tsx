import * as React from 'react';
import { useState } from 'react';
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
import { CameraView, useCameraPermissions, useMicrophonePermissions, FlashMode } from 'expo-camera';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export type MediaFile = {
  uri: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
  duration?: number;
};

interface MediaCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (media: MediaFile) => void;
  title?: string;
  initialMode?: 'photo' | 'video';
}

type Mode = 'picture' | 'video';

export default function MediaCaptureModal({ isOpen, onClose, onCapture, title = 'Add Media', initialMode = 'photo' }: MediaCaptureModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode === 'photo' ? 'picture' : 'video');
  const [capturedMedia, setCapturedMedia] = useState<MediaFile | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  
  const cameraRef = React.useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  React.useEffect(() => {
    if (isOpen) {
      setMode(initialMode === 'photo' ? 'picture' : 'video');
      requestCameraPermission();
      requestMicPermission();
    }
  }, [isOpen, initialMode]);

  const takePicture = async () => {
    if (!cameraRef.current) return;
    setIsLaunching(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      if (photo) {
        setCapturedMedia({
          uri: photo.uri,
          type: 'image',
          width: photo.width,
          height: photo.height,
        });
      }
    } catch (err) {
      console.error('Failed to take picture:', err);
    } finally {
      setIsLaunching(false);
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current) return;
    try {
      setIsRecording(true);
      const video = await cameraRef.current.recordAsync({
        maxDuration: 60,
      });
      if (video) {
        setCapturedMedia({
          uri: video.uri,
          type: 'video',
        });
      }
    } catch (err) {
      console.error('Failed to record video:', err);
    } finally {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    cameraRef.current?.stopRecording();
    setIsRecording(false);
  };

  const launchGallery = async () => {
    setIsLaunching(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mode === 'picture' ? ['images'] : ['images', 'videos'],
        quality: 0.85,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setCapturedMedia({
          uri: asset.uri,
          type: asset.type === 'video' ? 'video' : 'image',
          width: asset.width,
          height: asset.height,
          duration: asset.duration || undefined,
        });
      }
    } catch (err) {
      console.error('Gallery launch failed:', err);
    } finally {
      setIsLaunching(false);
    }
  };

  const confirmMedia = () => {
    if (capturedMedia) {
      onCapture(capturedMedia);
      setCapturedMedia(null);
      onClose();
    }
  };

  const retake = () => {
    setCapturedMedia(null);
  };

  const handleClose = () => {
    setCapturedMedia(null);
    setMode('picture');
    onClose();
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity 
            onPress={() => setFacing(current => (current === 'back' ? 'front' : 'back'))}
            style={styles.flipBtn}
          >
            <Ionicons name="camera-reverse-outline" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Mode Tabs */}
        {!capturedMedia && !isRecording && (
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeTab, mode === 'picture' && styles.modeTabActive]}
              onPress={() => setMode('picture')}
            >
              <Ionicons name="camera" size={16} color={mode === 'picture' ? '#000' : 'rgba(255,255,255,0.6)'} />
              <Text style={[styles.modeTabText, mode === 'picture' && styles.modeTabTextActive]}>Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, mode === 'video' && styles.modeTabActiveRed]}
              onPress={() => setMode('video')}
            >
              <Ionicons name="videocam" size={16} color={mode === 'video' ? '#FFF' : 'rgba(255,255,255,0.6)'} />
              <Text style={[styles.modeTabText, mode === 'video' && styles.modeTabTextActive]}>Video</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Content */}
        <View style={styles.content}>
          {capturedMedia ? (
            capturedMedia.type === 'image' ? (
              <Image source={{ uri: capturedMedia.uri }} style={styles.preview} resizeMode="contain" />
            ) : (
              <Video
                source={{ uri: capturedMedia.uri }}
                style={styles.preview}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                isLooping
              />
            )
          ) : (
            <View style={styles.cameraContainer}>
              {!cameraPermission?.granted ? (
                <TouchableOpacity onPress={requestCameraPermission} style={styles.permissionBtn}>
                  <Text style={styles.permissionText}>Grant Camera Permission</Text>
                </TouchableOpacity>
              ) : (
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing={facing}
                  flash={flash}
                  mode={mode}
                />
              )}
            </View>
          )}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {capturedMedia ? (
            <View style={styles.reviewRow}>
              <TouchableOpacity onPress={retake} style={styles.retakeBtn}>
                <Ionicons name="refresh" size={20} color="rgba(255,255,255,0.7)" />
                <Text style={styles.retakeText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmMedia} style={styles.confirmBtn}>
                <Ionicons name="checkmark-circle" size={20} color="#000" />
                <Text style={styles.confirmBtnText}>Use {capturedMedia.type === 'image' ? 'Photo' : 'Video'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.captureRow}>
              {/* Gallery */}
              <TouchableOpacity onPress={launchGallery} style={styles.galleryBtn} disabled={isLaunching || isRecording}>
                <Ionicons name="images-outline" size={22} color="#FFF" />
                <Text style={styles.galleryText}>Gallery</Text>
              </TouchableOpacity>

              {/* Shutter */}
              {mode === 'picture' ? (
                <TouchableOpacity onPress={takePicture} style={styles.shutterOuter} disabled={isLaunching}>
                  <View style={styles.shutterInner} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  onPress={isRecording ? stopRecording : startRecording} 
                  style={[styles.shutterOuter, isRecording && { borderColor: '#EF4444' }]}
                >
                  <View style={[styles.shutterInner, { backgroundColor: '#EF4444', borderRadius: isRecording ? 4 : 28 }]} />
                </TouchableOpacity>
              )}

              {/* Flash toggle */}
              <TouchableOpacity 
                onPress={() => setFlash(f => (f === 'off' ? 'on' : 'off'))}
                style={styles.galleryBtn}
              >
                <Ionicons 
                  name={flash === 'on' ? "flash" : "flash-off"} 
                  size={22} 
                  color={flash === 'on' ? "#F59E0B" : "#FFF"} 
                />
                <Text style={styles.galleryText}>Flash</Text>
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
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  flipBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 14, fontWeight: '900', color: '#FFF', textTransform: 'uppercase', letterSpacing: 2 },
  modeRow: { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingHorizontal: 16, paddingBottom: 12 },
  modeTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },
  modeTabActive: { backgroundColor: '#FFF' },
  modeTabActiveRed: { backgroundColor: '#EF4444' },
  modeTabText: { fontSize: 13, fontWeight: '900', color: 'rgba(255,255,255,0.6)' },
  modeTabTextActive: { color: '#000' },
  content: { flex: 1 },
  preview: { width: '100%', height: '100%' },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  permissionBtn: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  permissionText: { color: '#FFF', fontWeight: '700' },
  placeholder: { alignItems: 'center', gap: 20 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
  launchBtn: { paddingHorizontal: 32, paddingVertical: 16, backgroundColor: '#FFF', borderRadius: 20 },
  launchBtnText: { fontSize: 14, fontWeight: '900', color: '#000', textTransform: 'uppercase', letterSpacing: 2 },
  controls: { padding: 24 },
  reviewRow: { flexDirection: 'row', gap: 12 },
  retakeBtn: { flex: 1, paddingVertical: 16, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 16 },
  retakeText: { fontSize: 10, fontWeight: '900', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 2 },
  confirmBtn: { flex: 2, flexDirection: 'row', paddingVertical: 16, backgroundColor: '#FFF', borderRadius: 16, justifyContent: 'center', alignItems: 'center', gap: 8 },
  confirmBtnText: { fontSize: 14, fontWeight: '900', color: '#000', textTransform: 'uppercase', letterSpacing: 1 },
  captureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  galleryBtn: { width: 56, alignItems: 'center', gap: 4 },
  galleryText: { fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 },
  shutterOuter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFF' },
});
