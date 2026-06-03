import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import {
  BarChart2,
  FileText,
  List,
  ChevronRight,
  LayoutDashboard,
  ArrowLeft,
} from 'lucide-react-native';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { LinearGradient } from 'expo-linear-gradient';

interface ReportCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onPress: () => void;
  color?: string;
}

function ReportCard({ title, description, icon, onPress, color = '#708F96' }: ReportCardProps) {
  const { theme } = useTheme();
  const bg = 'rgba(255, 255, 255, 0.08)';
  const border = 'rgba(255, 255, 255, 0.15)';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: bg, borderColor: border, borderWidth: 1 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}>
        {icon}
      </View>
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: theme === 'dark' ? '#F8FAFC' : '#1A2332' }]}>{title}</Text>
        <Text style={[styles.cardDesc, { color: '#708F96' }]}>{description}</Text>
      </View>
      <ChevronRight size={18} color={color} strokeWidth={1.5} />
    </TouchableOpacity>
  );
}

export default function ReportsScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';


  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LinearGradient 
        colors={isDark ? ['#0F1521', '#121824', '#090d16'] : ['#F5F0E8', '#EAE0D5', '#DFD3C3']} 
        style={StyleSheet.absoluteFillObject} 
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
              <ArrowLeft size={22} color={isDark ? '#F8FAFC' : '#1A2332'} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>Reports</Text>
          </View>
          <Text style={[styles.subtitle, { color: isDark ? '#708F96' : '#708F96' }]}>
            Property analytics and performance insights
          </Text>
        </View>

        {/* Report Cards */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#708F96' : '#708F96' }]}>
            AVAILABLE REPORTS
          </Text>

          <ReportCard
            title="Executive Summary"
            description="All-time KPIs, monthly trends, and top categories"
            icon={<LayoutDashboard size={22} color="#708F96" strokeWidth={1.5} />}
            onPress={() => router.push(`/property/${propertyId}/reports/executive-summary`)}
            color="#708F96"
          />

          <ReportCard
            title="Requests Report"
            description="Ticket volume, floor & category breakdown by month"
            icon={<FileText size={22} color="#22C55E" strokeWidth={1.5} />}
            onPress={() => router.push(`/property/${propertyId}/reports/requests`)}
            color="#22C55E"
          />

          <ReportCard
            title="Snag Reports"
            description="Bulk-imported defect reports with closure tracking"
            icon={<BarChart2 size={22} color="#F97316" strokeWidth={1.5} />}
            onPress={() => router.push(`/property/${propertyId}/reports/snags`)}
            color="#F97316"
          />
        </View>

        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: isDark ? '#1E2535' : '#F8FAFC', borderColor: isDark ? '#2D3748' : '#E2E8F0' }]}>
          <List size={16} color="#708F96" strokeWidth={1.5} />
          <Text style={[styles.infoText, { color: isDark ? '#708F96' : '#708F96' }]}>
            Reports pull live data from your property's tickets. Data refreshes each time you open a report.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  header: { marginBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  title: { fontSize: 28, fontFamily: 'Poppins-Bold', marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: 'Urbanist-Regular' },
  section: { gap: 12 },
  sectionTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardContent: { flex: 1 },
  cardTitle: { fontFamily: 'Poppins-Bold', fontSize: 15, marginBottom: 2 },
  cardDesc: { fontFamily: 'Urbanist-Regular', fontSize: 12 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 20,
  },
  infoText: { flex: 1, fontFamily: 'Urbanist-Regular', fontSize: 12, lineHeight: 18 },
});
