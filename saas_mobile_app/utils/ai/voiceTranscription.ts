/**
 * Voice Transcription — Record audio + Groq Whisper transcription
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_WHISPER_MODEL = 'whisper-large-v3';

let currentRecording: Audio.Recording | null = null;

export async function requestAudioPermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

export async function startRecording(): Promise<boolean> {
  try {
    const canRecord = await requestAudioPermission();
    if (!canRecord) return false;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    currentRecording = recording;
    return true;
  } catch (err) {
    console.warn('[VoiceTranscription] Start recording failed:', err);
    return false;
  }
}

export async function stopRecording(): Promise<string | null> {
  if (!currentRecording) return null;

  try {
    await currentRecording.stopAndUnloadAsync();
    const uri = currentRecording.getURI();
    currentRecording = null;
    return uri;
  } catch (err) {
    console.warn('[VoiceTranscription] Stop recording failed:', err);
    currentRecording = null;
    return null;
  }
}

export function cancelRecording(): void {
  if (currentRecording) {
    currentRecording.stopAndUnloadAsync().catch(() => {});
    currentRecording = null;
  }
}

export async function transcribeAudio(audioUri: string): Promise<string | null> {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) {
    console.warn('[VoiceTranscription] GROQ_API_KEY missing');
    return null;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    if (!fileInfo.exists) return null;

    const fileName = audioUri.split('/').pop() || 'recording.m4a';
    const mimeType = 'audio/m4a';

    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      name: fileName,
      type: mimeType,
    } as any);
    formData.append('model', GROQ_WHISPER_MODEL);
    formData.append('language', 'en');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(GROQ_TRANSCRIBE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[VoiceTranscription] Transcription failed:', res.status, errText);
      return null;
    }

    const data = await res.json();
    return data.text?.trim() || null;
  } catch (err) {
    console.warn('[VoiceTranscription] Transcription error:', err);
    return null;
  }
}
