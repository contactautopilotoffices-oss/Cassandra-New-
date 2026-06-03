import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ClipboardList, CheckCircle2, Clock, AlertTriangle, Play } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '@/constants/designSystem';
import { useTheme } from '@/context';
import { createClient } from '@/utils/supabase/client';

interface SOPDashboardProps {
  propertyId?: string;
}

export default function SOPDashboard({ propertyId: propId }: SOPDashboardProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const { propertyId: routeId } = useLocalSearchParams<{ propertyId: string }>();
  const pid = propId || routeId;
  const isDark = theme === 'dark';
  const bgGradient = isDark ? ['#0F1419', '#1A1F2E'] as const : ['#F8FAFC', '#EEF2F6'] as const;

  const [stats, setStats] = useState({ total: 0, completed: 0, due: 0, missed: 0 });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!pid) return;
    const fetchStats = async () => {
      const { data, error } = await supabase
        .from('sop_completions')
        .select('status, created_at')
        .eq('property_id', pid)
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());

      if (!error && data) {
        setStats({
          total: data.length,
          completed: data.filter((d: any) => d.status === 'completed').length,
          due: data.filter((d: any) => d.status === 'pending' || d.status === 'in_progress').length,
          missed: data.filter((d: any) => d.status === 'missed').length,
        });
      }
      setLoading(false);
    };
    fetchStats();
  }, [pid]);

  const StatCard = ({ icon: Icon, label, value, color }: any) => (
    <GlassCard style={styles.statCard}>
      <View style={[styles.iconCircle, { backgroundColor: `${color}15` }]}>
        <Icon size={20} color={color} strokeWidth={2} />
      </View>
      <Text style={[styles.statValue, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' }]}>{label}</Text>
    </GlassCard>
  );

  return (
    <LinearGradient colors={bgGradient} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>Checklists</Text>
        <Text style={[styles.subtitle, { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' }]}>
          Track and complete your checklists
        </Text>

        {loading ? (
          <ActivityIndicator size="small" color="#708F96" style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.statsGrid}>
            <StatCard icon={ClipboardList} label="Total" value={stats.total} color="#708F96" />
            <StatCard icon={CheckCircle2} label="Done" value={stats.completed} color="#10B981" />
            <StatCard icon={Clock} label="Due" value={stats.due} color="#FF9F0A" />
            <StatCard icon={AlertTriangle} label="Missed" value={stats.missed} color="#EF4444" />
          </View>
        )}

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push(`/property/${pid}/checklist` as any)}
          activeOpacity={0.8}
        >
          <LinearGradient colors={['#708F96', '#5A737A']} style={styles.actionGradient}>
            <Play size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.actionText}>Open Checklist Manager</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 48 },
  title: {  fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginBottom: 4 },
  subtitle: {  fontSize: 14, marginBottom: 24 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard: { width: '47%', padding: 16, alignItems: 'center', gap: 8 },
  iconCircle: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  statValue: {  fontSize: 24, fontWeight: '700' },
  statLabel: {  fontSize: 12, fontWeight: '500' },
  actionBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  actionGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  actionText: {  fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
