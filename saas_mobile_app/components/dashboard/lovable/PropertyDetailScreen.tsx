import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/hooks/useAuth';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import SafeBlurView from '@/components/ui/SafeBlurView';
import SignOutModal from '@/components/ui/SignOutModal';
import CassandraSessionModal from '@/components/cassandra/CassandraSessionModal';
import MobileFooter from '@/components/shared/MobileFooter';
import {
  SPACING,
} from '@/constants/designSystem';
import {
  GlassTile,
  StatColumns,
  ComplianceGauge,
  ScheduleItem,
} from '../DashboardComponents';
import { Property } from './types';
import { fontDisplay, fontSans } from './constants';

interface PropertyDetailScreenProps {
  property: Property;
  onBack: () => void;
  onShowChat: () => void;
  onShowTileDetail: (detail: any) => void;
}

export default function PropertyDetailScreen({
  property,
  onBack,
}: PropertyDetailScreenProps) {
  const { user, signOut, membership } = useAuth();
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  const orgId = membership?.org_id ?? '';

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await new Promise(r => setTimeout(r, 1000));
    setIsRefreshing(false);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <WeatherBackground condition="clear-night" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />}
      >
        {/* ─── Header (matches Property Admin) ────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <TouchableOpacity style={styles.profileRow} activeOpacity={0.7}>
              <View style={styles.avatar}>
                {user?.avatar ? (
                  <Image source={{ uri: user.avatar }} style={styles.avatarImage} resizeMode="cover" />
                ) : (
                  <Text style={styles.avatarText}>
                    {user?.user_metadata?.full_name ? user.user_metadata.full_name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2) : 'SU'}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.greetingText} numberOfLines={1}>Hey, {user?.user_metadata?.full_name?.split(' ')[0] || 'Super'}</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>{property.name}</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconBtn}>
              <Ionicons name="add-circle-outline" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn}>
              <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
              <View style={styles.notificationBadge} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Hero ───────────────────────────────────────────────────────────── */}
        <View style={styles.headerHero}>
          <View style={styles.heroLeft}>
            <Text style={styles.welcomeText}>FACILITY OVERVIEW</Text>
            <Text style={styles.propertyName}>{property.name}</Text>
            <Text style={styles.propertyCode}>{property.code} · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
          </View>
          <View style={styles.heroRight}>
            <View style={styles.tempContainer}>
              <Image
                source={{ uri: 'https://pngimg.com/uploads/moon/moon_PNG52.png' }}
                style={styles.moonImage}
              />
              <Text style={styles.tempText}>22°</Text>
            </View>
            <View style={styles.weatherStatusRow}>
              <Text style={styles.weatherStatusText}>CLEAR NIGHT</Text>
              <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.4)" />
            </View>
          </View>
        </View>

        {/* ─── Dashboard Cards ─────────────────────────────────────────────────── */}
        <View style={styles.dashboardGrid}>
          <GlassTile label="Tickets" icon="ticket-outline" delay={100}>
            <StatColumns
              data={[
                { label: 'Open', value: property.openTickets, color: '#EF4444' },
                { label: 'Progress', value: Math.max(0, property.totalTickets - property.openTickets - property.resolvedTickets), color: '#F5A000' },
                { label: 'Resolved', value: property.resolvedTickets, color: '#1FC26E' },
              ]}
            />
          </GlassTile>

          <GlassTile label="Checklist" icon="checkbox-outline" delay={200}>
            <ComplianceGauge value={property.checklist.percent} total={100} />
          </GlassTile>

          <GlassTile label="PPM Schedule" icon="calendar-outline" delay={300}>
            <ScheduleItem date="17" month="Apr" title="VRF AHU" type="Preventive Maintenance" status="PENDING" />
          </GlassTile>
        </View>
      </ScrollView>

      {/* ─── Bottom Navigation ──────────────────────────────────────────────── */}
      <MobileFooter activeTab="dashboard" />

      <SignOutModal visible={showSignOut} onClose={() => setShowSignOut(false)} onSignOut={signOut} />
      <CassandraSessionModal visible={showChat} onClose={() => setShowChat(false)} orgId={orgId} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: { flex: 1 },

  // Header (matches Property Admin)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { flex: 1, paddingHorizontal: 12 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  avatarImage: { width: 36, height: 36, borderRadius: 18 },
  avatarText: { color: '#FFF', fontSize: 13, fontWeight: '700', },
  greetingText: { color: '#FFF', fontSize: 14, fontWeight: '700', },
  headerSubtitle: { color: 'rgba(255,255,255,0.40)', fontSize: 11,  marginTop: 1 },
  headerRight: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  headerIconBtn: { position: 'relative' },
  notificationBadge: { position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },

  // Hero
  headerHero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: SPACING.xl, marginTop: 8 },
  heroLeft: { flex: 1, paddingTop: 4 },
  welcomeText: {  fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5 },
  propertyName: {  fontSize: 42, fontWeight: '800', color: '#FFFFFF', marginTop: 0, letterSpacing: -1.2 },
  propertyCode: {  fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontWeight: '500' },
  heroRight: { alignItems: 'flex-end' },
  tempContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, position: 'relative' },
  tempText: {  fontSize: 64, fontWeight: '800', color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 10, zIndex: 10 },
  moonImage: { width: 120, height: 120, position: 'absolute', right: -20, top: -15, opacity: 0.8 },
  weatherStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8, marginRight: 30 },
  weatherStatusText: {  fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  dashboardGrid: { paddingVertical: 10, gap: 4 },
});
