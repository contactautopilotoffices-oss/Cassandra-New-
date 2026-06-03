import { create } from 'zustand';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

export type AgentState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'PLANNING'
  | 'ACTING'
  | 'SPEAKING'
  | 'ERROR';

export interface StepProgress {
  step: string;
  status: 'pending' | 'running' | 'done' | 'error';
  error?: string;
}

interface VoiceAgentState {
  // Session state
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;

  // Agent state machine
  agentState: AgentState;
  currentIntent: string;
  stepProgress: StepProgress[];

  // Content
  transcript: string;
  aiResponse: string;
  conversationHistory: ConversationMessage[];

  // Orb UI state
  orbExpanded: boolean;
  sessionActive: boolean;

  // Error
  error: string | null;

  // Actions
  setListening: (val: boolean) => void;
  setProcessing: (val: boolean) => void;
  setSpeaking: (val: boolean) => void;
  setAgentState: (state: AgentState) => void;
  setCurrentIntent: (intent: string) => void;
  setStepProgress: (steps: StepProgress[]) => void;
  updateStepProgress: (stepName: string, update: Partial<StepProgress>) => void;
  setTranscript: (text: string) => void;
  setAiResponse: (text: string) => void;
  setOrbExpanded: (val: boolean) => void;
  setSessionActive: (val: boolean) => void;
  setError: (msg: string | null) => void;
  addToHistory: (msg: ConversationMessage) => void;
  clearSession: () => void;
  reset: () => void;
}

const MAX_HISTORY = 20;

export const useVoiceAgentStore = create<VoiceAgentState>((set, get) => ({
  isListening: false,
  isProcessing: false,
  isSpeaking: false,

  agentState: 'IDLE',
  currentIntent: '',
  stepProgress: [],

  transcript: '',
  aiResponse: '',
  conversationHistory: [],
  orbExpanded: false,
  sessionActive: false,
  error: null,

  setListening: (val) => set({
    isListening: val,
    agentState: val ? 'LISTENING' : get().agentState,
  }),
  setProcessing: (val) => set({ isProcessing: val }),
  setSpeaking: (val) => set({
    isSpeaking: val,
    agentState: val ? 'SPEAKING' : get().agentState,
  }),
  setAgentState: (state) => set({ agentState: state }),

  setCurrentIntent: (intent) => set({ currentIntent: intent }),
  setStepProgress: (steps) => set({ stepProgress: steps }),

  updateStepProgress: (stepName, update) =>
    set((state) => ({
      stepProgress: state.stepProgress.map(s =>
        s.step === stepName ? { ...s, ...update } : s
      ),
    })),

  setTranscript: (text) => set({ transcript: text }),
  setAiResponse: (text) => set({ aiResponse: text }),
  setOrbExpanded: (val) => set({ orbExpanded: val }),
  setSessionActive: (val) => set({ sessionActive: val }),
  setError: (msg) => set({ error: msg, agentState: msg ? 'ERROR' : get().agentState }),

  addToHistory: (msg) =>
    set((state) => ({
      conversationHistory: [
        ...state.conversationHistory.slice(-(MAX_HISTORY - 1)),
        msg,
      ],
    })),

  clearSession: () =>
    set({
      transcript: '',
      aiResponse: '',
      error: null,
      currentIntent: '',
      stepProgress: [],
    }),

  reset: () =>
    set({
      isListening: false,
      isProcessing: false,
      isSpeaking: false,
      agentState: 'IDLE',
      currentIntent: '',
      stepProgress: [],
      transcript: '',
      aiResponse: '',
      conversationHistory: [],
      orbExpanded: false,
      sessionActive: false,
      error: null,
    }),
}));
