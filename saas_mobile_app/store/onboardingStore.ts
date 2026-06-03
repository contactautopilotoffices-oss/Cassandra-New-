import { create } from 'zustand';

/**
 * Lightweight store for cross-screen communication between
 * the voice-enrollment screen and the onboarding wizard.
 *
 * The voice-enrollment screen writes `voiceEnrollmentDone = true`
 * on success (or `voiceEnrollmentSkipped = true` on skip).
 * The onboarding screen reads this on focus to advance to the next step.
 */
interface OnboardingState {
  voiceEnrollmentDone: boolean;
  voiceEnrollmentSkipped: boolean;
  voiceEnrollmentCompletedAt: number | null; // timestamp, for distinguishing new completions

  setVoiceEnrollmentDone: () => void;
  setVoiceEnrollmentSkipped: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  voiceEnrollmentDone: false,
  voiceEnrollmentSkipped: false,
  voiceEnrollmentCompletedAt: null,

  setVoiceEnrollmentDone: () =>
    set({
      voiceEnrollmentDone: true,
      voiceEnrollmentSkipped: false,
      voiceEnrollmentCompletedAt: Date.now(),
    }),

  setVoiceEnrollmentSkipped: () =>
    set({
      voiceEnrollmentDone: false,
      voiceEnrollmentSkipped: true,
      voiceEnrollmentCompletedAt: Date.now(),
    }),

  reset: () =>
    set({
      voiceEnrollmentDone: false,
      voiceEnrollmentSkipped: false,
      voiceEnrollmentCompletedAt: null,
    }),
}));
