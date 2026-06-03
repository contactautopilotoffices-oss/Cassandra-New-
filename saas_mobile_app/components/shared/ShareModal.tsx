import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Alert,
  SafeAreaView,
} from 'react-native';
// Lazy import expo-clipboard — may not be installed
let Clipboard: any;
try {
  Clipboard = require('expo-clipboard');
} catch (e) {
  Clipboard = null;
}
import { Ionicons } from '@expo/vector-icons';
import { Linking } from 'react-native';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string;
  ticketNumber: string;
  title: string;
}

const PLATFORMS = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: 'logo-whatsapp' as const,
    color: '#25D366',
    getUrl: (url: string, text: string) =>
      `https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: 'paper-plane-outline' as const,
    color: '#229ED9',
    getUrl: (url: string, text: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: 'email',
    label: 'Email',
    icon: 'mail-outline' as const,
    color: '#EA4335',
    getUrl: (url: string, text: string) =>
      `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`,
  },
  {
    id: 'sms',
    label: 'SMS',
    icon: 'chatbubble-outline' as const,
    color: '#5F2EEA',
    getUrl: (url: string, text: string) =>
      `sms:?body=${encodeURIComponent(text + ' ' + url)}`,
  },
];

export default function ShareModal({ isOpen, onClose, ticketId, ticketNumber, title }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `https://app.autopilot.com/tickets/${ticketId}`;
  const shareText = `Ticket ${ticketNumber}: ${title}`;

  const handleCopy = async () => {
    if (Clipboard?.setStringAsync) {
      await Clipboard.setStringAsync(shareUrl);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePlatformShare = async (platform: typeof PLATFORMS[0]) => {
    const url = platform.getUrl(shareUrl, shareText);
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      onClose();
    } else {
      Alert.alert('Not Available', `${platform.label} is not installed on this device.`);
    }
  };

  const handleNativeShare = async () => {
    try {
      await Share.share({
        message: `${shareText}\n${shareUrl}`,
        url: shareUrl,
      });
      onClose();
    } catch { /* user cancelled */ }
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Share Ticket</Text>
              <Text style={styles.ticketNum}>{ticketNumber}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Copy Link */}
          <View style={styles.linkRow}>
            <Text style={styles.linkText} numberOfLines={1}>{shareUrl}</Text>
            <TouchableOpacity
              onPress={handleCopy}
              style={[styles.copyBtn, copied && styles.copyBtnCopied]}
            >
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color="#FFF" />
              <Text style={styles.copyBtnText}>{copied ? 'Copied!' : 'Copy'}</Text>
            </TouchableOpacity>
          </View>

          {/* Platforms */}
          <View style={styles.platformGrid}>
            {PLATFORMS.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.platformBtn, { backgroundColor: p.color }]}
                onPress={() => handlePlatformShare(p)}
              >
                <Ionicons name={p.icon} size={24} color="#FFF" />
                <Text style={styles.platformLabel}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Native Share */}
          <TouchableOpacity onPress={handleNativeShare} style={styles.moreBtn}>
            <Text style={styles.moreBtnText}>More options...</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  title: { fontSize: 14, fontWeight: '700', color: '#1A2332' },
  ticketNum: { fontSize: 12, color: '#6B7280',  marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', marginTop: 16 },
  linkText: { flex: 1, fontSize: 11, color: '#6B7280', },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#708F96' },
  copyBtnCopied: { backgroundColor: '#10B981' },
  copyBtnText: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  platformGrid: { flexDirection: 'row', gap: 12, marginTop: 16 },
  platformBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', gap: 6 },
  platformLabel: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  moreBtn: { marginTop: 16, paddingVertical: 12, backgroundColor: '#2563EB', borderRadius: 14, alignItems: 'center' },
  moreBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
