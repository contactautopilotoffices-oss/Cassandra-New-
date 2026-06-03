'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useColorScheme,
  Animated,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '@/constants/Colors';
import { useVoiceRecording } from '@/hooks/voice/useVoiceRecording';
import { ENROLLMENT_PHRASES } from '@/services/voiceEnrollment';
import { useOnboardingStore } from '@/store/onboardingStore';
import { supabase } from '@/utils/supabase/client';

const VOICE_API_URL = process.env.EXPO_PUBLIC_VOICE_API_URL ?? '';

// ─── Phrase state tracking ────────────────────────────────────────────────────
type PhraseStatus = 'pending' | 'recording' | 'recorded' | 'error';

interface PhraseState {
  status: PhraseStatus;
  uri?: string;
}

type ScreenState = 'loading' | 'enrolling' | 'submitting' | 'success' | 'error';

const MAX_PHRASE_DURATION_MS = 10_000; // auto-stop after 10s

export default function VoiceEnrollmentScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const router = useRouter();
  const { setVoiceEnrollmentDone, setVoiceEnrollmentSkipped } = useOnboardingStore();

  // ── Recording ──────────────────────────────────────────────────────────────
  const {
    isRecording,
    startRecording,
    stopRecording,
    recordingUri,
    permissionGranted,
    requestPermission,
  } = useVoiceRecording();

  // ── State ─────────────────────────────────────────────────────────────────
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [phraseStates, setPhraseStates] = useState<PhraseState[]>(
    ENROLLMENT_PHRASES.map(() => ({ status: 'pending' }))
  );
  const [currentPhrase, setCurrentPhrase] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [enrollError, setEnrollError] = useState('');

  // ── Animation refs ────────────────────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // ── Derived ───────────────────────────────────────────────────────────────
  const progressLabel = `Phrase ${currentPhrase + 1} of ${ENROLLMENT_PHRASES.length}`;
  const isSubmitting = screenState === 'submitting';
  const isRecordingThis = isRecording && phraseStates[currentPhrase]?.status === 'recording';

  // ── Permission ────────────────────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert(
          'Microphone Access',
          'Voice enrollment requires microphone access. Please enable it in Settings.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
        return;
      }
      setScreenState('enrolling');
    };
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pulse animation while recording ───────────────────────────────────────
  useEffect(() => {
    if (!isRecording) {
      pulseAnim.setValue(1);
      wave1.setValue(0);
      wave2.setValue(0);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );

    const waveAnim1 = Animated.loop(
      Animated.timing(wave1, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    );

    const waveAnim2 = Animated.loop(
      Animated.timing(wave2, {
        toValue: 1,
        duration: 1500,
        delay: 500,
        useNativeDriver: true,
      })
    );

    pulse.start();
    waveAnim1.start();
    waveAnim2.start();

    return () => {
      pulse.stop();
      waveAnim1.stop();
      waveAnim2.stop();
    };
  }, [isRecording, pulseAnim, wave1, wave2]);

  // ── Progress bar animation ─────────────────────────────────────────────────
  useEffect(() => {
    const recordedCount = phraseStates.filter(p => p.status === 'recorded').length;
    Animated.timing(progressAnim, {
      toValue: recordedCount,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [phraseStates, progressAnim]);

  // ── Auto-stop recording after max duration ─────────────────────────────────
  useEffect(() => {
    if (!isRecording) return;

    const timer = setTimeout(() => {
      handleStopRecording();
    }, MAX_PHRASE_DURATION_MS);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, currentPhrase]);

  // ── Recording handlers ────────────────────────────────────────────────────
  const handleStartRecording = async () => {
    setErrorMessage('');

    try {
      await startRecording();

      setPhraseStates(prev => {
        const updated = [...prev];
        updated[currentPhrase] = { status: 'recording' };
        return updated;
      });
    } catch {
      setErrorMessage('Could not access the microphone. Please check permissions.');
      setPhraseStates(prev => {
        const updated = [...prev];
        updated[currentPhrase] = { status: 'error' };
        return updated;
      });
    }
  };

  const handleStopRecording = async () => {
    if (!isRecording) return;

    const uri = await stopRecording();

    if (!uri) {
      setErrorMessage('Recording failed. Please try again.');
      setPhraseStates(prev => {
        const updated = [...prev];
        updated[currentPhrase] = { status: 'error' };
        return updated;
      });
      return;
    }

    // Mark phrase as recorded with its URI
    setPhraseStates(prev => {
      const updated = [...prev];
      updated[currentPhrase] = { status: 'recorded', uri };
      return updated;
    });

    // Short delay for visual feedback before moving to next
    setTimeout(() => {
      if (currentPhrase < ENROLLMENT_PHRASES.length - 1) {
        setCurrentPhrase(prev => prev + 1);
      } else {
        submitAllPhrases();
      }
    }, 600);
  };

  const handleMicPress = () => {
    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  };

  // ── Retry a specific phrase ────────────────────────────────────────────────
  const handleRetryPhrase = (index: number) => {
    setPhraseStates(prev => {
      const updated = [...prev];
      updated[index] = { status: 'pending' };
      return updated;
    });
    setCurrentPhrase(index);
    setErrorMessage('');
  };

  // ── Submit all recorded phrases (single combined call) ────────────────────
  const submitAllPhrases = async () => {
    const recorded = phraseStates.filter(p => p.status === 'recorded' && p.uri);
    if (recorded.length < ENROLLMENT_PHRASES.length) {
      setEnrollError('Not all phrases were recorded. Please try again.');
      setScreenState('error');
      return;
    }

    setScreenState('submitting');

    try {
      // 1. Concatenate all recorded audio into a single file
      const ext = (recorded[0].uri ?? '').split('.').pop()?.toLowerCase() ?? 'm4a';
      const tempDir = FileSystem.cacheDirectory ?? '';
      const combinedPath = `${tempDir}voice_enroll_combined.${ext}`;

      const chunks: string[] = [];
      for (const phrase of recorded) {
        if (!phrase.uri) continue;
        const data = await new File(phrase.uri).base64();
        chunks.push(data);
      }
      const combinedBase64 = chunks.join('');

      await FileSystem.writeAsStringAsync(combinedPath, combinedBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 2. Get session token
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token ?? '';

      if (!accessToken) {
        throw new Error('Authentication session expired. Please log in again.');
      }

      // 3. Determine MIME type
      const mimeType =
        ext === 'wav' ? 'audio/wav'
        : ext === 'webm' ? 'audio/webm'
        : ext === 'mp3' ? 'audio/mpeg'
        : 'audio/mp4';

      // 4. Submit combined audio
      if (!VOICE_API_URL) {
        throw new Error(
          'Voice enrollment API URL is not configured. Please set EXPO_PUBLIC_VOICE_API_URL in your environment.'
        );
      }

      const res = await fetch(`${VOICE_API_URL}/api/voice/enroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          audio: combinedBase64,
          format: mimeType,
          phraseCount: recorded.length,
        }),
      });

      const result = await res.json() as { embedding_id?: string; error?: string };

      if (!res.ok || result.error) {
        throw new Error(result.error ?? `Enrollment failed: ${res.status}`);
      }

      // 5. Cleanup temp file
      try { await FileSystem.deleteAsync(combinedPath, { idempotent: true }); } catch { /* ignore */ }

      setScreenState('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Enrollment failed. Please try again.';
      setEnrollError(msg);
      setScreenState('error');
    }
  };

  // ── Retry full enrollment ──────────────────────────────────────────────────
  const handleRetryEnrollment = () => {
    setPhraseStates(ENROLLMENT_PHRASES.map(() => ({ status: 'pending' })));
    setCurrentPhrase(0);
    setErrorMessage('');
    setEnrollError('');
    setScreenState('enrolling');
  };

  // ── Skip / go back ─────────────────────────────────────────────────────────
  const handleSkip = () => {
    setVoiceEnrollmentSkipped();
    router.back();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Success
  // ─────────────────────────────────────────────────────────────────────────
  if (screenState === 'success') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centerContent}>
          <Animated.View
            style={[
              styles.successRing,
              { backgroundColor: theme.success + '20' },
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <View style={[styles.successIcon, { backgroundColor: theme.success + '20' }]}>
              <Ionicons name="checkmark" size={48} color={theme.success} />
            </View>
          </Animated.View>
          <Text style={[styles.successTitle, { color: theme.text }]}>Voice Enrolled!</Text>
          <Text style={[styles.successSubtitle, { color: theme.textSecondary }]}>
            Your voice has been successfully registered.
          </Text>
          <Text style={[styles.successBody, { color: theme.textTertiary }]}>
            You can now use voice authentication for hands-free access.
          </Text>
          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: '#a855f7' }]}
            onPress={() => {
              setVoiceEnrollmentDone();
              router.back();
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Error
  // ─────────────────────────────────────────────────────────────────────────
  if (screenState === 'error') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centerContent}>
          <View style={[styles.errorRing, { backgroundColor: theme.error + '15' }]}>
            <Ionicons name="close" size={40} color={theme.error} />
          </View>
          <Text style={[styles.errorTitle, { color: theme.text }]}>Enrollment Failed</Text>
          <Text style={[styles.errorMsg, { color: theme.textSecondary }]}>{enrollError || errorMessage}</Text>
          <View style={styles.errorActions}>
            <TouchableOpacity
              style={[styles.retryButton, { borderColor: theme.border }]}
              onPress={handleRetryEnrollment}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={18} color={theme.text} />
              <Text style={[styles.retryButtonText, { color: theme.text }]}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkip}
              activeOpacity={0.7}
            >
              <Text style={[styles.skipButtonText, { color: theme.textTertiary }]}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Loading (permission check)
  // ─────────────────────────────────────────────────────────────────────────
  if (screenState === 'loading') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Submitting (sending to API)
  // ─────────────────────────────────────────────────────────────────────────
  if (screenState === 'submitting') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centerContent}>
          <View style={[styles.submitRing, { backgroundColor: '#a855f7' + '15' }]}>
            <ActivityIndicator size="large" color="#a855f7" />
          </View>
          <Text style={[styles.submitTitle, { color: theme.text }]}>Saving...</Text>
          <Text style={[styles.submitSubtitle, { color: theme.textSecondary }]}>
            Enrolling your voice with the server
          </Text>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Main enrollment UI
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Back */}
      <TouchableOpacity style={styles.backBtn} onPress={handleSkip} activeOpacity={0.7}>
        <Ionicons name="arrow-back" size={20} color={theme.text} />
        <Text style={[styles.backBtnText, { color: theme.text }]}>Back</Text>
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: '#a855f7' + '20' }]}>
          <Ionicons name="mic" size={28} color="#a855f7" />
        </View>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Voice Authentication</Text>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
          Set up voice authentication for hands-free access
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressTrack}>
          {ENROLLMENT_PHRASES.map((_, i) => {
            const recorded = phraseStates[i]?.status === 'recorded';
            const active = i === currentPhrase;
            return (
              <View
                key={i}
                style={[
                  styles.progressSeg,
                  recorded
                    ? { backgroundColor: theme.success }
                    : active
                    ? { backgroundColor: '#a855f7' }
                    : { backgroundColor: theme.border },
                ]}
              />
            );
          })}
        </View>
        <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>{progressLabel}</Text>
      </View>

      {/* Phrase cards */}
      <View style={styles.phrases}>
        {ENROLLMENT_PHRASES.map((phrase, i) => {
          const state = phraseStates[i];
          const isActive = i === currentPhrase;
          const isRecorded = state?.status === 'recorded';
          const isError = state?.status === 'error';

          let borderColor = theme.border;
          let bgColor = theme.surface;
          let textColor = theme.textSecondary;

          if (isRecorded) {
            borderColor = theme.success + '60';
            bgColor = theme.success + '08';
            textColor = theme.success;
          } else if (isActive) {
            borderColor = '#a855f7';
            bgColor = '#a855f7' + '08';
            textColor = theme.text;
          } else if (isError) {
            borderColor = theme.error + '60';
            bgColor = theme.error + '08';
          }

          return (
            <View key={i} style={[styles.phraseCard, { backgroundColor: bgColor, borderColor }]}>
              <View style={styles.phraseRow}>
                <View
                  style={[
                    styles.phraseNum,
                    {
                      backgroundColor: isRecorded
                        ? theme.success
                        : isActive
                        ? '#a855f7'
                        : theme.border,
                    },
                  ]}
                >
                  {isRecorded ? (
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  ) : (
                    <Text style={styles.phraseNumText}>{i + 1}</Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.phraseText,
                    { color: textColor },
                    isRecorded && styles.phraseTextRecorded,
                  ]}
                  numberOfLines={2}
                >
                  {phrase}
                </Text>
                {isRecorded && !isActive && (
                  <TouchableOpacity
                    onPress={() => handleRetryPhrase(i)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="refresh" size={16} color={theme.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Error */}
      {errorMessage ? (
        <View style={[styles.errorBanner, { backgroundColor: theme.errorBg, borderColor: theme.errorBorder }]}>
          <Ionicons name="alert-circle" size={16} color={theme.error} />
          <Text style={[styles.errorBannerText, { color: theme.error }]}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* Mic button */}
      <View style={styles.micSection}>
        <TouchableOpacity
          style={[
            styles.micButton,
            isRecording
              ? { backgroundColor: theme.error }
              : { backgroundColor: '#a855f7' },
          ]}
          onPress={handleMicPress}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          {/* Wave rings */}
          <Animated.View
            style={[
              styles.waveRing,
              { borderColor: isRecording ? theme.error + '40' : '#a855f7' + '30' },
              {
                transform: [
                  { scale: wave1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) },
                ],
                opacity: wave1.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
              },
            ]}
          />
          <Animated.View
            style={[
              styles.waveRing,
              { borderColor: isRecording ? theme.error + '30' : '#a855f7' + '20' },
              {
                transform: [
                  { scale: wave2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) },
                ],
                opacity: wave2.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              },
            ]}
          />

          <Animated.View
            style={[
              styles.micInner,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            {isRecording ? (
              <Ionicons name="mic" size={36} color="#fff" />
            ) : (
              <Ionicons name="mic-outline" size={36} color="#fff" />
            )}
          </Animated.View>
        </TouchableOpacity>

        {/* Status text */}
        <View style={styles.statusText}>
          {isRecording ? (
            <>
              <Text style={[styles.statusLabel, { color: theme.error }]}>Recording...</Text>
              <Text style={[styles.statusHint, { color: theme.textTertiary }]}>
                Speak clearly and naturally
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.statusLabel, { color: theme.text }]}>
                {phraseStates.every(p => p.status === 'pending')
                  ? 'Tap to start'
                  : 'Tap to record'}
              </Text>
              <Text style={[styles.statusHint, { color: theme.textTertiary }]}>
                Read phrase {currentPhrase + 1} aloud
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Skip */}
      <TouchableOpacity style={styles.bottomSkip} onPress={handleSkip} activeOpacity={0.7}>
        <Text style={[styles.bottomSkipText, { color: theme.textTertiary }]}>
          Skip for now — set up later in profile settings
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 24,
  },

  // ── Shared center ──────────────────────────────────────────────────────────
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // ── Back ───────────────────────────────────────────────────────────────────
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Urbanist-SemiBold',
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 28,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    fontFamily: 'Urbanist-Bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: 'Urbanist-Medium',
    textAlign: 'center',
  },

  // ── Progress ────────────────────────────────────────────────────────────────
  progressSection: {
    marginBottom: 20,
  },
  progressTrack: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  progressSeg: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 13,
    fontFamily: 'Urbanist-Medium',
    textAlign: 'center',
  },

  // ── Phrases ─────────────────────────────────────────────────────────────────
  phrases: {
    gap: 10,
    marginBottom: 16,
  },
  phraseCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
  },
  phraseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  phraseNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  phraseNumText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Urbanist-Bold',
  },
  phraseText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Urbanist-SemiBold',
    lineHeight: 22,
  },
  phraseTextRecorded: {
    textDecorationLine: 'line-through',
  },

  // ── Error banner ─────────────────────────────────────────────────────────────
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Urbanist-SemiBold',
  },

  // ── Mic section ─────────────────────────────────────────────────────────────
  micSection: {
    alignItems: 'center',
    marginTop: 8,
  },
  micButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
  },
  micInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusText: {
    alignItems: 'center',
    marginTop: 16,
  },
  statusLabel: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Urbanist-Bold',
    marginBottom: 4,
  },
  statusHint: {
    fontSize: 13,
    fontFamily: 'Urbanist-Regular',
  },

  // ── Bottom skip ──────────────────────────────────────────────────────────────
  bottomSkip: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 'auto',
  },
  bottomSkipText: {
    fontSize: 13,
    fontFamily: 'Urbanist-Regular',
    textDecorationLine: 'underline',
  },

  // ── Success ─────────────────────────────────────────────────────────────────
  successRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '800',
    fontFamily: 'Urbanist-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 16,
    fontFamily: 'Urbanist-Medium',
    marginBottom: 8,
    textAlign: 'center',
  },
  successBody: {
    fontSize: 14,
    fontFamily: 'Urbanist-Regular',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 32,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Urbanist-Bold',
  },

  // ── Error screen ─────────────────────────────────────────────────────────────
  errorRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'Urbanist-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMsg: {
    fontSize: 14,
    fontFamily: 'Urbanist-Medium',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
    maxWidth: 300,
  },
  errorActions: {
    alignItems: 'center',
    gap: 12,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Urbanist-Bold',
  },
  skipButton: {
    padding: 8,
  },
  skipButtonText: {
    fontSize: 14,
    fontFamily: 'Urbanist-Regular',
    textDecorationLine: 'underline',
  },

  // ── Submitting ───────────────────────────────────────────────────────────────
  submitRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  submitTitle: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'Urbanist-Bold',
    marginBottom: 8,
  },
  submitSubtitle: {
    fontSize: 14,
    fontFamily: 'Urbanist-Medium',
  },
});
