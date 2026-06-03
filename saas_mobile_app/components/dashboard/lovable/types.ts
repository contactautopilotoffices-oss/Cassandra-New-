export interface Property {
  id: string;
  name: string;
  code: string;
  address?: string;
  image_url?: string | null;
  // Raw stats
  openTickets: number;
  resolvedTickets: number;
  totalTickets: number;
  // Aggregated metrics
  healthScore: number; // 0-100
  healthStatus: 'good' | 'warning' | 'critical';
  checklist: { 
    completed: number; 
    total: number;
    percent: number;
  };
  energy: { 
    diesel: number;    // Litres consumed today
    electricity: number; // kVAh consumed today
    trend: number;    // % change vs avg
  };
  tickets: { day: string; count: number }[];
  // Backwards compatibility / legacy fields
  status?: 'optimal' | 'warning' | 'critical';
}

export interface TileDetail {
  id: string;
  iconName: string;
  label: string;
  title: string;
  metrics: { label: string; value: string }[];
  chartTitle: string;
  chartData: { label: string; value: number }[];
  chartColor: string;
  trendDirection: 'up' | 'down';
  trendLabel: string;
  breakdownTitle: string;
  breakdown: { label: string; value: string | number; color: string }[];
  aiAnalysis: string;
}

export type Screen = 'properties' | 'property-detail' | 'console' | 'analytics';
export type Tab = 'overview' | 'organizations';

export interface Org {
  id: string;
  name: string;
  code: string;
  is_deleted: boolean;
  properties?: { count: number }[];
}

export interface SystemUser {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
}
