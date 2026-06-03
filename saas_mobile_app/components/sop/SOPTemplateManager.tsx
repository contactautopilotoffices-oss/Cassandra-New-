import React, { useState, useEffect } from 'react';
import { serverApi } from '@/lib/serverApi';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ClipboardList, Plus, ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '@/constants/designSystem';
import { useTheme } from '@/context';
import { createClient } from '@/utils/supabase/client';

interface SOPTemplateManagerProps {
  propertyId?: string;
}

export default function SOPTemplateManager({ propertyId: propId }: SOPTemplateManagerProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const { propertyId: routeId } = useLocalSearchParams<{ propertyId: string }>();
  const pid = propId || routeId;
  const isDark = theme === 'dark';
  const bgGradient = isDark ? ['#0F1419', '#1A1F2E'] as const : ['#F8FAFC', '#EEF2F6'] as const;

  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!pid) return;
    serverApi.query({
      table: 'sop_templates',
      action: 'select',
      select: 'id, title, category, frequency, is_active',
      filters: [{ op: 'eq', column: 'property_id', value: pid }, { op: 'eq', column: 'is_active', value: true }],
    }).then(({ data, error }: any) => {
      if (!error) setTemplates(data || []);
      setLoading(false);
    });
  }, [pid]);

  return (
    <LinearGradient colors={bgGradient} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>Templates</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push(`/property/${pid}/checklist` as any)} activeOpacity={0.8}>
            <Plus size={18} color="#FFFFFF" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color="#708F96" style={{ marginTop: 40 }} />
        ) : templates.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <ClipboardList size={32} color={isDark ? 'rgba(255,255,255,0.15)' : '#E2E8F0'} strokeWidth={1.5} />
            <Text style={[styles.emptyText, { color: isDark ? 'rgba(230,235,238,0.4)' : 'rgba(26,35,50,0.4)' }]}>
              No templates yet. Create your first checklist template.
            </Text>
          </GlassCard>
        ) : (
          templates.map((t) => (
            <TouchableOpacity key={t.id} onPress={() => router.push(`/property/${pid}/checklist` as any)} activeOpacity={0.75}>
              <GlassCard style={styles.templateCard}>
                <View style={styles.templateRow}>
                  <View style={[styles.catBadge, { backgroundColor: 'rgba(112,143,150,0.12)' }]}>
                    <Text style={styles.catText}>{(t.category || 'General').toUpperCase()}</Text>
                  </View>
                  <ArrowRight size={16} color="#708F96" strokeWidth={1.5} />
                </View>
                <Text style={[styles.templateTitle, { color: isDark ? '#E6EBEE' : '#1D1D1F' }]}>{t.title}</Text>
                <Text style={[styles.templateMeta, { color: isDark ? 'rgba(230,235,238,0.4)' : 'rgba(26,35,50,0.4)' }]}>
                  {t.frequency} · {t.is_active ? 'Active' : 'Paused'}
                </Text>
              </GlassCard>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: {  fontSize: 22, fontWeight: '700' },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#708F96', justifyContent: 'center', alignItems: 'center' },
  emptyCard: { padding: 40, alignItems: 'center', gap: 12, marginTop: 20 },
  emptyText: {  fontSize: 14, textAlign: 'center' },
  templateCard: { padding: 16, marginBottom: 12, gap: 8 },
  templateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  catText: {  fontSize: 8, letterSpacing: 1, color: '#708F96' },
  templateTitle: {  fontSize: 15, fontWeight: '600' },
  templateMeta: {  fontSize: 12 },
});
