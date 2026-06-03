'use client';
import { File } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { supabase } from '@/utils/supabase/client';
import { VoiceContext } from '@/services/ai/openaiService';
import { useVoiceAgentStore } from '@/store/voiceAgentStore';
import { useVoiceRecording } from '@/hooks/voice/useVoiceRecording';

const VOICE_API_BASE = process.env.EXPO_PUBLIC_VOICE_API_URL ?? '';

export interface VoicePipelineConfig {
  userId: string;
  propertyId: string;
  organizationId: string;
  userRole: string;
  userName: string;
  propertyName: string;
}

export async function runVoiceSession(config: VoicePipelineConfig): Promise<void> {
  const store = useVoiceAgentStore.getState();
  const recording = useVoiceRecording();

  try {
    const granted = await recording.requestPermission();
    if (!granted) {
      store.setError('Microphone permission denied');
      return;
    }

    store.setListening(true);
    store.setError(null);
    await recording.startRecording();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Recording failed';
    store.setError(msg);
    store.setListening(false);
  }
}

export async function processRecording(
  recordingUri: string | null,
  config: VoicePipelineConfig
): Promise<string | null> {
  if (!recordingUri) return null;

  const store = useVoiceAgentStore.getState();

  try {
    store.setListening(false);
    store.setProcessing(true);

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? '';

    if (!VOICE_API_BASE) {
      store.setError('Voice API URL not configured.');
      store.setProcessing(false);
      return null;
    }

    // Read audio and send to backend proxy
    const audioBase64 = await new File(recordingUri).base64();
    const ext = recordingUri.split('.').pop()?.toLowerCase() ?? 'm4a';
    const mimeType = ext === 'wav' ? 'audio/wav'
      : ext === 'mp3' ? 'audio/mpeg'
      : ext === 'webm' ? 'audio/webm'
      : 'audio/mp4';

    const ctx: VoiceContext = {
      userId: config.userId,
      propertyId: config.propertyId,
      organizationId: config.organizationId,
      userRole: config.userRole,
      userName: config.userName,
      propertyName: config.propertyName,
    };

    const res = await fetch(`${VOICE_API_BASE}/api/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        audio: audioBase64,
        format: mimeType,
        context: ctx,
        history: store.conversationHistory,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error ?? 'Voice API error');
    }

    const data = await res.json() as {
      transcript?: string;
      response?: string;
      audio?: string; // base64 TTS audio from backend
    };

    const transcript = data.transcript ?? '';
    const response = data.response ?? '';

    store.setTranscript(transcript);

    if (!transcript.trim()) {
      store.setAiResponse("I didn't catch that. Could you please repeat?");
      store.setProcessing(false);
      return null;
    }

    store.setAiResponse(response);

    store.addToHistory({ role: 'user', content: transcript });
    store.addToHistory({ role: 'assistant', content: response });

    store.setProcessing(false);
    store.setSpeaking(true);

    // Use expo-speech for TTS (no API key needed, works offline)
    await Speech.speak(response, {
      language: 'en-US',
      pitch: 1.0,
      rate: 1.0,
      onDone: () => {
        store.setSpeaking(false);
        store.clearSession();
      },
      onError: (e) => {
        store.setError(e ? String(e) : 'Speech failed');
        store.setSpeaking(false);
        store.clearSession();
      },
    });

    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI processing failed';
    store.setError(msg);
    store.setProcessing(false);
    store.setListening(false);
    store.setSpeaking(false);
    return null;
  }
}
