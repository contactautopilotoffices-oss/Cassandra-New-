'use client';

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import SignOutModal from '../ui/SignOutModal';

interface GlobalNavigationDrawerProps {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
}

const fontSans = Platform.OS === 'ios' ? 'System' : 'sans-serif';
const fontDisplay = Platform.OS === 'web' ? 'Poppins' : 'System';

export default function GlobalNavigationDrawer({ visible, onClose, propertyId }: GlobalNavigationDrawerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [showSignOut, setShowSignOut] = useState(false);

  const navigateTo = (route: string) => {
    onClose();
    router.push(`/property/${propertyId}/${route}` as any);
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.container}>
          <View style={[styles.drawerPanel, { paddingTop: insets.top + 16 }]}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerLogoContainer}>
                <Image 
                  source={require('@/assets/images/autopilot-logo-new.png')} 
                  style={[styles.drawerLogo, { tintColor: '#FFFFFF' }]} 
                  resizeMode="contain" 
                />
              </View>
              <TouchableOpacity onPress={onClose} style={styles.drawerCloseBtn}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.drawerSectionLabel}>OPERATIONS</Text>
              {[
                { label: 'Dashboard', route: 'dashboard', icon: 'grid-outline' },
                { label: 'Tickets', route: 'tickets', icon: 'ticket-outline' },
                { label: 'User Directory', route: 'users', icon: 'people-outline' },
                { label: 'Visitors', route: 'visitors', icon: 'walk-outline' },
                { label: 'Meeting Rooms', route: 'rooms', icon: 'calendar-outline' },
              ].map((item) => (
                <TouchableOpacity key={item.route} style={styles.drawerItem} onPress={() => navigateTo(item.route)}>
                  <Ionicons name={item.icon as any} size={20} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.drawerItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}

              <Text style={[styles.drawerSectionLabel, { marginTop: 20 }]}>UTILITIES</Text>
              {[
                { label: 'Diesel Manager', route: 'diesel', icon: 'fuel-outline' },
                { label: 'Electricity', route: 'electricity', icon: 'flash-outline' },
                { label: 'Stock / Inventory', route: 'stock', icon: 'cube-outline' },
                { label: 'Checklists', route: 'checklist', icon: 'clipboard-outline' },
                { label: 'PPM', route: 'ppm', icon: 'calendar-clear-outline' },
              ].map((item) => (
                <TouchableOpacity key={item.route} style={styles.drawerItem} onPress={() => navigateTo(item.route)}>
                  <Ionicons name={item.icon as any} size={20} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.drawerItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}

              <Text style={[styles.drawerSectionLabel, { marginTop: 20 }]}>MANAGEMENT</Text>
              {[
                { label: 'Procurement', route: 'procurement', icon: 'cart-outline' },
                { label: 'Escalation', route: 'escalation', icon: 'git-branch-outline' },
                { label: 'Vendor Revenue', route: 'vendor', icon: 'restaurant-outline' },
                { label: 'Reports', route: 'reports', icon: 'document-text-outline' },
                { label: 'Settings', route: 'settings', icon: 'settings-outline' },
              ].map((item) => (
                <TouchableOpacity key={item.route} style={styles.drawerItem} onPress={() => navigateTo(item.route)}>
                  <Ionicons name={item.icon as any} size={20} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.drawerItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.drawerSignOut} onPress={() => { onClose(); setShowSignOut(true); }}>
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              <Text style={styles.drawerSignOutText}>Logout</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.drawerBackdrop} onPress={onClose} />
        </View>
      </Modal>

      <SignOutModal visible={showSignOut} onClose={() => setShowSignOut(false)} onSignOut={signOut} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row' },
  drawerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  drawerPanel: { width: 320, height: '100%', backgroundColor: '#111', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 24 },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, marginTop: 12 },
  drawerLogoContainer: { flex: 1, alignItems: 'flex-start' },
  drawerLogo: { width: 160, height: 42, resizeMode: 'contain' },
  drawerCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
  drawerItem: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12 },
  drawerItemLabel: {  fontSize: 15, fontWeight: '500', color: '#FFF' },
  drawerSectionLabel: {  fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginBottom: 10, paddingHorizontal: 8, marginTop: 6 },
  drawerSignOut: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', marginBottom: 40, paddingHorizontal: 8 },
  drawerSignOutText: { color: '#EF4444', fontWeight: '700', fontSize: 15 },
});
