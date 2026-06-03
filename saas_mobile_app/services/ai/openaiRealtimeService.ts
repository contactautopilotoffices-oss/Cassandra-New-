/**
 * OpenAI Realtime API Service
 *
 * Uses the REST voice pipeline on the backend (/api/voice) instead of
 * the OpenAI Realtime WebSocket API. This keeps the OpenAI API key
 * server-side, avoids CORS/auth issues, and uses the full voice agent
 * pipeline (transcription → intent → planner → tool execution → response).
 *
 * The audio is captured via Web Audio API (AudioWorklet), sent as
 * base64 to the REST endpoint, and played back via expo-speech.
 *
 * Docs: https://platform.openai.com/docs/guides/realtime
 */

import { createClient } from '@/utils/supabase/client';
import { WEB_API_BASE } from '@/utils/api/mobileApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type RealtimeConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'recording'
  | 'processing'
  | 'disconnected'
  | 'error';

export interface RealtimeMessage {
  type: string;
  [key: string]: unknown;
}

export interface RealtimeEventHandlers {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAudioPlaybackStart?: () => void;
  onAudioPlaybackEnd?: () => void;
  onError?: (error: string) => void;
  onStateChange?: (state: RealtimeConnectionState) => void;
}

export interface VoiceContext {
  userId: string;
  propertyId: string;
  organizationId: string;
  userRole: string;
  userName: string;
  propertyName: string;
}

// ---------------------------------------------------------------------------
// AudioWorklet processor — captures raw PCM s16le at 24kHz
// ---------------------------------------------------------------------------
const AUDIO_WORKLET_CODE = `
class MicCapture extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      if (channelData) {
        // Convert Float32 to Int16 PCM
        const pcm = new Int16Array(channelData.length);
        for (let i = 0; i < channelData.length; i++) {
          const s = Math.max(-1, Math.min(1, channelData[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        // Send raw PCM bytes to the main thread
        const buffer = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
        this.port.postMessage({ pcm: buffer }, [buffer]);
      }
    }
    return true;
  }
}
registerProcessor('mic-capture', MicCapture);
`;

// ---------------------------------------------------------------------------
// Session config
// ---------------------------------------------------------------------------
function buildSessionConfig(ctx: VoiceContext): object {
  return {
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      model: 'gpt-4o-realtime-preview-2025-06-03',
      instructions: buildSystemPrompt(ctx),
      voice: 'alloy',
      input_audio_transcription: {
        model: 'whisper-1',
      },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
      tools: buildTools(),
    },
  };
}

function buildSystemPrompt(ctx: VoiceContext): string {
  return `You are Autopilot, a friendly voice assistant for a property management mobile app.
You are speaking to ${ctx.userName}, a ${ctx.userRole} at ${ctx.propertyName}.

RULES:
- Be concise and friendly. Keep responses to 1-2 sentences max.
- When a ticket is created, say the ticket number aloud.
- Never make up data. If you don't know, say so.
- Give short, conversational answers.`;

}

function buildTools() {
  return [
    {
      type: 'function',
      name: 'create_ticket',
      description: 'Create a new maintenance ticket',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Brief title of the issue' },
          description: { type: 'string', description: 'Detailed description' },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium',
          },
        },
        required: ['title', 'description'],
      },
    },
    {
      type: 'function',
      name: 'get_ticket_status',
      description: 'Get ticket status',
      parameters: {
        type: 'object',
        properties: {
          ticket_id: { type: 'string' },
          status: { type: 'string' },
          limit: { type: 'number', default: 5 },
        },
      },
    },
    {
      type: 'function',
      name: 'get_property_info',
      description: 'Get property overview stats',
      parameters: { type: 'object', properties: {} },
    },
    {
      type: 'function',
      name: 'list_meeting_rooms',
      description: 'List available meeting rooms',
      parameters: {
        type: 'object',
        properties: {
          capacity: { type: 'number' },
        },
      },
    },
    {
      type: 'function',
      name: 'list_tickets',
      description: 'List maintenance tickets for this property',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['open', 'in_progress', 'assigned', 'resolved', 'closed'],
            description: 'Filter by status',
          },
          limit: { type: 'number', default: 10 },
        },
      },
    },
    {
      type: 'function',
      name: 'list_visitors',
      description: 'List recent visitor logs for this property',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 5 },
        },
      },
    },
    {
      type: 'function',
      name: 'book_meeting_room',
      description: 'Book a meeting room for a specific date and time',
      parameters: {
        type: 'object',
        properties: {
          room_id: { type: 'string', description: 'The meeting room ID' },
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          start_time: { type: 'string', description: 'Start time in HH:MM format' },
          end_time: { type: 'string', description: 'End time in HH:MM format' },
          purpose: { type: 'string', description: 'Purpose of the meeting' },
        },
        required: ['room_id', 'date', 'start_time', 'end_time'],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Main Service — REST-based voice pipeline
// ---------------------------------------------------------------------------
export class OpenAIRealtimeService {
  private ctx: VoiceContext;
  private handlers: Required<RealtimeEventHandlers>;
  private state: RealtimeConnectionState = 'idle';
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private streamRef: MediaStream | null = null;
  // Accumulate PCM chunks during recording
  private pcmChunks: Int16Array[] = [];

  constructor(ctx: VoiceContext, handlers: RealtimeEventHandlers) {
    this.ctx = ctx;
    this.handlers = {
      onTranscript: handlers.onTranscript ?? (() => {}),
      onAudioPlaybackStart: handlers.onAudioPlaybackStart ?? (() => {}),
      onAudioPlaybackEnd: handlers.onAudioPlaybackEnd ?? (() => {}),
      onError: handlers.onError ?? (() => {}),
      onStateChange: handlers.onStateChange ?? (() => {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Connect — REST pipeline is always "connected" once we have a session
  // ---------------------------------------------------------------------------
  async connect(): Promise<void> {
    this.setState('connecting');
    try {
      // Verify we have an active session by getting the Supabase token
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) {
        this.handlers.onError('Please sign in again — session expired.');
        this.setState('error');
        return;
      }
      console.log('[VoiceREST] Session active, ready to record');
      this.setState('connected');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to voice service.';
      this.handlers.onError(msg);
      this.setState('error');
    }
  }

  disconnect(): void {
    this.stopCapture();
    this.setState('idle');
  }

  // ---------------------------------------------------------------------------
  // Start recording — AudioWorklet PCM capture → accumulate in buffer
  // ---------------------------------------------------------------------------
  async startRecording(): Promise<void> {
    if (this.state === 'recording') return;

    try {
      // Get mic stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.streamRef = stream;

      // Create AudioContext at 24kHz
      this.audioContext = new AudioContext({ sampleRate: 24000 });

      // Register AudioWorklet
      const blob = new Blob([AUDIO_WORKLET_CODE], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      await this.audioContext.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      // Create worklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'mic-capture');

      // Reset and accumulate PCM chunks
      this.pcmChunks = [];

      // Receive PCM chunks and buffer them
      this.workletNode.port.onmessage = (event) => {
        const { pcm } = event.data as { pcm: ArrayBuffer };
        if (pcm.byteLength > 0) {
          this.pcmChunks.push(new Int16Array(pcm));
        }
      };

      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination); // hear yourself

      this.setState('recording');
      console.log('[VoiceREST] Recording started, chunks:', this.pcmChunks.length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to access microphone';
      this.handlers.onError(msg);
      this.setState('error');
    }
  }

  // ---------------------------------------------------------------------------
  // Stop recording — send accumulated audio to REST pipeline
  // ---------------------------------------------------------------------------
  async stopRecording(): Promise<void> {
    this.stopCapture();
    if (this.state !== 'recording') return;

    // Concatenate all PCM chunks
    const totalSamples = this.pcmChunks.reduce((sum, c) => sum + c.length, 0);
    if (totalSamples === 0) {
      this.setState('connected');
      return;
    }

    const fullPcm = new Int16Array(totalSamples);
    let offset = 0;
    for (const chunk of this.pcmChunks) {
      fullPcm.set(chunk, offset);
      offset += chunk.length;
    }
    this.pcmChunks = [];

    // Convert PCM to WAV base64
    const wavBase64 = this.pcmToWavBase64(fullPcm, 24000, 1);

    this.setState('processing');
    this.handlers.onAudioPlaybackStart();

    try {
      const response = await this.sendToVoicePipeline(wavBase64);

      // Handle the AI response
      if (response.transcript) {
        this.handlers.onTranscript(response.transcript, true);
      }
      if (response.response) {
        this.handlers.onTranscript(response.response, false);
      }
      if (response.error) {
        this.handlers.onError(response.error);
      }

      // Log steps for debugging
      if (response.steps) {
        console.log('[VoiceREST] Pipeline steps:', response.steps.map((s: { step: string; success: boolean }) => `${s.step}: ${s.success ? 'ok' : 'fail'}`).join(', '));
      }

      // Play back the AI response via MP3 audio from OpenAI TTS
      if (response.audio && typeof window !== 'undefined') {
        await this.playMp3(response.audio);
      } else if (response.response && typeof window !== 'undefined' && window.speechSynthesis) {
        // Fallback to Web Speech API if TTS audio is unavailable
        await this.speak(response.response);
      }

      this.handlers.onAudioPlaybackEnd();
      this.setState('connected');
    } catch (err) {
      this.handlers.onAudioPlaybackEnd();
      const msg = err instanceof Error ? err.message : 'Voice processing failed. Please try again.';
      this.handlers.onError(msg);
      this.setState('connected');
    }
  }

  private stopCapture(): void {
    if (this.workletNode) {
      try { this.workletNode.disconnect(); } catch {}
      this.workletNode = null;
    }
    if (this.streamRef) {
      this.streamRef.getTracks().forEach((t) => t.stop());
      this.streamRef = null;
    }
    if (this.audioContext) {
      try { this.audioContext.close(); } catch {}
      this.audioContext = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Send audio to the REST voice pipeline
  // ---------------------------------------------------------------------------
  private async sendToVoicePipeline(wavBase64: string): Promise<{
    transcript?: string;
    response?: string;
    intent?: { intent: string };
    steps?: Array<{ step: string; success: boolean; error?: string }>;
    status?: string;
    error?: string;
    audio?: string; // base64 MP3 from OpenAI TTS
  }> {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Session expired. Please sign in again.');
    }

    const url = `${WEB_API_BASE}/api/voice`;
    const body = {
      audio: wavBase64,
      format: 'audio/wav',
      context: {
        userId: this.ctx.userId,
        propertyId: this.ctx.propertyId,
        organizationId: this.ctx.organizationId,
        userRole: this.ctx.userRole,
        userName: this.ctx.userName,
        propertyName: this.ctx.propertyName,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let errMsg = `Voice service error (${res.status})`;
      try {
        const errData = await res.json();
        if (errData?.error) errMsg = errData.error;
      } catch {}
      throw new Error(errMsg);
    }

    const data = await res.json();
    return data as {
      transcript?: string;
      response?: string;
      intent?: { intent: string };
      steps?: Array<{ step: string; success: boolean; error?: string }>;
      status?: string;
      error?: string;
    };
  }

  // ---------------------------------------------------------------------------
  // Convert PCM Int16Array to WAV base64
  // ---------------------------------------------------------------------------
  private pcmToWavBase64(pcm: Int16Array, sampleRate: number, numChannels: number): string {
    const numSamples = pcm.length;
    const byteRate = sampleRate * numChannels * 2;
    const blockAlign = numChannels * 2;
    const dataSize = numSamples * 2;
    const fileSize = 44 + dataSize;

    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);

    // RIFF header
    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, fileSize - 8, true);
    writeStr(8, 'WAVE');
    // fmt chunk
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);        // chunk size
    view.setUint16(20, 1, true);         // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);        // bits per sample
    // data chunk
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    // PCM data
    const pcmOffset = 44;
    for (let i = 0; i < numSamples; i++) {
      view.setInt16(pcmOffset + i * 2, pcm[i], true);
    }

    // Convert to base64
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // ---------------------------------------------------------------------------
  // Play MP3 audio from OpenAI TTS
  // ---------------------------------------------------------------------------
  private async playMp3(base64: string): Promise<void> {
    if (typeof window === 'undefined') return;
    return new Promise((resolve) => {
      try {
        const audio = new Audio(`data:audio/mp3;base64,${base64}`);
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Text-to-speech via Web Speech API
  // ---------------------------------------------------------------------------
  private async speak(text: string): Promise<void> {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // Wait for voices to load (Chrome/Edge load them asynchronously)
    const loadVoices = (): Promise<SpeechSynthesisVoice[]> => {
      return new Promise((resolve) => {
        const voices = window.speechSynthesis!.getVoices();
        if (voices.length > 0) return resolve(voices);
        window.speechSynthesis!.addEventListener('voiceschanged', () => {
          resolve(window.speechSynthesis!.getVoices());
        }, { once: true });
        // Timeout fallback: resolve with whatever is available
        setTimeout(() => resolve(window.speechSynthesis!.getVoices()), 2000);
      });
    };

    const voices = await loadVoices();
    const preferred = voices.find(v =>
      (v.lang.startsWith('en-') && v.name.toLowerCase().includes('female')) ||
      (v.lang.startsWith('en-') && v.name.toLowerCase().includes('samantha')) ||
      (v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('daniel'))
    ) ?? voices.find(v => v.lang.startsWith('en-'));

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      if (preferred) utterance.voice = preferred;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      // Speak indefinitely — only resolves when speech ends or errors
      window.speechSynthesis!.speak(utterance);
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private setState(state: RealtimeConnectionState): void {
    this.state = state;
    this.handlers.onStateChange(state);
  }
}
