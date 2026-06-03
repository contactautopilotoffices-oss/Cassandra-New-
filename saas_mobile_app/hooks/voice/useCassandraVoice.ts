/**
 * useCassandraVoice — WebSocket voice hook for Cassandra AI
 *
 * Protocol (V2):
 *   1. Auth: POST /auth/session → cassandra_token (handled by cassandraAuthService)
 *   2. Connect: WSS /ws/audio/{orgId}
 *   3. Handshake: send { type: 'session_start', cassandra_token, room_id? } JSON frame
 *   4. Wait for { type: 'session_acknowledged' } BEFORE starting recording
 *   5. Recording: expo-av 16kHz PCM16 → base64 JSON { type: 'audio_chunk', data: base64_pcm16, timestamp_ms, seq }
 *   6. Receive binary MP3 frames → expo-av Sound playback
 *   7. JSON frames: pipeline_result, voice_response, segment, ticket_created
 *   8. Rate limiting: 429 → 5s wait → exponential backoff 1→2→4→8→15→30s
 *   9. Heartbeat: ping every 15s, reconnect if no pong within 3s
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { getValidToken } from '@/services/cassandra/cassandraAuthService';
import { getWebSocketUrl } from '@/services/cassandra/cassandraAuthService';
import { toast } from '@/lib/toast';

// ─── Types ──────────────────────────────────────────────────────────────────

export type CassandraVoiceState =
  | 'idle'
  | 'connecting'
  | 'authenticated'
  | 'recording'
  | 'processing'
  | 'speaking'
  | 'error';

export interface CassandraVoiceHandlers {
  onStateChange?: (state: CassandraVoiceState) => void;
  onTranscript?: (text: string, speakerId?: string) => void;
  onAudioPlaybackStart?: () => void;
  onAudioPlaybackEnd?: () => void;
  onTicketCreated?: (ticketId: string, description: string) => void;
  onError?: (error: string) => void;
}

interface AudioChunkFrame {
  type: 'audio_chunk';
  data: string;  // base64 PCM16
  timestamp_ms: number;
  seq: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_URL = 'https://www.back2basiics.com';
const BASE_URL = (process.env.EXPO_PUBLIC_VOICE_API_URL ?? process.env.EXPO_PUBLIC_CASSANDRA_API_URL ?? DEFAULT_URL).replace(/\/$/, '');
const WS_URL = BASE_URL.replace(/^http/, 'ws');

// ─── Platform-safe lazy module loaders ───────────────────────────────────────
// expo-av and expo-file-system are NOT supported on web.
// Using lazy requires so the module is never loaded on web.

function getAudioModule() {
  if (Platform.OS === 'web') return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-av') as typeof import('expo-av');
}

function getFileSystem() {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-file-system/legacy') as typeof import('expo-file-system');
  } catch {
    // Fallback for older versions
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-file-system') as typeof import('expo-file-system');
  }
}

/** 16kHz mono PCM16 — Cassandra contract (lazy, native only) */
function getRecordingOptions() {
  const av = getAudioModule();
  if (!av) return undefined;
  return {
    android: {
      extension: '.pcm',
      outputFormat: (av as any).AndroidOutputFormat?.DEFAULT ?? 0,
      audioEncoder: (av as any).AndroidAudioEncoder?.DEFAULT ?? 0,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 128000,
    },
    ios: {
      extension: '.pcm',
      audioQuality: (av as any).IOSAudioQuality?.MAX ?? 1,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 128000,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000,
    },
  };
}

const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 3000;
const RATE_LIMIT_BASE_MS = 1000;
const MAX_RATE_LIMIT_MS = 30000;
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30000;

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useCassandraVoice(
  orgId: string,
  handlers: CassandraVoiceHandlers
) {
  const { onStateChange, onTranscript, onAudioPlaybackStart, onAudioPlaybackEnd, onTicketCreated, onError } = handlers;

  const [state, setState] = useState<CassandraVoiceState>('idle');
  const [isConnected, setIsConnected] = useState(false);

  // WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateLimitRef = useRef(0); // current backoff ms
  const rateLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Audio refs (typed as any — Audio is only loaded on native via getAudio())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recordingRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const soundRef = useRef<any>(null);
  const chunkSeqRef = useRef(0);
  const isRecordingRef = useRef(false);
  const socketGenerationRef = useRef(0);
  const currentRoomIdRef = useRef<string | undefined>(undefined);
  const retryCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<(roomId?: string) => Promise<void>>(null as any);

  // ─── State setter ──────────────────────────────────────────────────────────

  const setVoiceState = useCallback((s: CassandraVoiceState) => {
    setState(s);
    onStateChange?.(s);
  }, [onStateChange]);

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  const cleanup = useCallback(async () => {
    // Stop reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Stop heartbeat
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
    if (rateLimitTimerRef.current) {
      clearTimeout(rateLimitTimerRef.current);
      rateLimitTimerRef.current = null;
    }

    // Stop recording
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch { /* ignore */ }
      recordingRef.current = null;
    }
    isRecordingRef.current = false;

    // Stop playback
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch { /* ignore */ }
      soundRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }

    setIsConnected(false);
    setVoiceState('idle');
  }, [setVoiceState]);

  // ─── Heartbeat ──────────────────────────────────────────────────────────────

  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
        // Expect pong within HEARTBEAT_TIMEOUT_MS
        heartbeatTimeoutRef.current = setTimeout(() => {
          console.warn('[CassandraVoice] Heartbeat timeout — will retry');
          if (wsRef.current) {
            try { wsRef.current.close(1001, 'Heartbeat timeout'); } catch { /* ignore */ }
          }
        }, HEARTBEAT_TIMEOUT_MS);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, [cleanup, setVoiceState, onError]);

  const handlePong = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  // ─── Audio Playback ────────────────────────────────────────────────────────

  const playAudioChunk = useCallback(async (mp3Base64: string) => {
    // Unload previous sound
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch { /* ignore */ }
      soundRef.current = null;
    }

    try {
      // Convert base64 MP3 to a URI for expo-av
      // On native, pass base64 directly; on web, use Blob + URL.createObjectURL
      let uri: string;
      if (Platform.OS === 'web') {
        const binaryString = atob(mp3Base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/mp3' });
        uri = URL.createObjectURL(blob);
      } else {
        uri = `data:audio/mp3;base64,${mp3Base64}`;
      }

      const av = getAudioModule();
      if (!av) return;
      const { Audio } = av;
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            onAudioPlaybackEnd?.();
            setVoiceState('idle');
          }
        },
        false
      );
      soundRef.current = sound;
      onAudioPlaybackStart?.();
      setVoiceState('speaking');
    } catch (err) {
      console.error('[CassandraVoice] Audio playback error:', err);
    }
  }, [onAudioPlaybackStart, onAudioPlaybackEnd, setVoiceState]);

  // ─── WebSocket Message Handler ────────────────────────────────────────────

  const handleMessage = useCallback(async (event: MessageEvent) => {
    // Binary frame → MP3 audio
    if (event.data instanceof ArrayBuffer) {
      const base64 = typeof btoa !== 'undefined'
        ? btoa(String.fromCharCode(...new Uint8Array(event.data)))
        : Buffer.from(event.data).toString('base64');
      await playAudioChunk(base64);
      return;
    }

    // JSON frame
    let msg: any;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    const { type } = msg;

    if (type === 'pong') {
      handlePong();
      return;
    }

    if (type === 'session_acknowledged') {
      // NOW we can start recording
      console.log('[CassandraVoice] Session acknowledged — starting recording');
      setVoiceState('authenticated');
      startHeartbeat();
      startRecording().catch((err) => {
        console.error('[CassandraVoice] Auto-start recording failed:', err);
        onError?.('Failed to start recording after session acknowledgement');
        setVoiceState('error');
      });
      return;
    }

    if (type === 'error') {
      const errMsg = msg.message ?? 'Session error';
      onError?.(errMsg);
      setVoiceState('error');
      return;
    }

    if (type === 'rate_limited') {
      // 429 from server — apply backoff
      const retryAfter = msg.retry_after_ms ?? 5000;
      const delay = Math.min(retryAfter, MAX_RATE_LIMIT_MS);
      toast.info('Slow down — adjusting…');
      rateLimitRef.current = Math.min(delay * 2, MAX_RATE_LIMIT_MS);
      return;
    }

    // Transcript segments
    if (type === 'segment') {
      onTranscript?.(msg.text ?? '', msg.speaker_id);
      return;
    }

    // Full response text
    if (type === 'pipeline_result' || type === 'voice_response') {
      onTranscript?.(msg.text ?? msg.response ?? '', undefined);
      return;
    }

    // Ticket created
    if (type === 'ticket_created') {
      onTicketCreated?.(msg.ticket_id ?? '', msg.description ?? '');
      return;
    }
  }, [handlePong, playAudioChunk, onTranscript, onError, onTicketCreated, setVoiceState, startHeartbeat]);

  // ─── Start Recording ────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    const av = getAudioModule();
    if (!av) {
      onError?.('Voice recording is not supported on web.');
      return;
    }
    const { Audio } = av;

    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        onError?.('Microphone permission denied.');
        setVoiceState('error');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(getRecordingOptions());
      recording.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording && isRecordingRef.current) {
          // Send chunk every ~500ms
        }
      });
      await recording.startAsync();
      recordingRef.current = recording;
      isRecordingRef.current = true;
      setVoiceState('recording');

      // Send audio chunks periodically using getStatusAsync polling
      const sendChunks = async () => {
        if (!isRecordingRef.current || !recordingRef.current) return;
        try {
          const status = await recordingRef.current.getStatusAsync();
          if (status.isRecording && status.durationMillis) {
            const uri = recordingRef.current.getURI();
            if (uri && wsRef.current?.readyState === WebSocket.OPEN) {
              const fs = getFileSystem();
              if (fs) {
                const base64 = await fs.readAsStringAsync(uri, {
                  encoding: 'base64',
                });
                const frame: AudioChunkFrame = {
                  type: 'audio_chunk',
                  data: base64,
                  timestamp_ms: Date.now(),
                  seq: chunkSeqRef.current++,
                };
                wsRef.current.send(JSON.stringify(frame));
              }
            }
          }
        } catch { /* ignore */ }

        if (isRecordingRef.current) {
          setTimeout(sendChunks, 500);
        }
      };
      sendChunks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start recording';
      onError?.(msg);
      setVoiceState('error');
    }
  }, [onError, setVoiceState]);

  // ─── Stop Recording ────────────────────────────────────────────────────────

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    isRecordingRef.current = false;

    try {
      await recordingRef.current.stopAndUnloadAsync();
      setVoiceState('processing');
    } catch { /* ignore */ }
    recordingRef.current = null;
  }, [setVoiceState]);

  // ─── Connect ────────────────────────────────────────────────────────────────

  const connect = useCallback(async (roomId?: string) => {
    await cleanup();
    currentRoomIdRef.current = roomId;
    retryCountRef.current = 0;

    setVoiceState('connecting');

    let token: string;
    try {
      token = await getValidToken();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      onError?.(msg);
      setVoiceState('error');
      return;
    }

    const url = `${WS_URL}/ws/audio/${encodeURIComponent(orgId)}`;
    const generation = ++socketGenerationRef.current;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    // Connection timeout — if nothing happens in 8s, bail out
    const connectionTimeout = setTimeout(() => {
      if (socketGenerationRef.current !== generation) return;
      if (ws.readyState !== WebSocket.OPEN) {
        onError?.('Connection timed out');
        setVoiceState('error');
        try { ws.close(); } catch { /* ignore */ }
      }
    }, 8000);

    ws.onopen = () => {
      if (socketGenerationRef.current !== generation) return;
      // Send session_start with token (V2 protocol — token in JSON frame, NOT URL param)
      ws.send(JSON.stringify({
        type: 'session_start',
        cassandra_token: token,
        ...(roomId && { room_id: roomId }),
      }));
    };

    ws.onmessage = (event: MessageEvent) => {
      if (socketGenerationRef.current !== generation) return;
      handleMessage(event);
    };

    ws.onerror = () => {
      if (socketGenerationRef.current !== generation) return;
      clearTimeout(connectionTimeout);
      onError?.('WebSocket connection failed');
      setVoiceState('error');
    };

    ws.onclose = () => {
      if (socketGenerationRef.current !== generation) return;
      clearTimeout(connectionTimeout);
      wsRef.current = null;
      setIsConnected(false);

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(RETRY_BASE_MS * Math.pow(2, retryCountRef.current), RETRY_MAX_MS);
        retryCountRef.current++;
        toast.info(`Reconnecting in ${delay / 1000}s… (attempt ${retryCountRef.current}/${MAX_RETRIES})`);
        setVoiceState('connecting');
        reconnectTimerRef.current = setTimeout(() => {
          connectRef.current(currentRoomIdRef.current);
        }, delay);
      } else {
        setVoiceState('error');
        onError?.('Connection lost. Max retries reached.');
      }
    };
  }, [orgId, cleanup, handleMessage, onError, setVoiceState]);

  // ─── Connect and start recording (single action) ────────────────────────────

  const startSession = useCallback(async (roomId?: string) => {
    if (state !== 'idle' && state !== 'error') return;
    retryCountRef.current = 0;
    await connect(roomId);
    // Recording will start after session_acknowledged is received
  }, [state, connect]);

  // ─── Keep connect ref current for retry callbacks ───────────────────────────

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // ─── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    isConnected,
    startSession,
    stopSession: stopRecording,
    endSession: cleanup,
  };
}
