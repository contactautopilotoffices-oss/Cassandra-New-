import React from 'react';
import { StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { Ionicons } from '@expo/vector-icons';
import { EdgeInsets } from 'react-native-safe-area-context';
import SidekickFace, { type FaceState } from '@/components/dashboard/SidekickFace';
import { useCassandraStore } from '@/stores/cassandraStore';
import type { CassandraVoiceState } from '@/hooks/voice/useCassandraVoice';

export type NavActiveState = 'properties' | 'console' | 'analytics' | 'detail';

interface BottomNavProps {
  active: NavActiveState;
  onProperties: () => void;
  onConsole: () => void;
  onAnalytics: () => void;
  onChat: () => void;
  insets: EdgeInsets;
}

export default function BottomNav({
  active,
  onProperties,
  onConsole,
  onAnalytics,
  onChat,
  insets,
}: BottomNavProps) {
  const isPropsActive = active === 'properties' || active === 'detail';

  // Read live voice state from the shared Cassandra store
  const voiceState = useCassandraStore((s) => s.voiceState);

  // Map CassandraVoiceState → FaceState for the orb
  const faceState: FaceState = (() => {
    if (voiceState === 'recording' || voiceState === 'processing' || voiceState === 'connecting') {
      return 'listening';
    }
    if (voiceState === 'speaking') {
      return 'speaking';
    }
    if (voiceState === 'error') {
      return 'alert';
    }
    return 'idle';
  })();

  return (
    <SafeBlurView
      intensity={40}
      tint="dark"
      style={[
        styles.bottomNav,
        { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 16 },
      ]}
    >
      <TouchableOpacity 
        style={[styles.navItem, isPropsActive && styles.navItemActive]} 
        onPress={onProperties}
      >
        <Ionicons
          name={isPropsActive ? 'grid' : 'grid-outline'}
          size={22}
          color={isPropsActive ? '#FFF' : 'rgba(255,255,255,0.40)'}
        />
        <Text style={[styles.navText, isPropsActive && styles.navTextActive]}>
          Properties
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.navItem, active === 'console' && styles.navItemActive]} 
        onPress={onConsole}
      >
        <Ionicons
          name={active === 'console' ? 'settings' : 'settings-outline'}
          size={22}
          color={active === 'console' ? '#FFF' : 'rgba(255,255,255,0.40)'}
        />
        <Text style={[styles.navText, active === 'console' && styles.navTextActive]}>
          Console
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.navItem} onPress={onChat}>
        <View style={styles.orbNavContainer}>
          <SidekickFace size={44} state={faceState} compact onClick={onChat} />
        </View>
        <Text style={styles.navText}>Cassandra</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.navItem, active === 'analytics' && styles.navItemActive]} 
        onPress={onAnalytics}
      >
        <Ionicons
          name={active === 'analytics' ? 'bar-chart' : 'bar-chart-outline'}
          size={22}
          color={active === 'analytics' ? '#FFF' : 'rgba(255,255,255,0.40)'}
        />
        <Text style={[styles.navText, active === 'analytics' && styles.navTextActive]}>
          Analytics
        </Text>
      </TouchableOpacity>

    </SafeBlurView>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 4,
    zIndex: 20,
  },
  navItem: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    width: 44, 
    height: 44, 
    borderRadius: 22 
  },
  navItemActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  navText: {
    display: 'none',
  },
  navTextActive: { 
    color: '#FFFFFF' 
  },
  orbNavContainer: { 
    width: 44, 
    height: 44, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginHorizontal: 2 
  },
});
