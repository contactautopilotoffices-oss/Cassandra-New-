import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Edit3, ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '@/constants/designSystem';
import { useTheme } from '@/context';

interface SOPTemplateFormModalProps {
  templateId?: string;
  propertyId?: string;
  onClose?: () => void;
}

export default function SOPTemplateFormModal({ templateId, propertyId: propId }: SOPTemplateFormModalProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const { propertyId: routeId } = useLocalSearchParams<{ propertyId: string }>();
  const pid = propId || routeId;
  const isDark = theme === 'dark';

  return (
    <View style={styles.container}>
      <GlassCard style={styles.card}>
        <View style={styles.iconCircle}>
          <Edit3 size={28} color="#708F96" strokeWidth={1.5} />
        </View>
        <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
          {templateId ? 'Edit Template' : 'New Template'}
        </Text>
        <Text style={[styles.subtitle, { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' }]}>
          Create and edit checklist templates with items, schedules, and assignments in the checklist manager.
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.push(`/property/${pid}/checklist` as any)}
          activeOpacity={0.8}
        >
          <LinearGradient colors={['#708F96', '#5A737A']} style={styles.gradient}>
            <Text style={styles.btnText}>Open Checklist</Text>
            <ArrowRight size={16} color="#FFFFFF" strokeWidth={2} />
          </LinearGradient>
        </TouchableOpacity>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', padding: 28, alignItems: 'center', gap: 14 },
  iconCircle: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(112,143,150,0.12)', justifyContent: 'center', alignItems: 'center' },
  title: {  fontSize: 18, fontWeight: '700', textAlign: 'center' },
  subtitle: {  fontSize: 13, textAlign: 'center', lineHeight: 18 },
  btn: { width: '100%', borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  gradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  btnText: {  fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
