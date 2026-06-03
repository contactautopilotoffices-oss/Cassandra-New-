import React, { useEffect, useState } from 'react';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { ArrowLeft, ChevronRight, FileText, CheckCircle, Clock } from 'lucide-react-native';
import { createClient } from '@/utils/supabase/client';
import { queryKeys } from '@/utils/queryKeys';
import { format } from 'date-fns';

interface SnagImport {
  id: string;
  filename: string;
  created_at: string;
  completed_at: string | null;
  total_rows: number;
  valid_rows: number;
}

export default function SnagsReportScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';

  const [imports, setImports] = useState<SnagImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('snag_imports')
      .select('id, filename, created_at, completed_at, total_rows, valid_rows')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(20);
    setImports((data || []) as SnagImport[]);
    setLoading(false);
    setRefreshing(false);
  };

  const { refetch } = useDashboardFetch(queryKeys.property.reportsSnags(propertyId), load, {
    staleTime: 1000 * 60 * 5,
  });

  const onRefresh = () => { setRefreshing(true); refetch().then(() => setRefreshing(false)); };

  const bg = isDark ? '#151B2B' : '#F8FAFC';
  const cardBg = isDark ? '#1E2535' : '#FFFFFF';
  const border = isDark ? '#2D3748' : '#E2E8F0';

  return (
    <View style={[styles.container, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#708F96" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <ArrowLeft
              size={20}
              color={isDark ? '#F8FAFC' : '#1A2332'}
              strokeWidth={2}
              onPress={() => router.back()}
            />
            <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
              Snag Reports
            </Text>
          </View>
          <Text style={[styles.subtitle, { color: isDark ? '#708F96' : '#708F96' }]}>
            Bulk-imported defect reports
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#708F96" />
          </View>
        ) : imports.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: border }]}>
            <FileText size={32} color="#708F96" strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
              No Snag Reports Yet
            </Text>
            <Text style={[styles.emptyDesc, { color: isDark ? '#708F96' : '#708F96' }]}>
              Snag reports are created when bulk ticket imports are processed. Import tickets from the web dashboard to generate reports here.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {imports.map((imp) => {
              const validPct = imp.total_rows > 0
                ? Math.round((imp.valid_rows / imp.total_rows) * 100)
                : 0;
              return (
                <TouchableOpacity
                  key={imp.id}
                  style={[styles.importCard, { backgroundColor: cardBg, borderColor: border }]}
                  onPress={() => router.push(`/property/${propertyId}/reports/snags/${imp.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.importLeft}>
                    <View style={[styles.iconWrap, { backgroundColor: '#F9731618' }]}>
                      <FileText size={18} color="#F97316" strokeWidth={1.5} />
                    </View>
                    <View style={styles.importInfo}>
                      <Text style={[styles.importName, { color: isDark ? '#F8FAFC' : '#1A2332' }]}
                        numberOfLines={1}>
                        {imp.filename}
                      </Text>
                      <Text style={[styles.importMeta, { color: isDark ? '#708F96' : '#708F96' }]}>
                        {format(new Date(imp.created_at), 'dd MMM yyyy, HH:mm')}
                        {imp.completed_at ? ' · ' + format(new Date(imp.completed_at), 'dd MMM') : ' · Processing…'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.importRight}>
                    <View style={styles.importStats}>
                      <Text style={[styles.importStatVal, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
                        {imp.valid_rows}
                      </Text>
                      <Text style={[styles.importStatLabel, { color: isDark ? '#708F96' : '#708F96' }]}>
                        / {imp.total_rows} rows
                      </Text>
                    </View>
                    <View style={[
                      styles.validBadge,
                      {
                        backgroundColor: validPct >= 80 ? '#22C55E18' : validPct >= 50 ? '#EAB30818' : '#EF444418',
                      }
                    ]}>
                      {imp.completed_at
                        ? <CheckCircle size={12} color="#22C55E" strokeWidth={2} />
                        : <Clock size={12} color="#708F96" strokeWidth={2} />
                      }
                      <Text style={[
                        styles.validBadgeText,
                        { color: validPct >= 80 ? '#22C55E' : validPct >= 50 ? '#EAB308' : '#EF4444' }
                      ]}>
                        {validPct}%
                      </Text>
                    </View>
                    <ChevronRight size={16} color="#708F96" strokeWidth={1.5} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },
  header: { marginBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 22, fontFamily: 'Poppins-Bold' },
  subtitle: { fontSize: 13, fontFamily: 'Urbanist-Regular', marginLeft: 32 },
  list: { gap: 10 },
  importCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  importLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  importInfo: { flex: 1 },
  importName: { fontFamily: 'Poppins-Medium', fontSize: 14, marginBottom: 2 },
  importMeta: { fontFamily: 'Urbanist-Regular', fontSize: 11 },
  importRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  importStats: { alignItems: 'flex-end' },
  importStatVal: { fontFamily: 'Poppins-Bold', fontSize: 14 },
  importStatLabel: { fontFamily: 'Urbanist-Regular', fontSize: 10 },
  validBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  validBadgeText: { fontFamily: 'Poppins-Bold', fontSize: 10 },
  emptyCard: {
    borderRadius: 14, borderWidth: 1, padding: 32, alignItems: 'center', gap: 12, marginTop: 20,
  },
  emptyTitle: { fontFamily: 'Poppins-Bold', fontSize: 16, textAlign: 'center' },
  emptyDesc: { fontFamily: 'Urbanist-Regular', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
