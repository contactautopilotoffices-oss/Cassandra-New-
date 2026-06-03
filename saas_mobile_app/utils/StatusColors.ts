/**
 * Shared status and priority color definitions.
 * Single source of truth — used by all mobile components.
 * DO NOT define these colors anywhere else.
 */
import { Colors } from '@/constants/Colors';

// ---- Status ----
export type TicketStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'waitlist';

export const STATUS_CONFIG: Record<
  TicketStatus,
  { bg: string; text: string; dot: string }
> = {
  open:          { bg: '#F9731618', text: '#F97316', dot: '#F97316' },  // orange
  assigned:      { bg: '#3B82F618', text: '#3B82F6', dot: '#3B82F6' },  // blue
  in_progress:   { bg: '#F59E0B18', text: '#F59E0B', dot: '#F59E0B' },  // amber
  resolved:      { bg: '#22C55E18', text: '#22C55E', dot: '#22C55E' },  // green
  closed:        { bg: '#22C55E18', text: '#22C55E', dot: '#22C55E' },  // green
  waitlist:      { bg: '#64748B18', text: '#64748B', dot: '#64748B' },  // gray
};

// Fallback for unknown statuses
export const DEFAULT_STATUS_CONFIG = { bg: '#708F9618', text: '#708F96', dot: '#708F96' };

// ---- Priority ----
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent' | 'critical';

export const PRIORITY_CONFIG: Record<
  TicketPriority,
  { bg: string; text: string; dot: string }
> = {
  critical: { bg: '#EF444418', text: '#EF4444', dot: '#EF4444' }, // red
  urgent:   { bg: '#F9731618', text: '#F97316', dot: '#F97316' }, // orange
  high:     { bg: '#EAB30818', text: '#EAB308', dot: '#EAB308' }, // yellow
  medium:   { bg: '#708F9618', text: '#708F96', dot: '#708F96' }, // teal
  low:      { bg: '#64748B18', text: '#64748B', dot: '#64748B' }, // gray
};

export const DEFAULT_PRIORITY_CONFIG = { bg: '#64748B18', text: '#64748B', dot: '#64748B' };

// ---- Helper: get config or default ----
export function getStatusConfig(status: string): typeof STATUS_CONFIG.open {
  return STATUS_CONFIG[status as TicketStatus] ?? DEFAULT_STATUS_CONFIG;
}

export function getPriorityConfig(priority: string): typeof PRIORITY_CONFIG.medium {
  return PRIORITY_CONFIG[priority as TicketPriority] ?? DEFAULT_PRIORITY_CONFIG;
}
