/**
 * OpenAI Native Realtime Service — mobile voice input.
 *
 * All AI calls are routed through the server-side /api/voice proxy.
 * No API keys are stored or used on the client.
 *
 * Pipeline: expo-av recording → send audio to backend → Whisper → full pipeline → TTS → expo-speech
 */

import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';
import { supabase } from '@/utils/supabase/client';
import { VoiceContext } from './openaiService';
import { VoicePipelineResult } from './pipeline/voicePipeline';
import { HistoryEntry } from './pipeline/types';

const VOICE_API_BASE = process.env.EXPO_PUBLIC_VOICE_API_URL ?? '';

export type NativeRealtimeState =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'speaking'
  | 'error';

export interface NativeRealtimeEventHandlers {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAudioPlaybackStart?: () => void;
  onAudioPlaybackEnd?: () => void;
  onError?: (error: string) => void;
  onStateChange?: (state: NativeRealtimeState) => void;
  onThinking?: () => void;
  onSpeaking?: () => void;
}

export class OpenAINativeRealtimeService {
  private ctx: VoiceContext;
  private handlers: Required<NativeRealtimeEventHandlers>;
  private state: NativeRealtimeState = 'idle';
  private conversationHistory: HistoryEntry[] = [];
  private readonly maxHistory = 20;
  private sessionId: string;

  constructor(ctx: VoiceContext, handlers: NativeRealtimeEventHandlers) {
    this.ctx = ctx;
    this.sessionId = ctx.sessionId ?? crypto.randomUUID();
    this.handlers = {
      onTranscript: handlers.onTranscript ?? (() => {}),
      onAudioPlaybackStart: handlers.onAudioPlaybackStart ?? (() => {}),
      onAudioPlaybackEnd: handlers.onAudioPlaybackEnd ?? (() => {}),
      onError: handlers.onError ?? (() => {}),
      onStateChange: handlers.onStateChange ?? (() => {}),
      onThinking: handlers.onThinking ?? (() => {}),
      onSpeaking: handlers.onSpeaking ?? (() => {}),
    };
  }

  private setState(state: NativeRealtimeState) {
    this.state = state;
    this.handlers.onStateChange(state);
  }

  async connect(): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        this.handlers.onError('Not authenticated. Please log in again.');
        this.setState('error');
        return;
      }
      this.setState('idle');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize voice';
      this.handlers.onError(msg);
      this.setState('error');
    }
  }

  async startRecording(): Promise<void> {
    this.setState('recording');
  }

  async stopRecording(): Promise<void> {
    this.setState('idle');
  }

  async setRecordingUri(uri: string): Promise<void> {
    await this.processAudio(uri);
  }

  async processAudio(uri: string): Promise<void> {
    this.setState('processing');
    this.handlers.onThinking();

    try {
      // Send audio directly to backend — Whisper runs server-side with the API key
      const audioBase64 = await FileSystem.readAsStringAsync(uri, { encoding: (FileSystem as any).EncodingType.Base64 });
      const result = await this.callBackend(audioBase64, uri);

      const transcript = result.transcript ?? '';
      if (!transcript.trim()) {
        this.handlers.onError('Could not understand audio. Please try again.');
        this.setState('idle');
        return;
      }

      // Add user message to history
      this.conversationHistory.push({ role: 'user', content: transcript });
      this.trimHistory();

      // Notify UI
      this.handlers.onTranscript(transcript, true);

      if (!result.response?.trim()) {
        this.setState('idle');
        return;
      }

      // Add assistant response to history
      this.conversationHistory.push({ role: 'assistant', content: result.response });
      this.trimHistory();

      // Speak the response
      this.setState('speaking');
      this.handlers.onSpeaking();
      this.handlers.onAudioPlaybackStart();

      try {
        await Speech.speak(result.response, {
          language: 'en-US',
          pitch: 1.0,
          rate: 1.0,
          onDone: () => {
            this.handlers.onAudioPlaybackEnd();
            this.setState('idle');
          },
          onError: (e) => {
            this.handlers.onError(e ? String(e) : 'Speech failed');
            this.handlers.onAudioPlaybackEnd();
            this.setState('idle');
          },
        });
      } catch {
        this.handlers.onAudioPlaybackEnd();
        this.setState('idle');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Processing failed';
      this.handlers.onError(msg);
      this.setState('error');
    }
  }

  /**
   * Send audio to the backend proxy. The backend handles Whisper + the full
   * voice pipeline with server-side API keys.
   */
  private async callBackend(
    audioBase64: string,
    uri: string
  ): Promise<{ transcript?: string; response?: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? '';

    const ext = uri.split('.').pop()?.toLowerCase() ?? 'm4a';
    const mimeType = ext === 'wav' ? 'audio/wav'
      : ext === 'mp3' ? 'audio/mpeg'
      : ext === 'webm' ? 'audio/webm'
      : 'audio/mp4';

    if (!VOICE_API_BASE) {
      this.handlers.onError('Voice API URL not configured. Please contact support.');
      return {};
    }

    const res = await fetch(`${VOICE_API_BASE}/api/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        audio: audioBase64,
        format: mimeType,
        context: this.ctx,
        history: this.conversationHistory,
        sessionId: this.sessionId,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error ?? `Voice API error: ${res.status}`);
    }

    const data = await res.json() as { transcript?: string; response?: string };
    return data;
  }

  disconnect(): void {
    Speech.stop();
    this.conversationHistory = [];
    this.sessionId = crypto.randomUUID();
    this.setState('idle');
  }

  private trimHistory() {
    if (this.conversationHistory.length > this.maxHistory) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistory);
    }
  }
}
