'use client';
import React, { useCallback } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VoiceOrb } from './VoiceOrb';
import { VoiceSessionSheet } from './VoiceSessionSheet';
import { useVoiceAgent } from '@/hooks/voice/useVoiceAgent';
import { VoicePipelineConfig } from '@/services/ai/voiceAgentPipeline';

interface VoiceOrbWrapperProps {
  config: VoicePipelineConfig;
  style?: object;
}

export function VoiceOrbWrapper({ config, style }: VoiceOrbWrapperProps) {
  const insets = useSafeAreaInsets();
  const {
    toggleSession,
    startSession,
    endSession,
    sessionActive,
    isListening,
    isProcessing,
    isSpeaking,
    error,
  } = useVoiceAgent(config);

  const handleOrbPress = useCallback(async () => {
    // If no session active, connect first
    if (!sessionActive) {
      await startSession();
    } else {
      // Toggle recording
      await toggleSession();
    }
  }, [sessionActive, startSession, toggleSession]);

  const bottomOffset = insets.bottom + 24;

  return (
    <>
      <View
        style={[
          styles.container,
          {
            bottom: bottomOffset,
            width: 140,
            alignSelf: 'center',
          },
          style,
        ]}
        pointerEvents="box-none"
      >
        <VoiceOrb
          onPress={handleOrbPress}
          disabled={isProcessing && !isListening && !sessionActive}
        />
      </View>

      {/* Session transcript sheet */}
      <VoiceSessionSheet visible={!!sessionActive} onClose={endSession} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
});
