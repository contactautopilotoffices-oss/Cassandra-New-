'use client';
/**
 * unreadStore — Simple unread badge counter for ticket chat / notifications
 * Used by GlobalBottomNav to show WhatsApp-style red badges
 */
import { create } from 'zustand';

interface UnreadStore {
  ticketChatCount: number;
  incrementTicketChat: (by?: number) => void;
  decrementTicketChat: (by?: number) => void;
  clearTicketChat: () => void;
  setTicketChat: (count: number) => void;
}

export const useUnreadStore = create<UnreadStore>((set) => ({
  ticketChatCount: 0,
  incrementTicketChat: (by = 1) => set((s) => ({ ticketChatCount: s.ticketChatCount + by })),
  decrementTicketChat: (by = 1) => set((s) => ({ ticketChatCount: Math.max(0, s.ticketChatCount - by) })),
  clearTicketChat: () => set({ ticketChatCount: 0 }),
  setTicketChat: (count) => set({ ticketChatCount: Math.max(0, count) }),
}));
