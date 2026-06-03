import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SafeBlurView from '@/components/ui/SafeBlurView';
import SidekickFace from '@/components/dashboard/SidekickFace';
import { useAuth } from '@/hooks/useAuth';
import CassandraSessionModal from '@/components/cassandra/CassandraSessionModal';

interface MobileFooterProps {
  activeTab?: 'dashboard' | 'tickets' | 'stock' | 'more';
  onMorePress?: () => void;
}

export default function MobileFooter({ activeTab: propActiveTab, onMorePress }: MobileFooterProps) {
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { membership } = useAuth();
  const [showCassandraChat, setShowCassandraChat] = useState(false);

  const orgId = membership?.org_id ?? '211e1330-ad83-446d-941f-dcea48396798';

  console.log('[MobileFooter] render. activeTab:', propActiveTab, 'showCassandraChat:', showCassandraChat, 'orgId:', orgId);

  const activeTab = propActiveTab || (pathname.includes('/tickets') ? 'tickets' : pathname.includes('/dashboard') ? 'dashboard' : 'dashboard');

  const navTo = (route: string) => {
    if (propertyId) {
      router.push(`/property/${propertyId}/${route}` as any);
    }
  };

  return (
    <View style={styles.container}>
      <SafeBlurView intensity={90} style={[styles.blur, { paddingBottom: Math.max(insets.bottom, 8) }]} tint="dark">
        <TouchableOpacity 
          style={styles.navItem} 
          onPress={() => router.push(`/property/${propertyId}` as any)}
        >
          <Ionicons 
            name={activeTab === 'dashboard' ? 'grid' : 'grid-outline'} 
            size={22} 
            color={activeTab === 'dashboard' ? '#FFF' : 'rgba(255,255,255,0.4)'} 
          />
          <Text style={[styles.navLabel, activeTab === 'dashboard' && styles.navLabelActive]}>Dashboard</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.navItem} 
          onPress={() => router.push(`/property/${propertyId}/tickets` as any)}
        >
          <Ionicons 
            name={activeTab === 'tickets' ? 'ticket' : 'ticket-outline'} 
            size={22} 
            color={activeTab === 'tickets' ? '#FFF' : 'rgba(255,255,255,0.4)'} 
          />
          <Text style={[styles.navLabel, activeTab === 'tickets' && styles.navLabelActive]}>Tickets</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.navItemCenter} 
          onPress={() => {
            console.log('[MobileFooter] Orb tapped! Setting showCassandraChat to true...');
            setShowCassandraChat(true);
          }}
        >
          <View style={styles.orbWrapper}>
             <SidekickFace 
               size={48} 
               state="idle" 
               compact 
               onClick={() => {
                 console.log('[MobileFooter] SidekickFace clicked directly! Setting showCassandraChat to true...');
                 setShowCassandraChat(true);
               }}
             />
          </View>
          <Text style={[styles.navLabel, { marginTop: 4 }]}>AI Assistant</Text>
        </TouchableOpacity>

        <View style={styles.navItem}>
          <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
            <TouchableOpacity 
              onPress={() => router.push(`/property/${propertyId}/stock` as any)}
              style={{ alignItems: 'center', paddingHorizontal: 12 }}
            >
              <Ionicons 
                name={activeTab === 'stock' ? 'business' : 'business-outline'} 
                size={22} 
                color={activeTab === 'stock' ? '#FFF' : 'rgba(255,255,255,0.4)'} 
              />
              <Text style={[styles.navLabel, activeTab === 'stock' && styles.navLabelActive]}>Stock</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{ position: 'absolute', right: -4, top: -8, backgroundColor: 'rgba(59,130,246,0.25)', padding: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(59,130,246,0.4)' }}
              onPress={() => router.push(`/property/${propertyId}/stock/scan` as any)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="scan" size={12} color="#60A5FA" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => {
            if (onMorePress) {
              onMorePress();
            }
          }}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.4)" />
          <Text style={styles.navLabel}>More</Text>
        </TouchableOpacity>
      </SafeBlurView>

      <CassandraSessionModal
        visible={showCassandraChat}
        onClose={() => setShowCassandraChat(false)}
        orgId={orgId}
        propertyId={membership?.properties?.[0]?.id}
        initialMode="text"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  blur: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingTop: 14,
    paddingBottom: 8,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.12)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 4,
  },
  navItemCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1.2,
    gap: 0,
    marginTop: -22,
  },
  navLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  navLabelActive: {
    color: '#FFF',
  },
  orbWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    // Glow effect
    shadowColor: '#3B82F6',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
});
