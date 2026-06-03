import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';

interface SignOutModalProps {
  visible: boolean;
  onClose: () => void;
  onSignOut: () => Promise<void> | void;
}

export default function SignOutModal({ visible, onClose, onSignOut }: SignOutModalProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const isDark = theme === 'dark';
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleConfirm = async () => {
    setIsLoggingOut(true);
    try {
      await onSignOut();
      setTimeout(() => {
        router.replace('/login');
      }, 800);
    } catch (error) {
      console.error('Sign out failed:', error);
      setIsLoggingOut(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(15, 23, 42, 0.4)' }]}>
        <View style={[styles.modal, { backgroundColor: isDark ? 'rgba(30,30,40,0.98)' : 'rgba(255,255,255,0.95)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'transparent', borderWidth: isDark ? 1 : 0 }]}>
          {/* Close button */}
          {!isLoggingOut && (
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>
          )}

          {/* Icon */}
          <View style={styles.iconContainer}>
            <Ionicons name="log-out-outline" size={32} color="#EF4444" />
          </View>

          {/* Text */}
          <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>Wait, Don't Go!</Text>
          <Text style={[styles.subtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            Are you sure you want to sign out?
          </Text>

          {/* Buttons */}
          <TouchableOpacity
            style={[styles.confirmButton, { backgroundColor: '#EF4444' }]}
            onPress={handleConfirm}
            disabled={isLoggingOut}
            activeOpacity={0.8}
          >
            {isLoggingOut ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.confirmText}>Securing Session...</Text>
              </View>
            ) : (
              <Text style={styles.confirmText}>Yes, Sign Out</Text>
            )}
          </TouchableOpacity>

          {!isLoggingOut && (
            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={[styles.cancelText, { color: isDark ? '#E2E8F0' : '#475569' }]}>Stay Logged In</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#FFF1F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  confirmButton: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: 'rgba(239,68,68,0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelButton: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
