/**
 * Cassandra Home Screen — Orb-centric AI companion
 *
 * Perplexity-inspired design:
 *   • Deep radial gradient background (midnight blue → slate purple)
 *   • Center-orb with state-based glow
 *   • Top bar: connection pill + menu
 *   • Bottom dock: Dashboard, Chat, Team, Files quick actions
 *   • Full-screen modals for each feature
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/stores/appStore';
import { useCassandraStore } from '@/stores/cassandraStore';
import { useAuth } from '@/hooks/useAuth';
import { healthCheck, API_URL } from '@/lib/cassandra';
import { Colors, Gradients, Typography, Spacing, OrbState } from '@/constants/cassandra-theme';
import SidekickFace, { type FaceState } from '@/components/dashboard/SidekickFace';
import CassandraSessionModal from '@/components/cassandra/CassandraSessionModal';
import { toast } from '@/lib/toast';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Connection Pill ───────────────────────────────────────────────────────
const ConnectionPill = () => {
  const { isConnected } = useAppStore();
  return (
    <View style={[styles.pill, isConnected && styles.pillConnected]}>
      <View style={[styles.dot, { backgroundColor: isConnected ? Colors.success : Colors.error }]} />
      <Text style={styles.pillText}>{isConnected ? 'Cassandra online' : 'Offline'}</Text>
    </View>
  );
};

// ─── Hint Text ─────────────────────────────────────────────────────────────
const OrbHint = () => {
  const { voiceState, transcript } = useCassandraStore();
  const joinedTranscript = transcript.join(' ');
  if (joinedTranscript) {
    return (
      <View style={styles.hintBox}>
        <Text style={styles.transcript} numberOfLines={3}>
          {joinedTranscript}
        </Text>
      </View>
    );
  }
  const hints: Record<string, string> = {
    idle: 'Tap the orb to talk to Cassandra',
    connecting: 'Connecting…',
    authenticated: 'Ready — tap to speak',
    recording: 'Listening… speak now',
    processing: 'Cassandra is thinking…',
    speaking: 'Cassandra is speaking…',
    error: 'Something went wrong. Tap to retry.',
  };
  return (
    <View style={styles.hintBox}>
      <Text style={styles.hint}>{hints[voiceState] ?? hints.idle}</Text>
    </View>
  );
};

// ─── Main Screen ───────────────────────────────────────────────────────────
export default function CassandraHomeScreen() {
  const insets = useSafeAreaInsets();
  const { propertyId: routePropertyId } = useLocalSearchParams<{ propertyId: string }>();
  const { membership } = useAuth();
  const { orbState, setOrbState, setIsConnected, setActiveModal, setLastTickets } = useAppStore();
  const { voiceState } = useCassandraStore();
  const [orbScale] = useState(new Animated.Value(1));
  const [sessionOpen, setSessionOpen] = useState(false);
  const [isLoadingDock, setIsLoadingDock] = useState(false);

  const orgId = membership?.org_id ?? '';
  // Fallback to first allowed property if no route param (user opened chat without selecting a property)
  const propertyId = routePropertyId || membership?.properties?.[0]?.id;

  // Health check with retry — polls every 5s until server is reachable
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const check = async () => {
      try {
        const ok = await healthCheck();
        if (!cancelled) {
          setIsConnected(ok);
          if (ok && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      } catch {
        if (!cancelled) setIsConnected(false);
      }
    };

    // Immediate first check
    check();
    // Keep polling every 5s until we get a positive response
    intervalId = setInterval(check, 5000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // ─── Dock button handlers ────────────────────────────────────────────────
  const handleDashboardPress = async () => {
    if (!orgId) return;
    setIsLoadingDock(true);
    setOrbState('processing');
    try {
      // TODO: Re-add dashboard endpoint post-MVP
      const data: any = { recent_tickets: [] };
      setLastTickets(data?.recent_tickets ?? []);
      setActiveModal('dashboard');
    } catch (err) {
      toast.error('Could not load dashboard.');
    } finally {
      setIsLoadingDock(false);
      setOrbState('idle');
    }
  };

  const handleTeamPress = () => {
    toast.info('Team features coming soon');
  };

  const handleFilesPress = () => {
    toast.info('Files coming soon');
  };

  const handleChatPress = () => {
    setSessionOpen(true);
  };

  // Orb breathing animation (idle)
  useEffect(() => {
    if (voiceState !== 'idle') return;
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(orbScale, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(orbScale, { toValue: 1.0, duration: 1500, useNativeDriver: true }),
      ])
    );
    breathe.start();
    return () => breathe.stop();
  }, [voiceState]);

  // Orb press — open the Cassandra session modal
  const handleOrbPress = () => {
    setSessionOpen(true);
  };

  return (
    <View style={styles.container}>
      {/* Radial gradient background */}
      <LinearGradient
        colors={Gradients.radialBg}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle ambient glow behind orb */}
      <View
        style={[
          styles.ambientGlow,
          {
            backgroundColor:
              voiceState === 'recording' || voiceState === 'connecting' || voiceState === 'authenticated'
                ? Colors.cyanGlow
                : voiceState === 'error'
                  ? 'rgba(239,68,68,0.15)'
                  : 'rgba(139,92,246,0.12)',
          },
        ]}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.md }]}>
        <ConnectionPill />
        <TouchableOpacity
          onPress={() => setActiveModal('dashboard')}
          activeOpacity={0.7}
          style={styles.menuBtn}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
      </View>

      {/* Orb section + chat card — flex column filling middle */}
      <View style={styles.orbSection}>
        {/* SidekickFace + suggested prompts */}
        <View style={styles.orbContainer}>
          <TouchableOpacity
            onPress={handleOrbPress}
            activeOpacity={0.9}
            style={styles.orbTouch}
          >
            <Animated.View style={{ transform: [{ scale: orbScale }] }}>
              <SidekickFace
                size={96}
                state={
                  voiceState === 'processing'
                    ? 'thinking'
                    : voiceState === 'error'
                      ? 'alert'
                      : voiceState === 'recording' || voiceState === 'connecting' || voiceState === 'authenticated'
                        ? 'listening'
                        : voiceState
                }
              />
            </Animated.View>
          </TouchableOpacity>

          <OrbHint />

          {/* Suggested prompt chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.promptChips}
          >
            {[
              'Show critical tickets',
              'Energy spike today?',
              'Daily summary',
              'Property health',
              'Open checklists',
            ].map((prompt, i) => (
              <TouchableOpacity
                key={i}
                style={styles.promptChip}
                onPress={() => setSessionOpen(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="sparkles" size={11} color="rgba(167,139,250,0.9)" />
                <Text style={styles.promptChipText}>{prompt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>


      </View>

      {/* Bottom dock */}
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, Spacing.lg) }]}>
        <TouchableOpacity style={styles.dockItem} onPress={handleDashboardPress} activeOpacity={0.7} disabled={isLoadingDock}>
          <View style={styles.dockIconBox}>
            {isLoadingDock ? <ActivityIndicator size="small" color={Colors.textPrimary} /> : <Text style={styles.dockIcon}>📊</Text>}
          </View>
          <Text style={styles.dockLabel}>Dashboard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dockItem} onPress={handleChatPress} activeOpacity={0.7}>
          <View style={styles.dockIconBox}>
            <Text style={styles.dockIcon}>💬</Text>
          </View>
          <Text style={styles.dockLabel}>Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dockItem} onPress={handleTeamPress} activeOpacity={0.7} disabled={isLoadingDock}>
          <View style={styles.dockIconBox}>
            <Text style={styles.dockIcon}>👥</Text>
          </View>
          <Text style={styles.dockLabel}>Team</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dockItem} onPress={handleFilesPress} activeOpacity={0.7}>
          <View style={styles.dockIconBox}>
            <Text style={styles.dockIcon}>📁</Text>
          </View>
          <Text style={styles.dockLabel}>Files</Text>
        </TouchableOpacity>
      </View>

      {/* Debug info */}
      <Text style={styles.debug}>API: {API_URL}</Text>

      {/* Cassandra Session Modal */}
      <CassandraSessionModal
        visible={sessionOpen}
        onClose={() => setSessionOpen(false)}
        orgId={orgId}
        propertyId={propertyId}
        initialMode="voice"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F6',
  },
  orbSection: {
    flex: 1,
  },
  ambientGlow: {
    position: 'absolute',
    top: SCREEN_H * 0.25,
    left: SCREEN_W * 0.5 - 150,
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.5,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  pillConnected: {
    borderColor: 'rgba(16,185,129,0.3)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  menuIcon: {
    fontSize: 18,
    color: Colors.textPrimary,
  },
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 24,
  },
  orbTouch: {
    padding: 12,
  },
  hintBox: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    minHeight: 40,
    alignItems: 'center',
  },
  hint: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  transcript: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  promptChips: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  promptChipText: {
    ...Typography.caption,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  chatCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  dock: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
    backdropFilter: 'blur(12px)',
  },
  dockItem: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
  },
  dockIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  dockIcon: {
    fontSize: 22,
  },
  dockLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  debug: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    textAlign: 'center',
    ...Typography.caption,
    color: 'rgba(255,255,255,0.15)',
  },
});
