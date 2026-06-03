import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomSheetModal, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  getCompaniesWithCreditsApi,
  updateMeetingRoomCreditsApi,
} from '@/services/meetingRoomService';
import {
  fetchUsersList,
  manageCompanyMemberApi,
} from '@/utils/api/mobileApi';
import { createClient } from '@/utils/supabase/client';
import {
  ChevronLeft,
  Building2,
  Users,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Save,
  CheckCircle2,
  Plus,
  Trash2,
} from 'lucide-react-native';

export default function AdminCreditsScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Editing state
  const [editHours, setEditHours] = useState<Record<string, string>>({});
  const [editRemainingHours, setEditRemainingHours] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Users state
  const addMemberSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['60%', '90%'], []);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const res = await getCompaniesWithCreditsApi(propertyId);
      if (res.companies) {
        setCompanies(res.companies);
        
        // Initialize edit states
        const initHours: Record<string, string> = {};
        const initRemaining: Record<string, string> = {};
        res.companies.forEach((comp: any) => {
          if (comp.credits && comp.credits.length > 0) {
            initHours[comp.id] = String(comp.credits[0].monthly_hours || 0);
            initRemaining[comp.id] = String(comp.credits[0].remaining_hours || 0);
          } else {
            initHours[comp.id] = '0';
            initRemaining[comp.id] = '0';
          }
        });
        setEditHours(initHours);
        setEditRemainingHours(initRemaining);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load companies.');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  const { refetch } = useDashboardFetch(queryKeys.property.roomsAdminCredits(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5,
  });

  const handleSave = async (companyId: string) => {
    setSavingId(companyId);
    try {
      const monthly = parseFloat(editHours[companyId] || '0');
      const remaining = parseFloat(editRemainingHours[companyId] || '0');

      if (isNaN(monthly) || isNaN(remaining)) {
        throw new Error('Invalid hours format');
      }

      const res = await updateMeetingRoomCreditsApi({
        propertyId,
        companyId,
        monthlyHours: monthly,
        remainingHours: remaining,
      });

      if (res.error) {
        throw new Error(res.error);
      }

      Alert.alert('Success', 'Credits updated successfully');
      fetchData(); // Refresh to get latest DB state
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save credits.');
    } finally {
      setSavingId(null);
    }
  };

  const loadUsers = async () => {
    if (usersList.length > 0) return;
    setIsUsersLoading(true);
    try {
      const res = await fetchUsersList(undefined, propertyId);
      if (!res.users) {
        setUsersList([]);
        return;
      }

      // 1. Find all user_ids already assigned to ANY company in this property
      const supabase = createClient();
      const { data: companies } = await supabase
        .from('companies')
        .select('id')
        .eq('property_id', propertyId);
      const companyIds = (companies || []).map((c: any) => c.id);

      let assignedUserIds = new Set<string>();
      if (companyIds.length > 0) {
        const { data: members } = await supabase
          .from('company_members')
          .select('user_id')
          .in('company_id', companyIds);
        assignedUserIds = new Set((members || []).map((m: any) => m.user_id));
      }

      // 2. Filter: client/tenant roles only AND not already in a company
      const CLIENT_ROLES = new Set([
        'tenant',
        'vendor',
        'food_vendor',
        'maintenance_vendor',
        'super_tenant',
      ]);

      const eligibleUsers = res.users.filter((u: any) => {
        const role = (u.propertyRole || '').toLowerCase();
        const isClientRole = CLIENT_ROLES.has(role);
        const isNotAssigned = !assignedUserIds.has(u.id);
        return isClientRole && isNotAssigned;
      });

      setUsersList(eligibleUsers);
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsUsersLoading(false);
    }
  };

  const handleManageMember = async (companyId: string, userId: string, action: 'add' | 'remove') => {
    try {
      const res = await manageCompanyMemberApi(companyId, userId, action);
      if (res.error) throw new Error(res.error);
      if (action === 'add') addMemberSheetRef.current?.dismiss();
      fetchData(); // Refresh to get latest DB state
      Alert.alert('Success', action === 'add' ? 'Member added successfully' : 'Member removed successfully');
    } catch (e: any) {
      Alert.alert('Error', e.message || `Failed to ${action} member.`);
    }
  };

  const renderCompany = ({ item }: { item: any }) => {
    const isExpanded = expandedId === item.id;
    const credit = item.credits && item.credits.length > 0 ? item.credits[0] : null;
    const members = item.members || [];
    const isSaving = savingId === item.id;

    return (
      <View style={styles.companyCard}>
        <SafeBlurView intensity={40} tint="dark" style={styles.cardInner}>
          <LinearGradient
            colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
            style={StyleSheet.absoluteFillObject}
          />
          
          <TouchableOpacity 
            style={styles.cardHeader} 
            activeOpacity={0.7}
            onPress={() => setExpandedId(isExpanded ? null : item.id)}
          >
            {item.logo_url ? (
              <Image source={{ uri: item.logo_url }} style={styles.companyLogo} />
            ) : (
              <View style={styles.companyLogoPlaceholder}>
                <Building2 size={24} color="#708F96" />
              </View>
            )}
            
            <View style={styles.companyInfo}>
              <Text style={styles.companyName}>{item.name}</Text>
              <Text style={styles.memberCount}>{members.length} Members</Text>
            </View>

            <View style={styles.expandIcon}>
              {isExpanded ? <ChevronUp size={20} color="#94A3B8" /> : <ChevronDown size={20} color="#94A3B8" />}
            </View>
          </TouchableOpacity>

          {isExpanded && (
            <View style={styles.expandedContent}>
              <View style={styles.divider} />
              
              <Text style={styles.sectionTitle}>Assign Company Credits</Text>
              <View style={styles.creditForm}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Monthly Quota (Hours)</Text>
                  <TextInput
                    style={styles.input}
                    value={editHours[item.id]}
                    onChangeText={(v) => setEditHours(prev => ({ ...prev, [item.id]: v }))}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Remaining (Hours)</Text>
                  <TextInput
                    style={styles.input}
                    value={editRemainingHours[item.id]}
                    onChangeText={(v) => setEditRemainingHours(prev => ({ ...prev, [item.id]: v }))}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                  />
                </View>
              </View>

              <TouchableOpacity 
                style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]} 
                onPress={() => handleSave(item.id)}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Save size={16} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>Save Credits</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.divider} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Aligned Tenants</Text>
                <TouchableOpacity 
                  onPress={() => { 
                    setSelectedCompanyId(item.id); 
                    loadUsers(); 
                    addMemberSheetRef.current?.present(); 
                  }}
                >
                  <Text style={{ color: '#708F96', fontFamily: 'Urbanist-Bold', fontSize: 14 }}>+ Add Client</Text>
                </TouchableOpacity>
              </View>
              
              {members.length === 0 ? (
                <Text style={styles.noMembersText}>No members assigned to this company.</Text>
              ) : (
                <View style={styles.membersList}>
                  {members.map((m: any, idx: number) => (
                    <View key={m.user?.id || idx} style={styles.memberItem}>
                      {m.user?.user_photo_url ? (
                        <Image source={{ uri: m.user.user_photo_url }} style={styles.memberAvatar} />
                      ) : (
                        <View style={styles.memberAvatarPlaceholder}>
                          <Users size={14} color="#94A3B8" />
                        </View>
                      )}
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>{m.user?.full_name || 'Unknown'}</Text>
                        <Text style={styles.memberEmail}>{m.user?.email || 'No email'}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleManageMember(item.id, m.user?.id, 'remove')} style={{ padding: 4 }}>
                        <Trash2 size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

            </View>
          )}
        </SafeBlurView>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient
        colors={theme === 'dark' ? ['#0F1521', '#121824', '#090d16'] : ['#F5F0E8', '#EAE0D5', '#DFD3C3']}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeBlurView intensity={80} tint="dark" style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Company Credits</Text>
          <Text style={styles.headerSubtitle}>Manage meeting room limits</Text>
        </View>
        <TouchableOpacity 
          style={styles.backBtn}
          onPress={() => router.push(`/property/${propertyId}/rooms/add-company`)}
        >
          <Plus size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </SafeBlurView>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#708F96" />
          <Text style={styles.loadingText}>Loading companies...</Text>
        </View>
      ) : (
        <FlatList
          data={companies}
          keyExtractor={(item) => item.id}
          renderItem={renderCompany}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Building2 size={48} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyTitle}>No Companies Found</Text>
              <Text style={styles.emptySubtitle}>There are no companies registered in this property.</Text>
            </View>
          }
        />
      )}

      <BottomSheetModal
        ref={addMemberSheetRef}
        index={0}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: '#1E293B' }}
        handleIndicatorStyle={{ backgroundColor: '#94A3B8' }}
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Select User to Add</Text>
          {isUsersLoading ? (
            <ActivityIndicator size="large" color="#708F96" style={{ marginTop: 40 }} />
          ) : (
            <BottomSheetFlatList
              data={usersList}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.sheetUserItem}
                  onPress={() => {
                    if (selectedCompanyId) {
                      handleManageMember(selectedCompanyId, item.id, 'add');
                    }
                  }}
                >
                  {item.user_photo_url ? (
                    <Image source={{ uri: item.user_photo_url }} style={styles.sheetUserAvatar} />
                  ) : (
                    <View style={styles.sheetUserAvatarPlaceholder}>
                      <Users size={16} color="#94A3B8" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetUserName}>{item.full_name}</Text>
                    <Text style={styles.sheetUserEmail}>{item.email}</Text>
                  </View>
                  <Plus size={20} color="#708F96" />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </BottomSheetModal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Poppins-Bold', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#94A3B8' },
  loadingState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94A3B8', marginTop: 12, fontFamily: 'Urbanist-Medium' },
  listContent: { padding: 16 },
  companyCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardInner: { padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  companyLogo: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#FFF' },
  companyLogoPlaceholder: { width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  companyInfo: { flex: 1 },
  companyName: { fontSize: 16, fontFamily: 'Poppins-Bold', color: '#FFF' },
  memberCount: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#94A3B8', marginTop: 2 },
  expandIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  expandedContent: { marginTop: 16 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 16 },
  sectionTitle: { fontSize: 14, fontFamily: 'Poppins-SemiBold', color: '#FFF', marginBottom: 12 },
  creditForm: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 11, fontFamily: 'Urbanist-Bold', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 6 },
  input: { backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 16 },
  saveBtn: { backgroundColor: '#708F96', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10 },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 14 },
  noMembersText: { fontSize: 13, color: '#94A3B8', fontFamily: 'Urbanist-Medium', fontStyle: 'italic' },
  membersList: { gap: 12 },
  memberItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 12 },
  memberAvatar: { width: 36, height: 36, borderRadius: 18 },
  memberAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontFamily: 'Urbanist-Bold', color: '#FFF' },
  memberEmail: { fontSize: 12, fontFamily: 'Urbanist-Medium', color: '#94A3B8' },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontFamily: 'Poppins-SemiBold', color: '#FFF', marginTop: 16 },
  emptySubtitle: { fontSize: 13, fontFamily: 'Urbanist-Medium', color: '#94A3B8', textAlign: 'center', marginTop: 8 },
  sheetContent: { flex: 1, padding: 16 },
  sheetTitle: { fontSize: 18, fontFamily: 'Poppins-Bold', color: '#FFF', marginBottom: 16 },
  sheetUserItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', gap: 12 },
  sheetUserAvatar: { width: 40, height: 40, borderRadius: 20 },
  sheetUserAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  sheetUserName: { fontSize: 16, fontFamily: 'Urbanist-Bold', color: '#FFF' },
  sheetUserEmail: { fontSize: 13, fontFamily: 'Urbanist-Medium', color: '#94A3B8' },
});
