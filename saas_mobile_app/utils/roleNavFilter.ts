import { CAPABILITY_MATRIX } from '@/constants/capabilities';
import { CapabilityDomain } from '@/types/rbac';
import { isRouteEnabled } from './moduleFilter';

/**
 * Maps mobile sidebar routes to capability domains for role-based filtering.
 * Routes not listed here are treated as universally accessible.
 */
export const ROUTE_DOMAIN_MAP: Record<string, CapabilityDomain> = {
  dashboard: 'dashboards',
  tickets: 'tickets',
  'flow-map': 'tickets',
  users: 'users',
  visitors: 'visitors',
  rooms: 'properties',
  diesel: 'assets',
  electricity: 'assets',
  stock: 'stock',
  checklist: 'sop',
  ppm: 'reports',
  reports: 'reports',
  procurement: 'procurement',
  'soft-service-manager': 'sop',
  escalation: 'tickets',
  vendor: 'vendors',
  settings: 'dashboards',
};

/**
 * Check if a route is accessible for a given role based on CAPABILITY_MATRIX.
 * Settings and Dashboard are always visible.
 */
export function isRouteAllowedByRole(
  route: string,
  role: string
): boolean {
  // Always allow core navigation
  if (route === 'settings' || route === 'dashboard') return true;

  const capabilities = CAPABILITY_MATRIX[role as keyof typeof CAPABILITY_MATRIX];
  if (!capabilities) return false;

  const domain = ROUTE_DOMAIN_MAP[route];
  // If no domain mapping, allow by default (unknown routes)
  if (!domain) return true;

  return capabilities[domain]?.includes('view') ?? false;
}

/**
 * Filter nav items by role capabilities.
 * Each item must have a `route` string property.
 */
export function filterNavItemsByRole<T extends { route: string }>(
  items: T[],
  role: string
): T[] {
  return items.filter((item) => isRouteAllowedByRole(item.route, role));
}

/**
 * Combined filter: role capabilities + org modules.
 */
export function filterNavItems<T extends { route: string }>(
  items: T[],
  role: string,
  availableModules?: string[]
): T[] {
  const roleFiltered = filterNavItemsByRole(items, role);
  if (!availableModules || availableModules.length === 0) return roleFiltered;

  return roleFiltered.filter((item) => isRouteEnabled(item.route, availableModules));
}
