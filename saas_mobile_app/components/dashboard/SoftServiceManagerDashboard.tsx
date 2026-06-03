'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Alert,
  Pressable,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { createClient } from '../../utils/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '@/context';
import SignOutModal from '../ui/SignOutModal';
import { AppBottomNav, TabKey } from '../shared/AppBottomNav';
import StockScannerModal from '../stock/StockScannerModal';
import FloatingMenu from '@/components/ui/FloatingMenu';
import NotificationBell from '@/components/dashboard/NotificationBell';
import { serverApi } from '@/lib/serverApi';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';

const DRAWER_WIDTH = 280;

type SSMTab = 'overview' | 'stock' | 'checklist' | 'profile';

export default function SoftServiceManagerDashboard({ propertyId }: { propertyId: string }) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [activeTab, setActiveTab] = useState<SSMTab>('overview');
  const [userRole, setUserRole] = useState('');
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stockStats, setStockStats] = useState({ total: 0, lowStock: 0, outOfStock: 0 });
  const [checklistStats, setChecklistStats] = useState({ total: 0, pending: 0, completed: 0 });
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [specialization, setSpecialization] = useState<string | null>(null);
  // Shift / Check-in state
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [isCheckingInOut, setIsCheckingInOut] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const { tab } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (tab && ['overview', 'stock', 'checklist', 'profile'].includes(tab)) {
      setActiveTab(tab as SSMTab);
    }
  }, [tab]);

  const { refetch } = useDashboardFetch(queryKeys.property.softServiceLegacy(propertyId), async () => {
    await Promise.all([fetchUserRole(), fetchData(), fetchShiftStatus()]);
  }, {
    staleTime: 1000 * 60 * 5,
  });

  // ─── Shift / Check-in ───────────────────────────────────────────────────
  const fetchShiftStatus = async () => {
    if (!user?.id || !propertyId) return;
    try {
      const { data: rsData }: any = await supabase
        .from('resolver_stats')
        .select('is_checked_in')
        .eq('user_id', user.id)
        .eq('property_id', propertyId)
        .single();

      if (rsData) setIsCheckedIn(rsData.is_checked_in);

      // TODO: shift_logs does not exist in saas_one schema
      // const { data: shiftData }: any = await supabase
      //   .from('shift_logs')
      //   .select('id')
      //   .eq('user_id', user.id)
      //   .eq('property_id', propertyId)
      //   .eq('status', 'active')
      //   .order('check_in_at', { ascending: false })
      //   .limit(1)
      //   .maybeSingle();
      // if (shiftData) {
      //   setActiveShiftId(shiftData.id);
      //   setIsCheckedIn(true);
      // }
    } catch (error) {
      console.error('Error fetching shift status:', error);
    }
  };

  const toggleShift = async () => {
    if (!user?.id || !propertyId || isCheckingInOut) return;
    setIsCheckingInOut(true);
    const newStatus = !isCheckedIn;
    try {
      // TODO: shift_logs does not exist in saas_one schema
      // if (newStatus) {
      //   const { data: newShift, error: shiftErr }: any = await (supabase
      //     .from('shift_logs') as any)
      //     .insert({ user_id: user.id, property_id: propertyId, status: 'active', check_in_at: new Date().toISOString() })
      //     .select()
      //     .single();
      //   if (shiftErr) throw shiftErr;
      //   setActiveShiftId(newShift.id);
      // } else {
      //   if (activeShiftId) {
      //     const { error: shiftErr } = await (supabase.from('shift_logs') as any)
      //       .update({ status: 'completed', check_out_at: new Date().toISOString() })
      //       .eq('id', activeShiftId);
      //     if (shiftErr) throw shiftErr;
      //   }
      //   setActiveShiftId(null);
      // }

      const { error: rsErr } = await serverApi.query({
        table: 'resolver_stats',
        action: 'update',
        values: { is_checked_in: newStatus },
        filters: [{ op: 'eq', column: 'user_id', value: user.id }, { op: 'eq', column: 'property_id', value: propertyId }],
      });
      if (rsErr) throw rsErr;

      setIsCheckedIn(newStatus);
      Alert.alert('Shift Updated', `You are now ${newStatus ? 'ON DUTY' : 'OFF DUTY'}.`);
    } catch (error: any) {
      console.error('Shift toggle error:', error);
      Alert.alert('Error', error.message || 'Failed to update shift status');
    } finally {
      setIsCheckingInOut(false);
    }
  };

  const fetchUserRole = async () => {
    if (!user) return;
    const { data: member } = await (supabase
      .from('property_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('property_id', propertyId)
      .single() as any);
    if (member) {
      const role = member.role.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      setUserRole(role);
    }

    // Fetch skills from resolver_stats
    const { data: resolverStats } = await (supabase
      .from('resolver_stats')
      .select('skills, specialization')
      .eq('user_id', user.id)
      .eq('property_id', propertyId)
      .single() as any);

    if (resolverStats?.skills && Array.isArray(resolverStats.skills)) {
      setUserSkills(resolverStats.skills);
      if (resolverStats.skills.length > 0) {
        setSpecialization(resolverStats.skills.map((s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())).join(', '));
      }
    } else if (resolverStats?.specialization) {
      setSpecialization(resolverStats.specialization.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Stock stats
      const { data: stockItems } = await (supabase
        .from('stock_items')
        .select('id, quantity, min_threshold')
        .eq('property_id', propertyId) as any);

      if (stockItems) {
        const total = stockItems.length;
        const lowStock = stockItems.filter((s: any) => s.quantity > 0 && s.quantity <= (s.min_threshold ?? 10)).length;
        const outOfStock = stockItems.filter((s: any) => s.quantity === 0).length;
        setStockStats({ total, lowStock, outOfStock });
      }

      // TODO: sop_checklists does not exist in saas_one schema
      // Checklist stats
      // const { data: checklists } = await (supabase
      //   .from('sop_checklists')
      //   .select('id, status')
      //   .eq('property_id', propertyId) as any);
      // if (checklists) {
      //   const total = checklists.length;
      //   const completed = checklists.filter((c: any) => c.status === 'completed' || c.status === 'submitted').length;
      //   setChecklistStats({ total, pending: total - completed, completed });
      // }
    } catch (e) {
      console.error('Error fetching data:', e);
    }
    setIsLoading(false);
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  function getInitials(name: string): string {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  }

  const isManager = userRole.toLowerCase().includes('manager') || userRole.toLowerCase().includes('supervisor');
  const skillColor = '#8B5CF6'; // Purple for soft services

  // ─── Overview Tab ───────────────────────────────────────────────────────────
  const renderOverviewTab = () => (
    <LinearGradient colors={isDark ? ['#0F172A', '#1E293B'] : ['#F8FAFC', '#E2E8F0']} style={styles.tabContent}>
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.ssmHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.ssmHeaderTitle, { color: colors.textSecondary }]}>
              {(user?.user_metadata?.full_name || 'STAFF').toUpperCase()}
            </Text>
            <Text style={[styles.ssmHeaderSub, { color: colors.textPrimary }]}>DASHBOARD</Text>
            {specialization && (
              <View style={[styles.specBadgeSSM, { backgroundColor: isDark ? `${skillColor}20` : `${skillColor}15`, borderColor: `${skillColor}50` }]}>
                <Text style={[styles.specBadgeTextSSM, { color: skillColor }]}>{specialization}</Text>
              </View>
            )}
          </View>
          {/* Check-in / Check-out Toggle */}
          <TouchableOpacity
            style={[
              styles.shiftToggleSSM,
              {
                borderColor: isCheckedIn ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)',
                backgroundColor: isCheckedIn ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              }
            ]}
            onPress={toggleShift}
            disabled={isCheckingInOut}
          >
            {isCheckingInOut ? (
              <ActivityIndicator size="small" color={isCheckedIn ? '#10B981' : '#EF4444'} />
            ) : (
              <>
                <View style={[styles.shiftDot, { backgroundColor: isCheckedIn ? '#10B981' : '#EF4444' }]} />
                <Text style={[styles.shiftToggleText, { color: isCheckedIn ? '#10B981' : '#EF4444' }]}>
                  {isCheckedIn ? 'ON DUTY' : 'OFF DUTY'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Quick Access Cards */}
        <View style={styles.quickAccessGrid}>
          {isManager && (
            <TouchableOpacity style={[styles.quickCard, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)', borderColor: isDark ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.15)' }]} onPress={() => setActiveTab('stock')}>
              <View style={[styles.quickCardIconBox, { backgroundColor: 'rgba(59,130,246,0.2)' }]}>
                <Ionicons name="cube-outline" size={24} color="#3B82F6" />
              </View>
              <Text style={[styles.quickCardLabel, { color: colors.textPrimary }]}>Stock</Text>
              <Text style={[styles.quickCardSub, { color: colors.textSecondary }]}>Management</Text>
              <View style={[styles.quickCardStat, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                <Text style={styles.quickCardStatText}>{stockStats.total} items</Text>
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.quickCard, { backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)', borderColor: isDark ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.15)' }]} onPress={() => setActiveTab('checklist')}>
            <View style={[styles.quickCardIconBox, { backgroundColor: 'rgba(16,185,129,0.2)' }]}>
              <Ionicons name="checkbox-outline" size={24} color="#10B981" />
            </View>
            <Text style={[styles.quickCardLabel, { color: colors.textPrimary }]}>Checklists</Text>
            <Text style={[styles.quickCardSub, { color: colors.textSecondary }]}>{checklistStats.total} total</Text>
            <View style={[styles.quickCardStat, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
              <Text style={styles.quickCardStatText}>{checklistStats.completed} done</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Stock Alert Summary (Managers Only) */}
        {isManager && stockStats.total > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Stock Alerts</Text>
            <View style={styles.alertRow}>
              <View style={[styles.alertChip, { backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.1)', borderColor: isDark ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.2)' }]}>
                <Ionicons name="warning-outline" size={14} color="#F59E0B" />
                <Text style={[styles.alertChipText, { color: '#F59E0B' }]}>{stockStats.lowStock} Low Stock</Text>
              </View>
              <View style={[styles.alertChip, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)', borderColor: isDark ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.2)' }]}>
                <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
                <Text style={[styles.alertChipText, { color: '#EF4444' }]}>{stockStats.outOfStock} Out of Stock</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.viewAllBtn, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)' }]} onPress={() => setActiveTab('stock')}>
              <Text style={[styles.viewAllBtnText, { color: '#3B82F6' }]}>View Stock</Text>
              <Ionicons name="chevron-forward" size={16} color="#3B82F6" />
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
          <View style={styles.actionsRow}>
            {isManager && (
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)' }]} onPress={() => router.push('/property/' + propertyId + '/stock/scan' as any)}>
                <Ionicons name="qr-code-outline" size={20} color="#3B82F6" />
                <Text style={[styles.actionBtnText, { color: '#3B82F6' }]}>Scan</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)' }]} onPress={() => setActiveTab('checklist')}>
              <Ionicons name="clipboard-outline" size={20} color="#10B981" />
              <Text style={[styles.actionBtnText, { color: '#10B981' }]}>Checklists</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.08)' }]} onPress={() => router.push('/property/' + propertyId + '/checklist' as any)}>
              <Ionicons name="list-outline" size={20} color="#F59E0B" />
              <Text style={[styles.actionBtnText, { color: '#F59E0B' }]}>Checklists</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isLoading && (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );

  // ─── Stock Tab ─────────────────────────────────────────────────────────────
  const renderStockTab = () => (
    <View style={[styles.tabContent, { backgroundColor: colors.background }]}>
      <View style={[styles.stockTabHeader, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.stockTabBtn, activeTab === 'stock' && styles.stockTabBtnActive]} onPress={() => {}}>
          <Text style={[styles.stockTabBtnText, activeTab === 'stock' && styles.stockTabBtnTextActive, { color: activeTab === 'stock' ? colors.primary : colors.textSecondary }]}>Stock</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.stockTabBtn, false && styles.stockTabBtnActive]} onPress={() => router.push('/property/' + propertyId + '/stock/scan' as any)}>
          <Text style={[styles.stockTabBtnText, { color: colors.textSecondary }]}>Scan</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.stockEmbedArea}>
        <TouchableOpacity style={[styles.stockEmbedBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/property/' + propertyId + '/stock' as any)}>
          <Ionicons name="cube-outline" size={32} color={colors.primary} />
          <Text style={[styles.stockEmbedTitle, { color: colors.textPrimary }]}>Stock Management</Text>
          <Text style={[styles.stockEmbedSub, { color: colors.textSecondary }]}>Tap to open full stock management</Text>
          <View style={[styles.stockEmbedStatRow, { backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.06)' }]}>
            <Ionicons name="analytics-outline" size={14} color="#3B82F6" />
            <Text style={styles.stockEmbedStatText}>{stockStats.total} items</Text>
            {stockStats.lowStock > 0 && (
              <View style={[styles.stockEmbedAlert, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                <Text style={styles.stockEmbedAlertText}>{stockStats.lowStock} low</Text>
              </View>
            )}
            {stockStats.outOfStock > 0 && (
              <View style={[styles.stockEmbedAlert, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                <Text style={[styles.stockEmbedAlertText, { color: '#EF4444' }]}>{stockStats.outOfStock} out</Text>
              </View>
            )}
          </View>
          <View style={[styles.stockEmbedArrow, { backgroundColor: colors.primary }]}>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.stockEmbedBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/property/' + propertyId + '/stock/scan' as any)}>
          <Ionicons name="qr-code-outline" size={32} color={colors.primary} />
          <Text style={[styles.stockEmbedTitle, { color: colors.textPrimary }]}>QR Scanner</Text>
          <Text style={[styles.stockEmbedSub, { color: colors.textSecondary }]}>Scan items for stock movements</Text>
          <View style={[styles.stockEmbedArrow, { backgroundColor: colors.primary }]}>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ─── Checklist Tab ─────────────────────────────────────────────────────────
  const renderChecklistTab = () => (
    <View style={[styles.tabContent, { backgroundColor: colors.background }]}>
      <View style={styles.checklistEmbedArea}>
        <TouchableOpacity style={[styles.stockEmbedBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/property/' + propertyId + '/checklist' as any)}>
          <Ionicons name="checkbox-outline" size={32} color="#10B981" />
          <Text style={[styles.stockEmbedTitle, { color: colors.textPrimary }]}>Checklists</Text>
          <Text style={[styles.stockEmbedSub, { color: colors.textSecondary }]}>Manage daily checklists and standard operating procedures</Text>
          <View style={[styles.stockEmbedStatRow, { backgroundColor: isDark ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.06)' }]}>
            <Ionicons name="list-outline" size={14} color="#10B981" />
            <Text style={[styles.stockEmbedStatText, { color: '#10B981' }]}>{checklistStats.total} checklists</Text>
            <Text style={styles.stockEmbedStatSep}>·</Text>
            <Text style={styles.stockEmbedStatText}>{checklistStats.completed} completed</Text>
          </View>
          <View style={[styles.stockEmbedArrow, { backgroundColor: '#10B981' }]}>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ─── Profile Tab ───────────────────────────────────────────────────────────
  const renderProfileTab = () => (
    <ScrollView style={[styles.tabContent, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.profileHeader}>
          <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.profileAvatarText}>{user?.user_metadata?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}</Text>
          </View>
          <View style={[styles.profileBadge, { backgroundColor: isDark ? 'rgba(112,143,150,0.15)' : '#EFF6FF' }]}>
            <Text style={[styles.profileBadgeText, { color: colors.primary }]}>{userRole}</Text>
          </View>
          {specialization && (
            <View style={[styles.specBadgeSSM, { backgroundColor: isDark ? `${skillColor}20` : `${skillColor}15`, borderColor: `${skillColor}50`, marginTop: 6 }]}>
              <Text style={[styles.specBadgeTextSSM, { color: skillColor }]}>{specialization}</Text>
            </View>
          )}
        </View>
        <View style={styles.profileInfo}>
          <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.profileLabel, { color: colors.textTertiary }]}>Full Name</Text>
            <Text style={[styles.profileValue, { color: colors.textPrimary }]}>{user?.user_metadata?.full_name || 'Not Set'}</Text>
          </View>
          <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.profileLabel, { color: colors.textTertiary }]}>Email</Text>
            <Text style={[styles.profileValue, { color: colors.textPrimary }]}>{user?.email || 'Not Set'}</Text>
          </View>
          <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.profileLabel, { color: colors.textTertiary }]}>Role</Text>
            <Text style={[styles.profileValue, { color: colors.textPrimary }]}>{userRole}</Text>
          </View>
          <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.profileLabel, { color: colors.textTertiary }]}>Specialization</Text>
            <Text style={[styles.profileValue, { color: colors.textPrimary }]}>{specialization || 'Not Set'}</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity style={[styles.signOutButton, { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', borderColor: isDark ? 'rgba(239,68,68,0.2)' : '#FECACA' }]} onPress={() => setShowSignOutModal(true)}>
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <FloatingMenu
        title={isManager ? 'Soft Service Manager' : 'Staff Soft Service'}
        items={[
          { label: 'Overview', icon: 'grid', onPress: () => setActiveTab('overview') },
          ...(isManager ? [{ label: 'Stock', icon: 'cube', onPress: () => setActiveTab('stock') }] : []),
          { label: 'Checklists', icon: 'checkbox', onPress: () => setActiveTab('checklist') },
          { label: 'Settings', icon: 'settings', onPress: () => router.push('/property/' + propertyId + '/settings' as any) },
          { label: 'Profile', icon: 'person', onPress: () => setActiveTab('profile') },
        ]}
        footer={{ label: 'Sign Out', icon: 'log-out-outline', danger: true, onPress: () => setShowSignOutModal(true) }}
      />

      {/* Top Nav */}
      <View style={[styles.topNav, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 16) }]}>
        <Image source={require('../../assets/images/autopilot-logo-new.png')} style={{ height: 48, width: 200, resizeMode: 'stretch' }} />
        <View style={styles.headerRightGroup}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setShowScanner(true)}
          >
            <Ionicons name="qr-code-outline" size={22} color="#708F96" />
          </TouchableOpacity>
          <NotificationBell style={styles.bellButton} iconSize={24} iconColor={colors.textSecondary} />
        </View>
      </View>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {['overview', isManager ? 'stock' : null, 'checklist', 'profile'].filter(Boolean).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tabBarItem, (activeTab === tab || (tab === 'stock' && activeTab === 'stock')) && styles.tabBarItemActive, { borderBottomColor: colors.primary }]} onPress={() => setActiveTab(tab as SSMTab)}>
            <Text style={[styles.tabBarItemText, { color: (activeTab === tab || (tab === 'stock' && activeTab === 'stock')) ? colors.primary : colors.textSecondary }]}>
              {tab === 'overview' ? 'OVERVIEW' : tab === 'stock' ? 'STOCK' : tab?.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'stock' && renderStockTab()}
        {activeTab === 'checklist' && renderChecklistTab()}
        {activeTab === 'profile' && renderProfileTab()}
      </View>

      <AppBottomNav
        activeTab={activeTab === 'stock' ? 'stock' : (activeTab === 'checklist' ? 'overview' : activeTab) as TabKey}
        propertyId={propertyId}
        onLoggersPress={() => {}}
        onCreateRequestPress={() => {}}
        baseRoute="/soft-service-manager"
        showLoggers={false}
      />

      <SignOutModal visible={showSignOutModal} onClose={() => setShowSignOutModal(false)} onSignOut={signOut} />

      <StockScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        propertyId={propertyId}
        userId={user?.id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  bellButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

  // Tab Bar
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 8 },
  tabBarItem: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBarItemActive: {},
  tabBarItemText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  // Drawer
  drawerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  drawer: { position: 'absolute', top: 0, left: 0, bottom: 0, width: DRAWER_WIDTH, zIndex: 101, flexDirection: 'column', shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 12 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  drawerCloseBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  drawerBadge: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, marginTop: 8, marginBottom: 4 },
  drawerBadgeText: {  fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  drawerSectionLabel: {  fontSize: 9, fontWeight: '700', letterSpacing: 1.2, paddingHorizontal: 16, marginBottom: 6, marginTop: 12 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16, marginHorizontal: 8, borderRadius: 12, marginBottom: 2 },
  drawerItemLabel: {  fontSize: 15, letterSpacing: 0.1 },
  drawerBottom: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  drawerUserCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 10, marginBottom: 10, borderWidth: 1 },
  drawerAvatar: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  drawerAvatarText: {  fontSize: 14, color: '#708F96' },
  drawerUserName: {  fontSize: 13, fontWeight: '600' },
  drawerUserRole: {  fontSize: 11, marginTop: 1 },
  drawerSignOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  drawerSignOutText: {  fontSize: 14, fontWeight: '600', color: '#EF4444' },

  // Content
  tabContent: { flex: 1 },

  // Overview
  ssmHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, gap: 12 },
  shiftToggleSSM: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  shiftDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  shiftToggleText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  ssmHeaderTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  ssmHeaderSub: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  roleBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  specBadgeSSM: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start' },
  specBadgeTextSSM: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  quickAccessGrid: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 16 },
  quickCard: { flex: 1, borderRadius: 20, padding: 16, borderWidth: 1, alignItems: 'center' },
  quickCardIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickCardLabel: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  quickCardSub: { fontSize: 11, marginBottom: 8 },
  quickCardStat: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  quickCardStatText: { fontSize: 10, fontWeight: '700', color: '#3B82F6' },
  section: { paddingHorizontal: 16, paddingBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  alertRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  alertChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  alertChipText: { fontSize: 12, fontWeight: '700' },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  viewAllBtnText: { fontSize: 14, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12 },
  actionBtnText: { fontSize: 12, fontWeight: '700' },

  // Stock Tab
  stockTabHeader: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 16 },
  stockTabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  stockTabBtnActive: {},
  stockTabBtnText: { fontSize: 14, fontWeight: '700' },
  stockTabBtnTextActive: {},
  stockEmbedArea: { flex: 1, padding: 16 },
  stockEmbedBtn: { borderWidth: 1, borderRadius: 20, padding: 20, marginBottom: 12, borderStyle: 'dashed' },
  stockEmbedTitle: { fontSize: 18, fontWeight: '700', marginTop: 12, marginBottom: 4 },
  stockEmbedSub: { fontSize: 13, marginBottom: 12 },
  stockEmbedStatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  stockEmbedStatText: { fontSize: 12, fontWeight: '700', color: '#3B82F6' },
  stockEmbedStatSep: { color: '#94A3B8', fontSize: 12 },
  stockEmbedAlert: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  stockEmbedAlertText: { fontSize: 10, fontWeight: '700', color: '#F59E0B' },
  stockEmbedArrow: { position: 'absolute', top: 20, right: 20, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

  // Checklist Tab
  checklistEmbedArea: { flex: 1, padding: 16 },

  // Profile
  profileCard: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, margin: 20, overflow: 'hidden' },
  profileHeader: { alignItems: 'center', paddingTop: 24, paddingBottom: 16 },
  profileAvatar: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
  profileAvatarText: { fontSize: 28, fontWeight: '700', color: '#FFF' },
  profileBadge: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  profileBadgeText: { fontSize: 12, fontWeight: '700' },
  profileInfo: { paddingHorizontal: 20, paddingBottom: 20 },
  profileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  profileLabel: { fontSize: 13, fontWeight: '600' },
  profileValue: { fontSize: 13, fontWeight: '500', textAlign: 'right', flex: 1, marginLeft: 16 },
  signOutButton: { marginHorizontal: 20, marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },
});
