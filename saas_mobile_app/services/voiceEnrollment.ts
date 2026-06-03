/**
 * Voice Enrollment Service — mobile client.
 *
 * Records 3 audio phrases, sends each to the backend API,
 * and stores the resulting ECAPA-TDNN speaker embedding.
 */

import { File } from 'expo-file-system';
import { supabase } from '@/utils/supabase/client';

const ENROLL_API_URL = process.env.EXPO_PUBLIC_VOICE_API_URL ?? '';
const MAX_PHRASE_SECONDS = 15;

// Standard enrollment phrases for speaker verification
export const ENROLLMENT_PHRASES = [
  'My voice is my password',
  'I am a facility manager',
  'Autopilot Offices is my workspace',
] as const;

export type EnrollmentState =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'enrolled'
  | 'error';

export interface EnrollmentResult {
  embedding_id: string;
}

export interface VoiceEnrollmentOptions {
  onStateChange?: (state: EnrollmentState) => void;
  onPhraseProgress?: (phraseIndex: number, total: number) => void;
  onError?: (message: string) => void;
  onSuccess?: (embeddingId: string) => void;
}

export class VoiceEnrollmentService {
  private state: EnrollmentState = 'idle';
  private handlers: Required<VoiceEnrollmentOptions>;
  private currentPhraseIndex = 0;
  private phraseResults: string[] = [];

  constructor(handlers: VoiceEnrollmentOptions) {
    this.handlers = {
      onStateChange: handlers.onStateChange ?? (() => {}),
      onPhraseProgress: handlers.onPhraseProgress ?? (() => {}),
      onError: handlers.onError ?? (() => {}),
      onSuccess: handlers.onSuccess ?? (() => {}),
    };
  }

  private setState(state: EnrollmentState) {
    this.state = state;
    this.handlers.onStateChange(state);
  }

  getState(): EnrollmentState {
    return this.state;
  }

  getCurrentPhraseIndex(): number {
    return this.currentPhraseIndex;
  }

  reset() {
    this.currentPhraseIndex = 0;
    this.phraseResults = [];
    this.setState('idle');
  }

  /**
   * Enroll a single phrase: record it and send to the API.
   * Returns the per-phrase result token, or null on failure.
   */
  async enrollPhrase(recordingUri: string | null): Promise<string | null> {
    if (!recordingUri) return null;

    this.setState('processing');

    try {
      const audioBase64 = await new File(recordingUri).base64();

      const result = await this.callEnrollApi(audioBase64, recordingUri);

      this.setState('idle');
      return result.embedding_id ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Enrollment failed';
      this.setState('error');
      this.handlers.onError(msg);
      return null;
    }
  }

  /**
   * Full 3-phrase enrollment sequence.
   * Caller provides the recording URI after each phrase is captured.
   *
   * Usage:
   *   const svc = new VoiceEnrollmentService({ onStateChange, onSuccess });
   *   for (let i = 0; i < 3; i++) {
   *     // show phrase ENROLLMENT_PHRASES[i] to user
   *     // capture audio → recordingUri
   *     const ok = await svc.enrollPhraseSequential(i, recordingUri);
   *     if (!ok) return; // error
   *   }
   *   // success — embedding already stored server-side
   */
  async enrollPhraseSequential(
    phraseIndex: number,
    recordingUri: string | null
  ): Promise<boolean> {
    if (!recordingUri) return false;

    this.currentPhraseIndex = phraseIndex;
    this.handlers.onPhraseProgress(phraseIndex + 1, ENROLLMENT_PHRASES.length);
    this.setState('processing');

    try {
      const audioBase64 = await new File(recordingUri).base64();

      const result = await this.callEnrollApi(audioBase64, recordingUri);

      if (result.error) {
        throw new Error(result.error);
      }

      this.phraseResults.push(result.embedding_id);
      this.setState('idle');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Enrollment failed';
      this.setState('error');
      this.handlers.onError(msg);
      return false;
    }
  }

  /**
   * Check if the current user already has an active voice enrollment.
   */
  async checkExistingEnrollment(): Promise<{ enrolled: boolean; embedding_id?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return { enrolled: false };

      const { data, error } = await ((supabase
        .from('user_voice_embeddings' as any) as any)
        .select('id')
        .eq('user_id', session.user.id)
        .eq('status', 'enrolled')
        .maybeSingle());

      if (error) return { enrolled: false };
      return { enrolled: !!data, embedding_id: (data as { id: string } | null)?.id };
    } catch {
      return { enrolled: false };
    }
  }

  /**
   * Delete the user's current voice enrollment (for re-enrollment).
   */
  async deleteEnrollment(): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      await (supabase as any)
        .from('user_voice_embeddings')
        .update({ status: 'revoked' })
        .eq('user_id', session.user.id)
        .eq('status', 'enrolled');

      this.reset();
    } catch {
      // Non-fatal
    }
  }

  private async callEnrollApi(
    audioBase64: string,
    uri: string
  ): Promise<{ embedding_id: string; error?: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? '';

    const ext = uri.split('.').pop()?.toLowerCase() ?? 'm4a';
    const mimeType =
      ext === 'wav' ? 'audio/wav'
      : ext === 'mp3' ? 'audio/mpeg'
      : ext === 'webm' ? 'audio/webm'
      : 'audio/mp4';

    if (!ENROLL_API_URL) {
      throw new Error(
        'Voice enrollment API URL is not configured. Please set EXPO_PUBLIC_VOICE_API_URL in your environment.'
      );
    }

    const res = await fetch(`${ENROLL_API_URL}/api/voice/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        audio: audioBase64,
        format: mimeType,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
      throw new Error(err.error ?? `Enrollment failed: ${res.status}`);
    }

    return (await res.json()) as unknown as { embedding_id: string; error?: string };
  }
}

// ─── Standalone convenience function ────────────────────────────────────────────
/**
 * Quick enrollment helper for use in screens.
 * Call `enrollVoice()` which returns { success, embeddingId }.
 */
export async function enrollVoice(
  recordingUri: string
): Promise<{ success: boolean; embeddingId?: string; error?: string }> {
  try {
    const svc = new VoiceEnrollmentService({});
    const embeddingId = await svc.enrollPhrase(recordingUri);
    if (!embeddingId) return { success: false, error: 'Enrollment failed — no embedding ID returned' };
    return { success: true, embeddingId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
