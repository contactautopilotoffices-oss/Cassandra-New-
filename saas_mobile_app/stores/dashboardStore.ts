import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ticket } from '@/types';

// ---------------------------------------------------------------------------
// Dashboard State Types — Module 1.3: Property & Status Handshake
// ---------------------------------------------------------------------------

interface DashboardState {
  // Ticket data
  tickets: Ticket[];
  ticketCounts: { total: number; open: number; closed: number };
  // SOP data
  sopCount: number;
  sopTotal: number;
  // Energy data
  energyKwh: number;
  energyTrend: number;
  // Property context (org_id scoping is critical)
  propertyName: string;
  loadedPropertyId: string | null;
  // Visitor stats
  vmsStats: { total: number; in: number; out: number };
  // Vendor stats
  vendorStats: { revenue: number; commission: number };
  // Diesel stats
  dieselStats: { level: number; consumption: number };
  // Health score
  healthScore: number | null;
  // Attention items (tickets needing action)
  attentionItems: Ticket[];
  // Kanban funnel
  ticketFunnel: { status: string; count: number }[];
  // Cache state
  hasLoadedInitialData: boolean;
  lastUpdatedAt: number | null;
  backgroundImage: string;
  // Actions
  setBackgroundImage: (url: string) => void;
  setDashboardData: (data: Partial<DashboardState>) => void;
  clearCache: () => void;
}

const initialState = {
  tickets: [],
  ticketCounts: { total: 0, open: 0, closed: 0 },
  sopCount: 0,
  sopTotal: 0,
  energyKwh: 0,
  energyTrend: 12,
  propertyName: 'Property',
  vmsStats: { total: 0, in: 0, out: 0 },
  vendorStats: { revenue: 0, commission: 0 },
  dieselStats: { level: 0, consumption: 0 },
  healthScore: null,
  attentionItems: [],
  ticketFunnel: [],
  hasLoadedInitialData: false,
  loadedPropertyId: null,
  lastUpdatedAt: null,
  backgroundImage: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1200&auto=format&fit=crop', // Night sky default
};

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      ...initialState,
      setBackgroundImage: (url) => set((state) => ({ ...state, backgroundImage: url })),
      setDashboardData: (data) => set((state) => ({ ...state, ...data })),
      clearCache: () => set({ ...initialState }),
    }),
    {
      name: 'autopilot-dashboard-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        tickets: state.tickets,
        ticketCounts: state.ticketCounts,
        sopCount: state.sopCount,
        sopTotal: state.sopTotal,
        energyKwh: state.energyKwh,
        energyTrend: state.energyTrend,
        propertyName: state.propertyName,
        vmsStats: state.vmsStats,
        vendorStats: state.vendorStats,
        dieselStats: state.dieselStats,
        healthScore: state.healthScore,
        attentionItems: state.attentionItems,
        ticketFunnel: state.ticketFunnel,
        hasLoadedInitialData: state.hasLoadedInitialData,
        loadedPropertyId: state.loadedPropertyId,
        lastUpdatedAt: state.lastUpdatedAt,
        backgroundImage: state.backgroundImage,
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// Atomic selectors — prevent full-tree re-renders
// ---------------------------------------------------------------------------

export const useDashboardTickets = () => useDashboardStore((state) => state.tickets);
export const useDashboardTicketCounts = () => useDashboardStore((state) => state.ticketCounts);
export const useDashboardSopCount = () => useDashboardStore((state) => state.sopCount);
export const useDashboardSopTotal = () => useDashboardStore((state) => state.sopTotal);
export const useDashboardEnergyKwh = () => useDashboardStore((state) => state.energyKwh);
export const useDashboardEnergyTrend = () => useDashboardStore((state) => state.energyTrend);
export const useDashboardPropertyName = () => useDashboardStore((state) => state.propertyName);
export const useDashboardLoadedPropertyId = () => useDashboardStore((state) => state.loadedPropertyId);
export const useDashboardVmsStats = () => useDashboardStore((state) => state.vmsStats);
export const useDashboardVendorStats = () => useDashboardStore((state) => state.vendorStats);
export const useDashboardDieselStats = () => useDashboardStore((state) => state.dieselStats);
export const useDashboardHealthScore = () => useDashboardStore((state) => state.healthScore);
export const useDashboardAttentionItems = () => useDashboardStore((state) => state.attentionItems);
export const useDashboardTicketFunnel = () => useDashboardStore((state) => state.ticketFunnel);
export const useDashboardHasLoadedInitialData = () => useDashboardStore((state) => state.hasLoadedInitialData);
export const useDashboardLastUpdatedAt = () => useDashboardStore((state) => state.lastUpdatedAt);
export const useDashboardBackgroundImage = () => useDashboardStore((state) => state.backgroundImage);
