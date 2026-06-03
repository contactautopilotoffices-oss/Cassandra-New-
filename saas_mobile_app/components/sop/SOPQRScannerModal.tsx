import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ScannerView from '@/components/shared/ScannerView';
import { createClient } from '@/utils/supabase/client';
import { useTheme } from '@/context';

interface SOPQRScannerModalProps {
  visible?: boolean;
  onClose?: () => void;
  /** Called with the resolved sop_completion id after a successful scan */
  onScan?: (completionId: string, templateId?: string) => void;
  propertyId?: string;
  organizationId?: string;
}

export default function SOPQRScannerModal({
  visible,
  onClose,
  onScan,
  propertyId,
  organizationId,
}: SOPQRScannerModalProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = useCallback(async (qrData: string) => {
    if (resolving) return;
    setResolving(true);
    setError(null);

    try {
      // QR codes can encode:
      // 1. A bare template UUID → trigger checklist run
      // 2. JSON { type: 'sop', templateId: '...' }
      let templateId: string | undefined;
      try {
        const parsed = JSON.parse(qrData);
        if (parsed?.type === 'sop' && parsed?.templateId) {
          templateId = parsed.templateId;
        }
      } catch {
        // Treat raw string as templateId if it looks like a UUID
        if (/^[0-9a-f-]{36}$/i.test(qrData)) templateId = qrData;
      }

      if (!templateId) {
        setError('QR code does not match a known SOP template.');
        setResolving(false);
        return;
      }

      if (propertyId && organizationId) {
        const supabase = createClient();
        const { data: template } = await supabase
          .from('sop_templates')
          .select('id, title')
          .eq('id', templateId)
          .maybeSingle();

        if (!template) {
          setError('SOP template not found for this QR code.');
          setResolving(false);
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        const { data: completion } = await supabase
          .from('sop_completions')
          .insert({
            template_id: templateId,
            property_id: propertyId,
            organization_id: organizationId,
            status: 'in_progress',
            completed_by: user?.id ?? null,
            completion_date: new Date().toISOString().split('T')[0],
          })
          .select('id')
          .single();

        onScan?.(completion?.id ?? templateId, templateId);
      } else {
        onScan?.(qrData, templateId);
      }

      onClose?.();
    } catch (err) {
      setError('Failed to start checklist. Try again.');
    } finally {
      setResolving(false);
    }
  }, [resolving, propertyId, organizationId, onScan, onClose]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient
        colors={isDark ? ['#0F1419', '#1A1F2E'] as const : ['#F8FAFC', '#EEF2F6'] as const}
        style={styles.container}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>Scan SOP QR Code</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <X size={20} color={isDark ? '#F8FAFC' : '#1A2332'} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.subtitle, { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' }]}>
          Point your camera at the SOP QR code to start the checklist workflow.
        </Text>

        <View style={styles.scannerWrapper}>
          <ScannerView onScan={handleScan} />
          {resolving && (
            <View style={styles.overlay}>
              <ActivityIndicator size="large" color="#708F96" />
              <Text style={styles.overlayText}>Starting checklist…</Text>
            </View>
          )}
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 4 },
  subtitle: { fontSize: 13, paddingHorizontal: 20, marginBottom: 16, lineHeight: 18 },
  scannerWrapper: { flex: 1, marginHorizontal: 20, borderRadius: 16, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', gap: 12 },
  overlayText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  errorBanner: { margin: 16, padding: 14, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)' },
  errorText: { color: '#FCA5A5', fontSize: 13, textAlign: 'center' },
});
