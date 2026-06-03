'use client';

/**
 * AudioAuraOrb — Audio-reactive crystal orb with lime/amber palette
 *
 * Lime primary (#a3e635) with amber accent (#fb923c).
 * Accepts audioLevel (0–1) prop to scale intensity — brighter
 * and more energetic on sound.
 * GPU-rendered via expo-gl — all animation on GPU via GLSL.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import CrystalOrbCore from './CrystalOrbCore';

export interface AudioAuraOrbProps {
  /** Normalized audio level 0–1. Defaults to 0 (idle animation). */
  audioLevel?: number;
}

export default function AudioAuraOrb({ audioLevel: controlledLevel }: AudioAuraOrbProps) {
  const [micLevel, setMicLevel] = useState(0);
  const recordingRef = React.useRef<Audio.Recording | null>(null);

  // Use controlled value if provided, otherwise use microphone input
  const displayLevel = controlledLevel ?? micLevel;

  // Compute intensity from audio level: idle=0.7, max=1.3
  const intensity = 0.7 + displayLevel * 0.6;

  // Microphone metering — starts on mount
  useEffect(() => {
    if (controlledLevel !== undefined) return; // skip if controlled externally

    let mounted = true;

    const startRecording = async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') return;

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.LOW_QUALITY,
          undefined,
          100,
        );
        recordingRef.current = recording;

        const interval = setInterval(async () => {
          if (!mounted || !recordingRef.current) return;
          try {
            const status = await recordingRef.current.getStatusAsync();
            const metering = (status as any).metering ?? -60;
            const normalized = Math.min(Math.max((metering + 60) / 60, 0), 1);
            setMicLevel(normalized);
          } catch {}
        }, 100);

        return () => clearInterval(interval);
      } catch (e) {
        // Mic unavailable — stay at idle
      }
    };

    startRecording();

    return () => {
      mounted = false;
      recordingRef.current?.stopAndUnloadAsync?.().catch(() => {});
    };
  }, [controlledLevel]);

  return (
    <CrystalOrbCore
      size={70}
      primaryColor="#a3e635"
      secondaryColor="#fb923c"
      speed={1.2}
      intensity={intensity}
    />
  );
}
