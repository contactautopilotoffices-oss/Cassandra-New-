import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '@/constants/designSystem';
import { useTheme } from '@/context';
import { createClient } from '@/utils/supabase/client';

export default function SOPDueAlerts() {
  const router = useRouter();
  const { theme } = useTheme();
  const { propertyId: pid } = useLocalSearchParams<{ propertyId: string }>();
  const isDark = theme === 'dark';
  const bgGradient = isDark ? ['#0F1419', '#1A1F2E'] as const : ['#F8FAFC', '#EEF2F6'] as const;

  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!pid) return;
    supabase
      .from('sop_completions')
      .select('id, status, created_at, template:sop_templates(title)')
      .eq('property_id', pid)
      .in('status', ['pending', 'in_progress', 'missed'])
      .order('created_at', { ascending: true })
      .limit(20)
      .then(({ data, error }: any) => {
        if (!error) setAlerts(data || []);
        setLoading(false);
      });
  }, [pid]);

  return (
    <LinearGradient colors={bgGradient} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>Due & Missed</Text>
        <Text style={[styles.subtitle, { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' }]}>
          Checklists needing attention
        </Text>

        {loading ? (
          <ActivityIndicator size="small" color="#708F96" style={{ marginTop: 40 }} />
        ) : alerts.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Clock size={32} color={isDark ? 'rgba(255,255,255,0.15)' : '#E2E8F0'} strokeWidth={1.5} />
            <Text style={[styles.emptyText, { color: isDark ? 'rgba(230,235,238,0.4)' : 'rgba(26,35,50,0.4)' }]}>
              All caught up! No pending or missed checklists.
            </Text>
          </GlassCard>
        ) : (
          alerts.map((a) => {
            const isMissed = a.status === 'missed';
            return (
              <TouchableOpacity key={a.id} onPress={() => router.push(`/property/${pid}/checklist` as any)} activeOpacity={0.75}>
                <GlassCard style={[styles.alertCard, isMissed ? { borderLeftWidth: 3, borderLeftColor: '#EF4444' } : {}]}>
                  <View style={styles.alertRow}>
                    {isMissed ? (
                      <AlertTriangle size={18} color="#EF4444" strokeWidth={2} />
                    ) : (
                      <Clock size={18} color="#FF9F0A" strokeWidth={2} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alertTitle, { color: isDark ? '#E6EBEE' : '#1D1D1F' }]} numberOfLines={1}>
                        {a.template?.title || 'Checklist'}
                      </Text>
                      <Text style={[styles.alertMeta, { color: isDark ? 'rgba(230,235,238,0.4)' : 'rgba(26,35,50,0.4)' }]}>
                        {a.status.toUpperCase()} · {a.created_at ? new Date(a.created_at).toLocaleString() : '—'}
                      </Text>
                    </View>
                    <ArrowRight size={16} color="#708F96" strokeWidth={1.5} />
                  </View>
                </GlassCard>
              </TouchableOpacity>
            );
          })
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
  alertCard: { padding: 14, marginBottom: 10 },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  alertTitle: {  fontSize: 14, fontWeight: '600' },
  alertMeta: {  fontSize: 11, marginTop: 2 },
});
