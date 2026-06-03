'use client';
import { useCallback, useRef, useState, useEffect } from 'react';
import { Platform } from 'react-native';

let Speech: typeof import('expo-speech') | null = null;
if (Platform.OS !== 'web') {
  try {
    Speech = require('expo-speech');
  } catch {
    Speech = null;
  }
}

// ---------------------------------------------------------------------------
// Text-to-Speech Hook
// Web: OpenAI tts-1 via fetch + Audio playback, with SpeechSynthesis fallback
// Native: expo-speech
// ---------------------------------------------------------------------------

interface UseTextToSpeechReturn {
  isSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
  error: string | null;
}

export function useTextToSpeech(): UseTextToSpeechReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTextRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (Platform.OS !== 'web' && Speech) {
        Speech.stop();
      }
    };
  }, []);

  const stop = useCallback(() => {
    if (Platform.OS === 'web') {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } else if (Speech) {
      Speech.stop();
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string): Promise<void> => {
    if (!text || text.trim().length === 0) return;

    setError(null);
    currentTextRef.current = text;

    // Stop any currently playing audio
    stop();

    if (Platform.OS === 'web') {
      // Web: use Web SpeechSynthesis API (no API key needed)
      webFallbackSpeak(text);
    } else {
      // Native: use expo-speech
      if (!Speech) {
        setError('Speech module not available');
        return;
      }
      try {
        setIsSpeaking(true);
        await Speech.speak(text, {
          language: 'en-US',
          pitch: 1.0,
          rate: 1.0,
          onDone: () => setIsSpeaking(false),
          onError: (e: any) => {
            setIsSpeaking(false);
            setError(e ? String(e) : 'Speech synthesis failed');
          },
        });
      } catch (err) {
        setIsSpeaking(false);
        setError(err instanceof Error ? err.message : 'Speech synthesis failed');
      }
    }
  }, [stop]);

  // Web-only fallback using SpeechSynthesis API
  const webFallbackSpeak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setError('Speech synthesis not available');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = 'en-IN';

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith('en') && (
        v.name.includes('Female') ||
        v.name.includes('Samantha') ||
        v.name.includes('Google') ||
        v.name.includes('Microsoft')
      )
    );
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (e) => {
      setIsSpeaking(false);
      setError(e.error ?? 'Speech synthesis failed');
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  return { isSpeaking, speak, stop, error };
}
