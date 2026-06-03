import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
// @ts-ignore
import * as MediaLibrary from 'expo-media-library';

export type MediaType = 'before' | 'after';
export type FileType = 'photo' | 'video';

interface MediaActionsSheetProps {
  isOpen: boolean;
  /** Called when user wants to replace the media — sheet closes itself first */
  onReplace: () => void;
  /** Called when user wants to view full screen */
  onViewFullScreen: () => void;
  /** Called when user wants to download */
  onDownload: () => void;
  mediaType: MediaType;
  fileType: FileType;
}

export default function MediaActionsSheet({
  isOpen,
  onReplace,
  onViewFullScreen,
  onDownload,
  mediaType,
  fileType,
}: MediaActionsSheetProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (downloading) return;
    // Delegate to parent — parent has access to the actual URL and download logic
    onDownload();
  };

  const handleReplace = () => {
    // Close the sheet first, then parent will open the camera
    onReplace();
  };

  const handleView = () => {
    onViewFullScreen();
  };

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent
      onRequestClose={handleReplace}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleReplace}
      >
        <View />
      </TouchableOpacity>

      <View style={styles.sheetContainer}>
        <View style={styles.sheet}>
          {/* Handle bar */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* Title */}
          <View style={styles.titleRow}>
            <Text style={styles.sheetTitle}>
              {mediaType === 'before' ? 'Before' : 'After'}{' '}
              {fileType === 'photo' ? 'Photo' : 'Video'}
            </Text>
            <TouchableOpacity onPress={handleReplace} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {/* View Full Screen */}
            <TouchableOpacity
              style={styles.actionItem}
              onPress={handleView}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
                <Ionicons name="expand-outline" size={22} color="#3B82F6" />
              </View>
              <View style={styles.actionTextGroup}>
                <Text style={styles.actionLabel}>View Full Screen</Text>
                <Text style={styles.actionHint}>See photo in detail</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </TouchableOpacity>

            {/* Download */}
            <TouchableOpacity
              style={styles.actionItem}
              onPress={handleDownload}
              disabled={downloading}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
                {downloading ? (
                  <ActivityIndicator size="small" color="#10B981" />
                ) : (
                  <Ionicons name="download-outline" size={22} color="#10B981" />
                )}
              </View>
              <View style={styles.actionTextGroup}>
                <Text style={styles.actionLabel}>Download</Text>
                <Text style={styles.actionHint}>Save to photo library</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </TouchableOpacity>

            {/* Replace */}
            <TouchableOpacity
              style={styles.actionItem}
              onPress={handleReplace}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
                <Ionicons name="camera-outline" size={22} color="#F59E0B" />
              </View>
              <View style={styles.actionTextGroup}>
                <Text style={styles.actionLabel}>Replace Photo</Text>
                <Text style={styles.actionHint}>Take a new photo instead</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </TouchableOpacity>
          </View>

          {/* Cancel */}
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleReplace}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A2332',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actions: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    marginBottom: 2,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  actionTextGroup: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A2332',
    marginBottom: 2,
  },
  actionHint: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  cancelBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#64748B',
  },
});
