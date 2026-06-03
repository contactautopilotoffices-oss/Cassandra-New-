import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ppmService } from '@/services/ppmService';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import ScannerView from '@/components/shared/ScannerView';
import {
  Wrench,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ChevronRight,
  Clock,
} from 'lucide-react-native';

interface PPMSchedule {
  id: string;
  asset_name: string;
  asset_id?: string;
  schedule_type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  next_due: string;
  last_completed?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  description?: string;
}

type ScreenState = 'scanning' | 'found' | 'notfound';

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(dateStr: string): number {
  if (!dateStr) return 999;
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function statusColor(status: string): string {
  switch (status) {
    case 'overdue': return '#EF4444';
    case 'completed': return '#10B981';
    case 'in_progress': return '#3B82F6';
    default: return '#F59E0B';
  }
}

function statusBg(status: string): string {
  switch (status) {
    case 'overdue': return 'rgba(239,68,68,0.15)';
    case 'completed': return 'rgba(16,185,129,0.15)';
    case 'in_progress': return 'rgba(59,130,246,0.15)';
    default: return 'rgba(245,158,11,0.15)';
  }
}

export default function PPMScanScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [state, setState] = useState<ScreenState>('scanning');
  const [schedules, setSchedules] = useState<PPMSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const lookupAsset = useCallback(async (code: string) => {
    if (!propertyId || !code) return;
    setIsLoading(true);
    try {
      const searchTerm = code.trim();

      const res = await ppmService.lookupAsset(propertyId, searchTerm);
      if (!res.success) throw new Error(String(res.error || 'Lookup failed'));

      if (res.data && res.data.length > 0) {
        setSchedules(res.data.map((s: any) => ({
          id: s.id,
          asset_name: s.system_name,
          schedule_type: s.frequency,
          next_due: s.planned_date,
          last_completed: s.done_date,
          status: s.status,
          description: s.description,
        })) as PPMSchedule[]);
        setState('found');
      } else {
        setState('notfound');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to look up asset');
      setState('scanning');
    } finally {
      setIsLoading(false);
    }
  }, [propertyId]);

  const handleReset = () => {
    setState('scanning');
    setSchedules([]);
  };

  if (state === 'scanning' || state === 'notfound') {
    return (
      <ScannerView
        title="PPM Scanner"
        subtitle="Scan asset QR code or tag"
        onScan={lookupAsset}
        onClose={() => router.back()}
        isLoading={isLoading}
      />
    );
  }

  const assetName = schedules[0]?.asset_name || 'Unknown Asset';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={StyleSheet.absoluteFillObject} />

      {/* Header */}
      <SafeBlurView intensity={40} tint="dark" style={[styles.header, { borderColor: 'rgba(255,255,255,0.08)' }]}>
        <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.1)']} style={StyleSheet.absoluteFillObject} />
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Text style={{ color: '#E6EBEE', fontSize: 22 }}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{assetName}</Text>
        <View style={{ width: 40 }} />
      </SafeBlurView>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Maintenance Schedules</Text>

        {schedules.map((s) => {
          const days = daysUntil(s.next_due);
          const isOverdue = days < 0;
          return (
            <SafeBlurView
              key={s.id}
              intensity={40}
              tint="dark"
              style={[styles.scheduleCard, { borderColor: 'rgba(255,255,255,0.08)' }]}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.08)']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.scheduleInner}>
                <View style={styles.scheduleTop}>
                  <View style={styles.scheduleLeft}>
                    <Text style={styles.scheduleType}>{s.schedule_type}</Text>
                    <Text style={styles.scheduleDesc} numberOfLines={2}>{s.description || 'No description'}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusBg(s.status) }]}>
                    <Text style={[styles.statusText, { color: statusColor(s.status) }]}>
                      {s.status.replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                <View style={styles.scheduleMeta}>
                  <View style={styles.metaItem}>
                    <Calendar size={12} color="#94A3B8" />
                    <Text style={styles.metaItemText}>
                      Next: {formatDate(s.next_due)}
                    </Text>
                  </View>
                  {isOverdue ? (
                    <View style={styles.metaItem}>
                      <AlertTriangle size={12} color="#EF4444" />
                      <Text style={[styles.metaItemText, { color: '#EF4444' }]}>
                        {Math.abs(days)} days overdue
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.metaItem}>
                      <Clock size={12} color="#94A3B8" />
                      <Text style={styles.metaItemText}>
                        {days === 0 ? 'Due today' : `${days} days left`}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </SafeBlurView>
          );
        })}

        <TouchableOpacity style={styles.rescanBtn} onPress={handleReset}>
          <RotateCcw size={14} color="#64748B" />
          <Text style={styles.rescanText}>Scan Another Asset</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8, paddingBottom: 100, gap: 10 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8, borderBottomWidth: 1, borderRadius: 0 },
  headerBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontFamily: 'Poppins-Bold', color: '#E6EBEE', flex: 1, textAlign: 'center', marginHorizontal: 8 },

  sectionLabel: { fontSize: 12, fontFamily: 'Urbanist-Bold', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },

  scheduleCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  scheduleInner: { padding: 16, position: 'relative', zIndex: 1 },
  scheduleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  scheduleLeft: { flex: 1, paddingRight: 8 },
  scheduleType: { fontSize: 13, fontFamily: 'Poppins-Bold', color: '#E6EBEE', textTransform: 'capitalize' },
  scheduleDesc: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#94A3B8', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 10, fontFamily: 'Urbanist-Bold', textTransform: 'capitalize' },

  scheduleMeta: { flexDirection: 'row', gap: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaItemText: { fontSize: 11, fontFamily: 'Urbanist-Medium', color: '#94A3B8' },

  rescanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  rescanText: { fontSize: 13, fontFamily: 'Urbanist-Bold', color: '#64748B' },
});
