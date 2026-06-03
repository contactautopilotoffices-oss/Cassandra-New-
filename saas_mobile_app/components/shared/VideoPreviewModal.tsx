import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { Video, ResizeMode, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface VideoPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  videoUrl: string | null;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function VideoPreviewModal({ visible, onClose, videoUrl }: VideoPreviewModalProps) {
  const insets = useSafeAreaInsets();
  const videoRef = React.useRef<Video>(null);

  React.useEffect(() => {
    if (visible) {
      // Configure audio to play even in silent mode
      Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        interruptionModeIOS: 1, // interruptionModeIOS.DoNotMix
        interruptionModeAndroid: 1, // interruptionModeAndroid.DoNotMix
        shouldDuckAndroid: true,
      });
    }
  }, [visible]);

  if (!videoUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" translucent />
        
        {/* Backdrop / Background */}
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={onClose}
          disabled={false}
        >
          <View style={StyleSheet.absoluteFill} />
        </TouchableOpacity>

        {/* Video Player */}
        <View style={styles.videoWrapper}>
          <Video
            ref={videoRef}
            source={{ uri: videoUrl }}
            style={styles.video}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            isLooping
            shouldPlay={visible}
            onPlaybackStatusUpdate={(status) => {
              if (status.isLoaded && status.didJustFinish) {
                // Handle loop or finish if needed
              }
            }}
          />
        </View>

        {/* Close Button */}
        <TouchableOpacity
          style={[styles.closeBtn, { top: Math.max(insets.top, 20) }]}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <View style={styles.closeBtnCircle}>
            <Ionicons name="close" size={24} color="#FFF" />
          </View>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  videoWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  closeBtnCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});
