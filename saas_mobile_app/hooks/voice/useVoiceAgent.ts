'use client';
import { useCallback, useEffect, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import { useVoiceAgentStore } from '@/store/voiceAgentStore';
import { useVoiceRecording } from './useVoiceRecording';
import { OpenAIRealtimeService, VoiceContext, RealtimeConnectionState } from '@/services/ai/openaiRealtimeService';
import { OpenAINativeRealtimeService, NativeRealtimeState } from '@/services/ai/openaiNativeRealtimeService';

// Unified service interface — both web and native services share the same method surface
type VoiceService = {
  connect: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  disconnect: () => void;
};

export function useVoiceAgent(config: VoiceContext) {
  const store = useVoiceAgentStore();
  const serviceRef = useRef<VoiceService | null>(null);
  const isFirstTranscriptRef = useRef(true);

  // Recording hook — only used on native (called unconditionally so hooks are always at top level)
  const { startRecording: startNativeRecording, stopRecording: stopNativeRecording } = useVoiceRecording();

  // ---------------------------------------------------------------------------
  // Initialize service — web uses WebSocket Realtime, native uses REST proxy
  // ---------------------------------------------------------------------------
  const initService = useCallback(() => {
    if (serviceRef.current) return; // already initialized

    if (Platform.OS === 'web') {
      // Web: OpenAI Realtime API over WebSocket
      const service = new OpenAIRealtimeService(config, {
        onTranscript: (text, isFinal) => {
          if (text) {
            if (isFirstTranscriptRef.current) {
              store.setTranscript(text);
              store.addToHistory({ role: 'user', content: text });
              isFirstTranscriptRef.current = false;
            } else {
              store.setAiResponse(text);
              store.addToHistory({ role: 'assistant', content: text });
            }
          }
        },
        onAudioPlaybackStart: () => {
          store.setSpeaking(true);
        },
        onAudioPlaybackEnd: () => {
          store.setSpeaking(false);
          store.setProcessing(false);
          store.clearSession();
          isFirstTranscriptRef.current = true;
        },
        onError: (errorMsg) => {
          console.error('[useVoiceAgent] Realtime error:', errorMsg);
          store.setError(errorMsg);
          store.setProcessing(false);
          store.setListening(false);
          store.setSpeaking(false);
          store.setAgentState('ERROR');
        },
        onStateChange: (state: RealtimeConnectionState) => {
          console.log('[useVoiceAgent] Web state:', state);
          store.setSessionActive(state === 'connected' || state === 'recording');
          if (state === 'recording') store.setAgentState('LISTENING');
          if (state === 'connected') store.setAgentState('THINKING');
          if (state === 'error') store.setAgentState('ERROR');
          if (state === 'idle') store.setAgentState('IDLE');
          if (state === 'error' || state === 'idle') {
            store.setListening(false);
            store.setProcessing(false);
          }
        },
      });
      serviceRef.current = service;
    } else {
      // Native: REST proxy pipeline → expo-speech
      const service = new OpenAINativeRealtimeService(config, {
        onTranscript: (text, isFinal) => {
          if (text) {
            if (isFirstTranscriptRef.current) {
              store.setTranscript(text);
              store.addToHistory({ role: 'user', content: text });
              isFirstTranscriptRef.current = false;
            } else {
              store.setAiResponse(text);
              store.addToHistory({ role: 'assistant', content: text });
            }
          }
        },
        onAudioPlaybackStart: () => {
          store.setSpeaking(true);
          store.setProcessing(true);
        },
        onAudioPlaybackEnd: () => {
          store.setSpeaking(false);
          store.setProcessing(false);
          store.clearSession();
          isFirstTranscriptRef.current = true;
        },
        onError: (errorMsg) => {
          console.error('[useVoiceAgent] Native error:', errorMsg);
          store.setError(errorMsg);
          store.setProcessing(false);
          store.setListening(false);
          store.setSpeaking(false);
          store.setAgentState('ERROR');
          Alert.alert('Voice Assistant', errorMsg);
        },
        onThinking: () => {
          store.setAgentState('THINKING');
        },
        onSpeaking: () => {
          store.setAgentState('SPEAKING');
        },
        onStateChange: (state: NativeRealtimeState) => {
          console.log('[useVoiceAgent] Native state:', state);
          store.setSessionActive(state === 'recording');
          if (state === 'recording') store.setAgentState('LISTENING');
          if (state === 'processing') store.setAgentState('THINKING');
          if (state === 'speaking') store.setAgentState('SPEAKING');
          if (state === 'idle') store.setAgentState('IDLE');
          if (state === 'error') store.setAgentState('ERROR');
          if (state === 'idle' || state === 'error') {
            store.setListening(false);
            store.setProcessing(false);
          }
        },
      });
      serviceRef.current = service;
    }
  }, [config, store]);

  // ---------------------------------------------------------------------------
  // Connect — call once when user first taps the orb
  // ---------------------------------------------------------------------------
  const startSession = useCallback(async () => {
    initService();

    const service = serviceRef.current;
    if (!service) return;

    try {
      store.setError(null);
      store.setSessionActive(true);
      await service.connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start session';
      store.setError(msg);
    }
  }, [initService, store]);

  // ---------------------------------------------------------------------------
  // Toggle recording — platform-aware
  // ---------------------------------------------------------------------------
  const toggleSession = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) {
      await startSession();
      return;
    }

    try {
      const currentState = store.isListening;

      if (currentState) {
        // Stop recording
        if (Platform.OS === 'web') {
          await service.stopRecording();
          store.setListening(false);
          store.setProcessing(true);
        } else {
          // Native: stop expo-av recording and pass URI to service
          store.setListening(false);
          store.setProcessing(true);
          const uri = await stopNativeRecording();
          if (uri && service instanceof OpenAINativeRealtimeService) {
            await service.setRecordingUri(uri);
          } else if (!uri) {
            store.setProcessing(false);
            store.setError('Recording failed. Please try again.');
          }
        }
      } else {
        // Start recording
        if (Platform.OS !== 'web') {
          await startNativeRecording();
        }
        await service.startRecording();
        store.setListening(true);
        store.setError(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recording failed';
      store.setError(msg);
      store.setListening(false);
    }
  }, [startSession, store, startNativeRecording, stopNativeRecording]);

  // ---------------------------------------------------------------------------
  // End session
  // ---------------------------------------------------------------------------
  const endSession = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.disconnect();
      serviceRef.current = null;
    }
    store.reset();
  }, [store]);

  // ---------------------------------------------------------------------------
  // Cleanup on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        serviceRef.current.disconnect();
        serviceRef.current = null;
      }
    };
  }, []);

  return {
    isListening: store.isListening,
    isProcessing: store.isProcessing,
    isSpeaking: store.isSpeaking,
    sessionActive: store.sessionActive,
    transcript: store.transcript,
    aiResponse: store.aiResponse,
    error: store.error,
    startSession,
    toggleSession,
    endSession,
  };
}
