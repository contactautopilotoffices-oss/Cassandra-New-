'use client';
import { useCallback, useRef, useState } from 'react';
import { Platform, Alert } from 'react-native';
import { Audio } from 'expo-av';

// ---------------------------------------------------------------------------
// Voice Recording Hook
// Web: MediaRecorder API
// Native: expo-av Audio.Recording
// ---------------------------------------------------------------------------

interface UseVoiceRecordingReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  recordingUri: string | null;
  permissionGranted: boolean;
  requestPermission: () => Promise<boolean>;
  error: string | null;
}

// expo-av recording options — record to .m4a (AAC) which Whisper accepts
const RECORDING_OPTIONS: Record<string, unknown> = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
} as any; // platform-specific, cast to any to satisfy RecordingOptions

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Web refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Native ref
  const recordingRef = useRef<Audio.Recording | null>(null);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        setPermissionGranted(true);
        return true;
      } catch {
        setPermissionGranted(false);
        return false;
      }
    }

    try {
      const { status } = await Audio.requestPermissionsAsync();
      setPermissionGranted(status === 'granted');
      return status === 'granted';
    } catch {
      setPermissionGranted(false);
      return false;
    }
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    setError(null);

    if (Platform.OS === 'web') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        streamRef.current = stream;
        audioChunksRef.current = [];

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(100); // collect chunks every 100ms

        setIsRecording(true);
        setPermissionGranted(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start recording';
        setError(message);
        Alert.alert('Microphone Error', message);
        throw err;
      }
      return;
    }

    // Native: expo-av
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS as any);
      recordingRef.current = recording;
      setIsRecording(true);
      setPermissionGranted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording';
      setError(message);
      Alert.alert('Microphone Error', message);
      throw err;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return new Promise((resolve) => {
        const recorder = mediaRecorderRef.current;
        const stream = streamRef.current;

        if (!recorder || recorder.state === 'inactive') {
          setIsRecording(false);
          resolve(null);
          return;
        }

        recorder.onstop = () => {
          stream?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;

          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const uri = URL.createObjectURL(blob);

          setIsRecording(false);
          setRecordingUri(uri);
          resolve(uri);
        };

        recorder.stop();
      });
    }

    // Native: expo-av
    try {
      const recording = recordingRef.current;
      if (!recording) {
        setIsRecording(false);
        return null;
      }

      recordingRef.current = null;
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = recording.getURI();
      setIsRecording(false);
      setRecordingUri(uri);
      return uri;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop recording';
      setError(message);
      setIsRecording(false);
      return null;
    }
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    recordingUri,
    permissionGranted,
    requestPermission,
    error,
  };
}
