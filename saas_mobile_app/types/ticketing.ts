/**
 * ticketing.ts — Extended ticket types for fields introduced by Phase 2–4 refactors.
 *
 * The canonical Ticket interface lives in types/index.ts (camelCase, FE-friendly).
 * This file adds:
 *  - Raw DB row shapes (snake_case) for Supabase queries in dashboard/detail screens
 *  - SLA pause/resume activity actions
 *  - Ticket activity log entry shape
 */

import type { TicketStatus, TicketPriority } from './index';

// ─── SLA pause ────────────────────────────────────────────────────────────────

export type SlaPauseReason = 'Waiting for Parts' | 'Pending Approval';

// ─── Activity log ──────────────────────────────────────────────────────────────

export type TicketActivityAction =
  | 'created'
  | 'assigned'
  | 'reassigned'
  | 'work_started'
  | 'completed'
  | 'resumed'
  | 'closed'
  | 'comment_added'
  | 'photo_uploaded'
  | 'sla_breached'
  | 'sla_paused'
  | 'sla_resumed'
  | 'sop_checklist_completed'
  | string; // extensible

export interface TicketActivityLog {
  id: string;
  ticket_id: string;
  user_id: string;
  action: TicketActivityAction;
  old_value?: string | null;
  new_value?: string | null;
  created_at: string;
}

// ─── Raw DB ticket row (snake_case) ──────────────────────────────────────────

export interface RawTicket {
  id: string;
  title: string;
  description?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  category_id?: string | null;
  property_id: string;
  organization_id: string;
  raised_by?: string | null;
  assigned_to?: string | null;
  ticket_number?: string | null;
  sla_deadline?: string | null;
  sla_breached?: boolean;
  work_paused: boolean;
  work_pause_reason?: SlaPauseReason | string | null;
  total_paused_minutes?: number | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  photo_before_url?: string | null;
  photo_after_url?: string | null;
  photo_before_video_url?: string | null;
  photo_after_video_url?: string | null;
}

// ─── MST daily gamification ──────────────────────────────────────────────────

export interface MstDailyScore {
  id: string;
  user_id: string;
  property_id?: string | null;
  score_date: string;
  total_points: number;
  tickets_resolved: number;
  sla_met_count: number;
  streak_days: number;
  created_at?: string | null;
}

// ─── SOP ──────────────────────────────────────────────────────────────────────

export interface SOPCompletionItem {
  completion_id: string;
  checklist_item_id: string;
  is_completed: boolean;
  completed_by?: string | null;
  completed_at?: string | null;
}

export interface SOPCompletion {
  id: string;
  template_id: string;
  property_id: string;
  organization_id: string;
  status: 'pending' | 'in_progress' | 'completed';
  completed_by?: string | null;
  completed_at?: string | null;
  completion_date?: string | null;
  created_at?: string | null;
}
