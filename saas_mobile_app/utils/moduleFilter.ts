/**
 * Maps mobile sidebar routes to saas_one organization module IDs.
 * saas_one modules: ticketing, viewer, analytics, procurement, visitors
 */
const ROUTE_MODULE_MAP: Record<string, string> = {
  tickets: 'ticketing',
  'flow-map': 'viewer',
  reports: 'analytics',
  ppm: 'analytics',
  stock: 'procurement',
  visitors: 'visitors',
};

/**
 * Check if a sidebar route is enabled based on the organization's available_modules.
 * Routes that don't map to a licensed module are always enabled (core features).
 * Empty/null availableModules is treated as "all enabled" for backward compatibility.
 */
export function isRouteEnabled(
  route: string,
  availableModules: string[] | null | undefined
): boolean {
  const moduleId = ROUTE_MODULE_MAP[route];
  // Core features not tied to module licensing
  if (!moduleId) return true;
  // Backward compatibility: no module restriction configured = all enabled
  if (!availableModules || availableModules.length === 0) return true;
  return availableModules.includes(moduleId);
}

/**
 * Filter an array of nav items by available modules.
 * Each item must have a `route` string property.
 */
export function filterNavItemsByModules<T extends { route: string }>(
  items: T[],
  availableModules: string[] | null | undefined
): T[] {
  return items.filter((item) => isRouteEnabled(item.route, availableModules));
}
