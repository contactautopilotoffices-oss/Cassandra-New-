import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/Colors';
import { createClient } from '@/utils/supabase/client';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  ChevronLeft,
  Store,
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  DollarSign,
  ChevronRight,
  X
} from 'lucide-react-native';
import { format } from 'date-fns';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';

interface Vendor {
  id: string;
  property_id: string;
  name: string;
  email?: string;
  phone?: string;
  service_type: string;
  contract_start_date?: string;
  contract_end_date?: string;
  monthly_rent?: number;
  commission_rate?: number;
  status: string;
}

interface CommissionCycle {
  id: string;
  vendor_id: string;
  cycle_number: number;
  cycle_start: string;
  cycle_end: string;
  commission_rate: number;
  total_revenue: number;
  commission_amount: number;
  status: 'in_progress' | 'payable' | 'paid' | 'overdue';
  paid_at?: string;
}

export default function VendorRevenueScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';
  const { membership } = useAuth();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [vendorCycles, setVendorCycles] = useState<CommissionCycle[]>([]);
  const [currentCycle, setCurrentCycle] = useState<CommissionCycle | null>(null);
  const [dailyBreakdown, setDailyBreakdown] = useState<any[]>([]);
  const [isVendorLoading, setIsVendorLoading] = useState(false);

  const isAdmin = useMemo(() => {
    if (!membership || !propertyId) return false;
    const prop = membership.properties.find((p) => p.id === propertyId);
    return prop ? ['property_admin', 'org_admin', 'org_super_admin', 'master_admin'].includes(prop.role.toLowerCase()) : false;
  }, [membership, propertyId]);

  const fetchVendors = useCallback(async (refresh = false) => {
    if (!propertyId) return;
    if (refresh) setIsRefreshing(true); else setIsLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('property_id', propertyId)
        .order('name', { ascending: true });
      if (error) throw new Error(error.message || 'Failed to fetch vendors');
      setVendors(data || []);
    } catch (err) {
      console.error('Error fetching vendors:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [propertyId]);

  const fetchVendorData = async (vendorId: string) => {
    setIsVendorLoading(true);
    try {
      const supabase = createClient();
      const { data: cycles, error } = await supabase
        .from('commission_cycles')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('cycle_number', { ascending: false });

      if (error) throw new Error(error.message || 'Failed to fetch vendor data');

      const allCycles = (cycles || []) as CommissionCycle[];
      const current = allCycles.find((c) => c.status === 'in_progress') ?? allCycles[0] ?? null;
      setVendorCycles(allCycles);
      setCurrentCycle(current);
      setDailyBreakdown([]);
    } catch (err) {
      console.error('Error fetching vendor data:', err);
    } finally {
      setIsVendorLoading(false);
    }
  };

  const { refetch } = useDashboardFetch(queryKeys.property.vendor(propertyId), fetchVendors, {
    staleTime: 1000 * 60 * 5,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return '#10B981';
      case 'payable': return '#6366F1';
      case 'in_progress': return '#F59E0B';
      case 'overdue': return '#F43F5E';
      default: return colors.textSecondary;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Paid';
      case 'payable': return 'Ready for Payout';
      case 'in_progress': return 'In Progress';
      case 'overdue': return 'Overdue';
      default: return status;
    }
  };

  const openVendorDetails = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    fetchVendorData(vendor.id);
  };

  if (isLoading && vendors.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={isDark ? ['#0f172a', '#1e1b4b', '#0f172a'] : ['#eef2f6', '#f8fafc', '#ffffff']} style={StyleSheet.absoluteFillObject} />

      <SafeBlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? 'rgba(22,27,40,0.65)' : 'rgba(255,255,255,0.7)' }]} />
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
            <ChevronLeft size={24} color={isDark ? '#FFFFFF' : '#0f172a'} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: isDark ? '#FFFFFF' : '#0f172a' }]}>Vendor Revenue</Text>
            <Text style={[styles.headerSubtitle, { color: isDark ? 'rgba(255,255,255,0.5)' : '#64748B' }]}>{vendors.length} Active Vendors</Text>
          </View>
        </View>
      </SafeBlurView>

      <FlatList
        data={vendors}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => refetch()} tintColor={colors.primary} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Store size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No vendors found</Text>
          </View>
        }
        renderItem={({ item: vendor }) => (
          <TouchableOpacity 
            style={[styles.vendorCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} 
            onPress={() => openVendorDetails(vendor)}
          >
            <View style={styles.vendorHeader}>
              <View style={[styles.vendorIconWrap, { backgroundColor: colors.primary + '20' }]}>
                <Store size={20} color={colors.primary} />
              </View>
              <View style={styles.vendorInfo}>
                <Text style={[styles.vendorName, { color: colors.text }]}>{vendor.name}</Text>
                <Text style={[styles.vendorType, { color: colors.textSecondary }]}>{vendor.service_type || 'Vendor'}</Text>
              </View>
              <ChevronRight size={20} color={colors.textTertiary} />
            </View>
            
            <View style={[styles.vendorStats, { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
              <View style={styles.statItem}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>COMMISSION</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>{vendor.commission_rate || 0}%</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>MONTHLY RENT</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>{formatCurrency(vendor.monthly_rent || 0)}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!selectedVendor} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{selectedVendor?.name}</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Revenue Dashboard</Text>
              </View>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.surface }]} onPress={() => setSelectedVendor(null)}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {isVendorLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
                {currentCycle ? (
                  <View style={[styles.activeCycleCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
                    <View style={styles.cycleHeaderRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TrendingUp size={16} color={colors.primary} />
                        <Text style={[styles.cycleCardTitle, { color: colors.primary }]}>Current Cycle (C{currentCycle.cycle_number})</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(currentCycle.status) + '20' }]}>
                        <Text style={[styles.statusText, { color: getStatusColor(currentCycle.status) }]}>{getStatusLabel(currentCycle.status)}</Text>
                      </View>
                    </View>
                    <View style={styles.cycleDates}>
                      <Calendar size={14} color={colors.textSecondary} />
                      <Text style={[styles.cycleDateText, { color: colors.textSecondary }]}>
                        {format(new Date(currentCycle.cycle_start), 'MMM d, yyyy')} - {format(new Date(currentCycle.cycle_end), 'MMM d, yyyy')}
                      </Text>
                    </View>
                    
                    <View style={styles.cycleMoneyRow}>
                      <View style={styles.moneyBox}>
                        <Text style={[styles.moneyLabel, { color: colors.textSecondary }]}>TOTAL REVENUE</Text>
                        <Text style={[styles.moneyValue, { color: colors.text }]}>{formatCurrency(currentCycle.total_revenue || 0)}</Text>
                      </View>
                      <View style={[styles.moneyDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.moneyBox}>
                        <Text style={[styles.moneyLabel, { color: colors.textSecondary }]}>OUR COMMISSION ({currentCycle.commission_rate}%)</Text>
                        <Text style={[styles.moneyValue, { color: colors.primary }]}>{formatCurrency(currentCycle.commission_amount || 0)}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.noCycleCard, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.noCycleText, { color: colors.textSecondary }]}>No active commission cycle</Text>
                  </View>
                )}

                <Text style={[styles.sectionTitle, { color: colors.text }]}>Cycle History</Text>
                {vendorCycles.filter(c => c.id !== currentCycle?.id).length > 0 ? (
                  vendorCycles.filter(c => c.id !== currentCycle?.id).map((cycle) => (
                    <View key={cycle.id} style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={styles.historyTop}>
                        <Text style={[styles.historyCycleNum, { color: colors.text }]}>Cycle {cycle.cycle_number}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(cycle.status) + '20' }]}>
                          <Text style={[styles.statusText, { color: getStatusColor(cycle.status) }]}>{getStatusLabel(cycle.status)}</Text>
                        </View>
                      </View>
                      <Text style={[styles.historyDates, { color: colors.textSecondary }]}>
                        {format(new Date(cycle.cycle_start), 'MMM d')} - {format(new Date(cycle.cycle_end), 'MMM d, yyyy')}
                      </Text>
                      <View style={styles.historyMoneyRow}>
                        <Text style={[styles.historyRevenue, { color: colors.textSecondary }]}>Rev: {formatCurrency(cycle.total_revenue || 0)}</Text>
                        <Text style={[styles.historyCommission, { color: colors.text }]}>Fee: {formatCurrency(cycle.commission_amount || 0)}</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No previous cycles found.</Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 1, zIndex: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 22, fontFamily: 'Poppins-Bold', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 12, fontFamily: 'Urbanist-Medium', marginTop: 1 },
  
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyTitle: { marginTop: 16, fontSize: 18, fontFamily: 'Poppins-Bold' },
  emptyText: { fontSize: 14, fontFamily: 'Urbanist-Regular', textAlign: 'center', marginTop: 10 },
  
  vendorCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  vendorHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vendorIconWrap: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  vendorInfo: { flex: 1 },
  vendorName: { fontSize: 16, fontFamily: 'Poppins-Bold' },
  vendorType: { fontSize: 12, fontFamily: 'Urbanist-Medium' },
  
  vendorStats: { flexDirection: 'row', marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  statItem: { flex: 1 },
  statLabel: { fontSize: 10, fontFamily: 'Urbanist-Bold', letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: 16, fontFamily: 'Poppins-Bold' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { height: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 20, fontFamily: 'Poppins-Bold' },
  modalSubtitle: { fontSize: 14, fontFamily: 'Urbanist-Medium' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  
  modalScroll: { padding: 20 },
  
  activeCycleCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 24 },
  cycleHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cycleCardTitle: { fontSize: 14, fontFamily: 'Poppins-Bold' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 10, fontFamily: 'Urbanist-Bold', textTransform: 'uppercase' },
  cycleDates: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  cycleDateText: { fontSize: 12, fontFamily: 'Urbanist-Medium' },
  
  cycleMoneyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 12 },
  moneyBox: { flex: 1 },
  moneyLabel: { fontSize: 10, fontFamily: 'Urbanist-Bold', marginBottom: 4 },
  moneyValue: { fontSize: 18, fontFamily: 'Poppins-Bold' },
  moneyDivider: { width: 1, height: '100%', marginHorizontal: 12 },
  
  noCycleCard: { padding: 20, borderRadius: 12, alignItems: 'center', marginBottom: 24 },
  noCycleText: { fontFamily: 'Urbanist-Medium' },
  
  sectionTitle: { fontSize: 18, fontFamily: 'Poppins-Bold', marginBottom: 12 },
  
  historyCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  historyCycleNum: { fontSize: 14, fontFamily: 'Poppins-Bold' },
  historyDates: { fontSize: 12, fontFamily: 'Urbanist-Regular', marginBottom: 12 },
  historyMoneyRow: { flexDirection: 'row', justifyContent: 'space-between' },
  historyRevenue: { fontSize: 13, fontFamily: 'Urbanist-Medium' },
  historyCommission: { fontSize: 14, fontFamily: 'Poppins-Bold' },
});
