/**
 * Centralized Query Key Dictionary
 *
 * ALL React Query keys must be defined in this file to enable:
 * - Consistent cache invalidation
 * - Prefetching and hydration
 * - Persistence via query key matching
 *
 * @example
 * ```ts
 * import { queryKeys } from '@/utils/queryKeys'
 *
 * // In a useQuery hook
 * useQuery({
 *   queryKey: queryKeys.property.tickets(propertyId),
 *   queryFn: fetchTickets,
 * })
 *
 * // Invalidating every ticket query by prefix
 * queryClient.invalidateQueries({ queryKey: ['tickets'] })
 * ```
 */

// ────────────────────────────────────────────────────────────────
// Property — all keys scoped to a specific property
// ────────────────────────────────────────────────────────────────

const property = {
  /** Ticket list for a property */
  tickets: (propertyId: string) => ['tickets', propertyId] as const,
  /** Single ticket detail */
  ticketDetail: (id: string) => ['ticket-detail', id] as const,
  /** Users for a property */
  users: (propertyId: string) => ['users', propertyId] as const,
  /** Rooms for a property */
  rooms: (propertyId: string) => ['rooms', propertyId] as const,
  /** Room admin credits for a property */
  roomsAdminCredits: (propertyId: string) => ['rooms-admin-credits', propertyId] as const,
  /** Tenant rooms for a property */
  tenantRooms: (propertyId: string) => ['tenant-rooms', propertyId] as const,
  /** Visitors for a property */
  visitors: (propertyId: string) => ['visitors', propertyId] as const,
  /** Vendor data for a property */
  vendor: (propertyId: string) => ['vendor', propertyId] as const,
  /** Stock / inventory for a property */
  stock: (propertyId: string) => ['stock', propertyId] as const,
  /** Procurement data for a property */
  procurement: (propertyId: string) => ['procurement', propertyId] as const,
  /** Checklists for a property */
  checklist: (propertyId: string) => ['checklist', propertyId] as const,
  /** PPM (Planned Preventive Maintenance) for a property */
  ppm: (propertyId: string) => ['ppm', propertyId] as const,
  /** Escalations for a property */
  escalation: (propertyId: string) => ['escalation', propertyId] as const,
  /** Security logs for a property */
  security: (propertyId: string) => ['security', propertyId] as const,
  /** Settings for a property */
  settings: (propertyId: string) => ['settings', propertyId] as const,
  /** Flow map for a property */
  flowMap: (propertyId: string) => ['flow-map', propertyId] as const,
  /** Electricity readings for a property */
  electricity: (propertyId: string) => ['electricity', propertyId] as const,
  /** Electricity analytics for a property */
  electricityAnalytics: (propertyId: string) => ['electricity-analytics', propertyId] as const,
  /** Diesel readings for a property */
  diesel: (propertyId: string) => ['diesel', propertyId] as const,
  /** Diesel analytics for a property */
  dieselAnalytics: (propertyId: string) => ['diesel-analytics', propertyId] as const,
  /** Request reports for a property and month */
  reportsRequests: (propertyId: string, month: string) => ['reports-requests', propertyId, month] as const,
  /** Snag reports for a property */
  reportsSnags: (propertyId: string) => ['reports-snags', propertyId] as const,
  /** Executive summary for a property */
  reportsExecutive: (propertyId: string) => ['reports-executive', propertyId] as const,
  /** Main dashboard for a property */
  dashboard: (propertyId: string) => ['dashboard', propertyId] as const,
  /** Staff dashboard for a property */
  dashboardStaff: (propertyId: string) => ['dashboard-staff', propertyId] as const,
  /** MST dashboard for a property */
  mstDashboard: (propertyId: string) => ['mst-dashboard', propertyId] as const,
  /** New MST dashboard for a property */
  mstDashboardNew: (propertyId: string) => ['mst-dashboard-new', propertyId] as const,
  /** Premium MST dashboard for a property */
  mstDashboardPremium: (propertyId: string) => ['mst-dashboard-premium', propertyId] as const,
  /** Legacy MST dashboard for a property */
  mstDashboardLegacy: (propertyId: string) => ['mst-dashboard-legacy', propertyId] as const,
  /** Apple dashboard for a property */
  appleDashboard: (propertyId: string) => ['apple-dashboard', propertyId] as const,
  /** Soft service dashboard for a property */
  softService: (propertyId: string) => ['soft-service', propertyId] as const,
  /** Legacy soft service for a property */
  softServiceLegacy: (propertyId: string) => ['soft-service-legacy', propertyId] as const,
  /** Legacy property admin for a property */
  propertyAdminLegacy: (propertyId: string) => ['property-admin-legacy', propertyId] as const,
  /** Legacy staff for a property */
  staffLegacy: (propertyId: string) => ['staff-legacy', propertyId] as const,
  /** Property selection list (accepts multiple property IDs) */
  propertySelection: (...propertyIds: string[]) => ['property-selection', ...propertyIds] as const,
}

// ────────────────────────────────────────────────────────────────
// User — keys related to the authenticated user
// ────────────────────────────────────────────────────────────────

const user = {
  /** User profile */
  profile: (userId: string) => ['profile', userId] as const,
  /** Settings profile view */
  settingsView: (userId: string) => ['settings-view', userId] as const,
}

// ────────────────────────────────────────────────────────────────
// Organisation
// ────────────────────────────────────────────────────────────────

const org = {
  /** Users in an organisation */
  orgUsers: (orgId: string) => ['org-users', orgId] as const,
}

// ────────────────────────────────────────────────────────────────
// Analytics
// ────────────────────────────────────────────────────────────────

const analytics = {
  /** Global analytics tab data */
  analyticsTab: () => ['analytics-tab', 'global'] as const,
}

// ────────────────────────────────────────────────────────────────
// Admin
// ────────────────────────────────────────────────────────────────

const admin = {
  /** Master admin check for a user */
  masterAdmin: (userId: string) => ['master-admin', userId] as const,
  /** Super admin data for a user */
  superAdmin: (userId: string) => ['super-admin', userId] as const,
}

// ────────────────────────────────────────────────────────────────
// Cassandra (AI / Chat Rooms)
// ────────────────────────────────────────────────────────────────

const cassandra = {
  /** Cassandra rooms for a property */
  cassandraRooms: (propertyId: string) => ['cassandra-rooms', propertyId] as const,
  /** Single Cassandra room */
  cassandraRoom: (roomId: string) => ['cassandra-room', roomId] as const,
}

// ────────────────────────────────────────────────────────────────
// Reports — misc report keys not scoped to a property
// ────────────────────────────────────────────────────────────────

const reports = {
  /** Snag import detail */
  reportsSnagDetail: (importId: string) => ['reports-snag-detail', importId] as const,
}

// ═══════════════════════════════════════════════════════════════
// Exported Query Keys Namespace
// ═══════════════════════════════════════════════════════════════

/**
 * Centralized query key factory for React Query.
 *
 * Each domain exposes typed functions that return the exact query key
 * arrays used across the app for reliable caching, prefetching and
 * invalidation.
 */
export const queryKeys = {
  property,
  user,
  org,
  analytics,
  admin,
  cassandra,
  reports,
} as const

/** Top-level namespace keys for type-safe invalidation */
export type QueryKeyNamespace = keyof typeof queryKeys

/** @alias queryKeys — Default export for convenient importing */
export default queryKeys
