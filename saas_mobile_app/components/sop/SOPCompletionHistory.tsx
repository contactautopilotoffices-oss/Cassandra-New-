import React, { useState, useEffect } from 'react';
import { serverApi } from '@/lib/serverApi';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { History, ArrowRight, CheckCircle2, Clock, AlertTriangle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '@/constants/designSystem';
import { useTheme } from '@/context';
import { createClient } from '@/utils/supabase/client';

interface SOPCompletionHistoryProps {
  propertyId?: string;
  templateId?: string;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed': return <CheckCircle2 size={16} color="#10B981" strokeWidth={2} />;
    case 'missed': return <AlertTriangle size={16} color="#EF4444" strokeWidth={2} />;
    default: return <Clock size={16} color="#FF9F0A" strokeWidth={2} />;
  }
}

export default function SOPCompletionHistory({ propertyId: propId, templateId }: SOPCompletionHistoryProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const { propertyId: routeId } = useLocalSearchParams<{ propertyId: string }>();
  const pid = propId || routeId;
  const isDark = theme === 'dark';
  const bgGradient = isDark ? ['#0F1419', '#1A1F2E'] as const : ['#F8FAFC', '#EEF2F6'] as const;

  const [completions, setCompletions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!pid) return;
    const filters: any[] = [{ op: 'eq', column: 'property_id', value: pid }];
    if (templateId) filters.push({ op: 'eq', column: 'template_id', value: templateId });
    serverApi.query({
      table: 'sop_completions',
      action: 'select',
      select: 'id, status, completed_at, template:sop_templates(title)',
      filters,
      orders: [{ column: 'completed_at', ascending: false }],
      limit: 20,
    }).then(({ data, error }: any) => {
      if (!error) setCompletions(data || []);
      setLoading(false);
    });
  }, [pid, templateId]);

  return (
    <LinearGradient colors={bgGradient} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>History</Text>
        <Text style={[styles.subtitle, { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' }]}>
          Recent checklist completions
        </Text>

        {loading ? (
          <ActivityIndicator size="small" color="#708F96" style={{ marginTop: 40 }} />
        ) : completions.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <History size={32} color={isDark ? 'rgba(255,255,255,0.15)' : '#E2E8F0'} strokeWidth={1.5} />
            <Text style={[styles.emptyText, { color: isDark ? 'rgba(230,235,238,0.4)' : 'rgba(26,35,50,0.4)' }]}>
              No completions yet.
            </Text>
          </GlassCard>
        ) : (
          completions.map((c) => (
            <TouchableOpacity key={c.id} onPress={() => router.push(`/property/${pid}/checklist` as any)} activeOpacity={0.75}>
              <GlassCard style={styles.itemCard}>
                <View style={styles.itemRow}>
                  {getStatusIcon(c.status)}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: isDark ? '#E6EBEE' : '#1D1D1F' }]} numberOfLines={1}>
                      {c.template?.title || 'Checklist'}
                    </Text>
                    <Text style={[styles.itemMeta, { color: isDark ? 'rgba(230,235,238,0.4)' : 'rgba(26,35,50,0.4)' }]}>
                      {c.completed_at ? new Date(c.completed_at).toLocaleDateString() : '—'} · {c.status}
                    </Text>
                  </View>
                  <ArrowRight size={16} color="#708F96" strokeWidth={1.5} />
                </View>
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
  title: {  fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: {  fontSize: 14, marginBottom: 20 },
  emptyCard: { padding: 40, alignItems: 'center', gap: 12, marginTop: 20 },
  emptyText: {  fontSize: 14, textAlign: 'center' },
  itemCard: { padding: 14, marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemTitle: {  fontSize: 14, fontWeight: '600' },
  itemMeta: {  fontSize: 12, marginTop: 2 },
});
