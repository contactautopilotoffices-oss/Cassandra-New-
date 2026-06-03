/**
 * Cassandra App Store — Zustand global state
 *
 * Orb state machine, transcripts, modals, connection status.
 */

import { create } from 'zustand';
import type { OrbState } from '@/constants/cassandra-theme';

export type ActiveModal = 'dashboard' | 'chat' | 'files' | 'users' | 'skills' | null;

interface AppState {
  // Orb
  orbState: OrbState;
  setOrbState: (s: OrbState) => void;

  // Voice
  transcript: string;
  setTranscript: (t: string | ((prev: string) => string)) => void;
  appendTranscript: (t: string) => void;

  // Tickets
  lastTickets: any[];
  setLastTickets: (t: any[]) => void;

  // Connection
  isConnected: boolean;
  setIsConnected: (c: boolean) => void;

  // UI
  activeModal: ActiveModal;
  setActiveModal: (m: ActiveModal) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  orbState: 'idle' as OrbState,
  transcript: '',
  lastTickets: [],
  isConnected: false,
  activeModal: null as ActiveModal,
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setOrbState: (s) => set({ orbState: s }),
  setTranscript: (t) =>
    set((state) => ({
      transcript: typeof t === 'function' ? (t as (prev: string) => string)(state.transcript) : t,
    })),
  appendTranscript: (t) => set((state) => ({ transcript: state.transcript + t })),
  setLastTickets: (tickets) => set({ lastTickets: tickets }),
  setIsConnected: (c) => set({ isConnected: c }),
  setActiveModal: (m) => set({ activeModal: m }),

  reset: () => set(initialState),
}));
