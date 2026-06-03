/**
 * Mobile API utility — calls web API routes with Bearer token auth.
 * Copy of the exact pattern from saas_development/frontend/utils/supabase/mobile-auth.ts
 *
 * Web API base: https://fms-dev-saas-one.vercel.app
 */
import { createClient } from '@/utils/supabase/client';
import { Platform } from 'react-native';

// ---------------------------------------------------------------------
// Supabase client-with-token (used for server-side API calls)
// ---------------------------------------------------------------------
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createClientFromToken(accessToken: string) {
  return createSupabaseClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Get the current Supabase access token for Bearer auth.
 * Returns null if not authenticated.
 *
 * Strategy: use getSession() (synchronous, cached from storage) first to avoid
 * a network round-trip on mobile. On Expo Go, AsyncStorage may not be fully
 * synchronised when the app starts, so we fall back to getUser() which validates
 * the token with the Supabase Auth server — slower but authoritative.
 */
export async function getSupabaseToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    // getSession() reads from cached storage — works immediately, no network call.
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) return sessionData.session.access_token;

    // Fallback: no session available
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the current user's ID, with the same session-first strategy as getSupabaseToken.
 * Safe to call from non-React service files (unlike useAuth() which requires a hook).
 * Returns null if no authenticated session is found.
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user?.id) return sessionData.session.user.id;

    const { data: userData } = await supabase.auth.getUser();
    return userData.user?.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Web API base URL
// ---------------------------------------------------------------------
export const WEB_API_BASE = process.env.EXPO_PUBLIC_WEB_API_URL ?? 'https://www.back2basiics.com';

// ---------------------------------------------------------------------
// Typed API Response shapes
// ---------------------------------------------------------------------
export interface TicketApiResponse {
  success?: boolean;
  ticket?: {
    id: string;
    ticket_number: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    created_at: string;
    raised_by: string;
    assigned_to?: string;
    skill_group_code?: string;
    issue_code?: string;
    confidence?: string;
    classification_source?: string;
    risk_flag?: string | null;
    llm_reasoning?: string | null;
  };
  error?: string;
  classification?: {
    issue_code: string;
    skill_group: string;
    confidence: string;
    isAutoClassified: boolean;
    status: string;
    assigned_to?: string;
    priority?: string | null;
    risk_flag?: string | null;
    reasoning?: string | null;
    enhancedClassification?: boolean;
    zone?: string;
    decisionSource?: string;
  };
}

export interface TicketListResponse {
  tickets?: Ticket[];
  total?: number;
  error?: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  raised_by: string;
  assigned_to?: string;
  category?: { id: string; code: string; name: string };
  assignee?: { id: string; full_name: string; email: string; user_photo_url?: string };
  property?: { id: string; name: string; code: string };
  organization?: { id: string; name: string; code: string };
}

export interface SuperTenantProperty {
  id: string;
  property_id: string;
  organization_id: string;
  assigned_by: string;
  created_at: string;
  properties: {
    id: string;
    name: string;
    code: string;
    status: string;
  };
}

export interface SuperTenantResponse {
  properties?: SuperTenantProperty[];
  error?: string;
}

// ---------------------------------------------------------------------
// Internal fetch helper with Bearer token
// ---------------------------------------------------------------------
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Next.js backend uses @supabase/ssr which requires cookies for auth.
  // We simulate the web cookie using the session data.
  if (sessionData?.session) {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const projectIdMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (projectIdMatch) {
      const projectId = projectIdMatch[1];
      const cookieName = `sb-${projectId}-auth-token`;
      // @supabase/ssr expects JSON array with access_token & refresh_token
      const cookieValue = JSON.stringify([
        sessionData.session.access_token,
        sessionData.session.refresh_token,
        null,
        null,
        null
      ]);
      headers['Cookie'] = `${cookieName}=${encodeURIComponent(cookieValue)}`;
    }
  }

  const response = await fetch(`${WEB_API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API ${response.status}: ${body || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------
// Ticket API — mirrors POST /api/tickets from web app
// ---------------------------------------------------------------------
export interface CreateTicketInput {
  title?: string;
  description: string;
  propertyId: string;
  organizationId: string;
  priority?: 'low' | 'medium' | 'high' | 'critical' | 'urgent';
  isInternal?: boolean;
  assignedTo?: string;
}

export async function createTicket(input: CreateTicketInput): Promise<TicketApiResponse> {
  const body: Record<string, unknown> = {
    description: input.description,
    title: input.title,
    property_id: input.propertyId,
    organization_id: input.organizationId,
    is_internal: input.isInternal ?? false,
    priority: input.priority,
    assignedTo: input.assignedTo,
  };

  return apiFetch<TicketApiResponse>('/api/tickets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------
// Ticket list API — mirrors GET /api/tickets from web app
// ---------------------------------------------------------------------
export interface ListTicketsInput {
  propertyId?: string;
  organizationId?: string;
  status?: string;
  isInternal?: boolean;
  raisedBy?: string;
  raisedByRole?: string;
  limit?: number;
  offset?: number;
}

export async function listTickets(input: ListTicketsInput): Promise<TicketListResponse> {
  const params = new URLSearchParams();
  if (input.propertyId) params.set('property_id', input.propertyId);
  if (input.organizationId) params.set('organization_id', input.organizationId);
  if (input.status) params.set('status', input.status);
  if (input.isInternal !== undefined) params.set('isInternal', String(input.isInternal));
  if (input.raisedBy) params.set('raised_by', input.raisedBy);
  if (input.raisedByRole) params.set('raisedByRole', input.raisedByRole);
  if (input.limit !== undefined) params.set('limit', String(input.limit));
  if (input.offset !== undefined) params.set('offset', String(input.offset));

  const qs = params.toString();
  return apiFetch<TicketListResponse>(`/api/tickets${qs ? `?${qs}` : ''}`);
}

// ---------------------------------------------------------------------
// Super Tenant Properties API — mirrors GET /api/super-tenant from web app
// ---------------------------------------------------------------------
export async function getSuperTenantProperties(userId?: string): Promise<SuperTenantResponse> {
  const params = userId ? `?user_id=${userId}` : '';
  return apiFetch<SuperTenantResponse>(`/api/super-tenant${params}`);
}

// ---------------------------------------------------------------------
// Gamification / Leaderboard API — mirrors /api/mst/gamification/* from web app
// ---------------------------------------------------------------------
export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  name: string;
  photo_url: string | null;
  score: number;
  tickets_resolved: number;
  sla_met_count: number;
  first_time_fixes: number;
  streak_days: number;
  badges: Array<{
    code: string;
    name: string;
    icon: string;
    color: string;
    tier: string;
    earned_at: string;
  }>;
}

export interface LeaderboardResponse {
  period: 'daily' | 'weekly';
  score_date: string;
  leaderboard: LeaderboardEntry[];
  total: number;
  error?: string;
}

export interface GamificationBadge {
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  tier: string;
  points_bonus: number;
  earned_at: string;
}

export interface MyStatsResponse {
  property_id: string;
  user_id: string;
  today: {
    total_points: number;
    tickets_resolved: number;
    sla_met_count: number;
    first_time_fixes: number;
    avg_resolution_minutes: number | null;
    rank: number | null;
    total_in_rank: number;
  };
  all_time: {
    total_points: number;
    tickets_resolved: number;
    sla_met_count: number;
  };
  streak: {
    current: number;
    longest: number;
  };
  badges: GamificationBadge[];
  next_achievements: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    tier: string;
    criteria: Record<string, unknown>;
    points_bonus: number;
  }>;
  error?: string;
}

export async function getLeaderboard(propertyId: string, period = 'daily'): Promise<LeaderboardResponse> {
  try {
    const supabase = createClient();
    const today = new Date().toISOString().split('T')[0];
    const scoreDate = period === 'daily' ? today : (() => {
      const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0];
    })();

    const { data, error } = await supabase
      .from('mst_daily_scores')
      .select(`
        user_id,
        total_points,
        tickets_resolved,
        sla_met_count,
        first_time_fixes,
        streak_days,
        score_date,
        users!inner(full_name, user_photo_url)
      `)
      .eq('property_id', propertyId)
      .gte('score_date', scoreDate)
      .order('total_points', { ascending: false })
      .limit(20);

    if (error || !data) return { period: period as 'daily' | 'weekly', score_date: today, leaderboard: [], total: 0, error: error?.message };

    const leaderboard: LeaderboardEntry[] = data.map((row: any, idx: number) => ({
      rank: idx + 1,
      user_id: row.user_id,
      name: row.users?.full_name ?? 'Unknown',
      photo_url: row.users?.user_photo_url ?? null,
      score: row.total_points ?? 0,
      tickets_resolved: row.tickets_resolved ?? 0,
      sla_met_count: row.sla_met_count ?? 0,
      first_time_fixes: row.first_time_fixes ?? 0,
      streak_days: row.streak_days ?? 0,
      badges: [],
    }));

    return { period: period as 'daily' | 'weekly', score_date: today, leaderboard, total: leaderboard.length };
  } catch (err) {
    return { period: period as 'daily' | 'weekly', score_date: '', leaderboard: [], total: 0, error: String(err) };
  }
}

export async function getMyGamificationStats(propertyId: string): Promise<MyStatsResponse> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { property_id: propertyId, user_id: '', today: { total_points: 0, tickets_resolved: 0, sla_met_count: 0, first_time_fixes: 0, avg_resolution_minutes: null, rank: null, total_in_rank: 0 }, all_time: { total_points: 0, tickets_resolved: 0, sla_met_count: 0 }, streak: { current: 0, longest: 0 }, badges: [], next_achievements: [], error: 'Not authenticated' };

    const today = new Date().toISOString().split('T')[0];
    const { data: todayRow } = await supabase
      .from('mst_daily_scores')
      .select('*')
      .eq('property_id', propertyId)
      .eq('user_id', user.id)
      .eq('score_date', today)
      .maybeSingle();

    const { data: allTimeRows } = await supabase
      .from('mst_daily_scores')
      .select('total_points, tickets_resolved, sla_met_count')
      .eq('property_id', propertyId)
      .eq('user_id', user.id);

    const allTime = (allTimeRows ?? []).reduce((acc: any, r: any) => ({
      total_points: acc.total_points + (r.total_points ?? 0),
      tickets_resolved: acc.tickets_resolved + (r.tickets_resolved ?? 0),
      sla_met_count: acc.sla_met_count + (r.sla_met_count ?? 0),
    }), { total_points: 0, tickets_resolved: 0, sla_met_count: 0 });

    // Determine rank
    const { count: betterCount } = await supabase
      .from('mst_daily_scores')
      .select('user_id', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .eq('score_date', today)
      .gt('total_points', todayRow?.total_points ?? 0);
    const { count: totalCount } = await supabase
      .from('mst_daily_scores')
      .select('user_id', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .eq('score_date', today);

    return {
      property_id: propertyId,
      user_id: user.id,
      today: {
        total_points: todayRow?.total_points ?? 0,
        tickets_resolved: todayRow?.tickets_resolved ?? 0,
        sla_met_count: todayRow?.sla_met_count ?? 0,
        first_time_fixes: todayRow?.first_time_fixes ?? 0,
        avg_resolution_minutes: todayRow?.avg_resolution_minutes ?? null,
        rank: (betterCount ?? 0) + 1,
        total_in_rank: totalCount ?? 1,
      },
      all_time: allTime,
      streak: { current: todayRow?.streak_days ?? 0, longest: todayRow?.streak_days ?? 0 },
      badges: [],
      next_achievements: [],
    };
  } catch (err) {
    return { property_id: propertyId, user_id: '', today: { total_points: 0, tickets_resolved: 0, sla_met_count: 0, first_time_fixes: 0, avg_resolution_minutes: null, rank: null, total_in_rank: 0 }, all_time: { total_points: 0, tickets_resolved: 0, sla_met_count: 0 }, streak: { current: 0, longest: 0 }, badges: [], next_achievements: [], error: String(err) };
  }
}

// ---------------------------------------------------------------------
// Property Access Check — mirrors GET /api/auth/property-access from web app
// ---------------------------------------------------------------------
export interface PropertyAccessResponse {
  authorized: boolean;
  role?: string;
}

/**
 * Check property access directly via Supabase (mobile-native).
 * Mirrors the exact logic from saas_development/app/api/auth/property-access/route.ts
 * but executes via the mobile Supabase client instead of an HTTP call.
 *
 * Logic (exact match to web):
 * 1. Master admin bypass
 * 2. Org-level access (org_admin / org_super_admin / owner)
 * 3. Property-level membership (staff, tenant, etc.)
 *
 * @param propertyId - The property ID to check access for
 * @param userOverride - (optional) Pre-fetched user object. When provided, this is used
 *   instead of calling getSession/getUser internally. This is the PREFERRED way to call
 *   this function on mobile/Expo Go because the supabase singleton in mobileApi.ts may
 *   not share session state with the AuthContext client (separate AsyncStorage hydration).
 */
export async function checkPropertyAccess(
  propertyId: string,
  userOverride?: { id: string; email?: string } | null
): Promise<PropertyAccessResponse> {
  try {
    const supabase = createClient();

    // Get current user — prefer passed-in user (from AuthContext) to avoid session
    // hydration issues between the mobileApi singleton and AuthContext's client.
    let user = userOverride ?? null;
    if (!user) {
      console.log('[checkPropertyAccess] No userOverride — attempting getSession');
      const { data: sessionData } = await supabase.auth.getSession();
      user = sessionData?.session?.user ?? null;
    }
    console.log('[checkPropertyAccess] Acting user:', user?.email, 'id:', user?.id);
    if (!user) {
      console.log('[checkPropertyAccess] No user — returning unauthorized');
      return { authorized: false };
    }

    // 1. Check if master admin
    console.log('[checkPropertyAccess] Checking users table for:', user.id);
    const { data: userProfile, error: userError } = await supabase
      .from('users')
      .select('is_master_admin')
      .eq('id', user.id)
      .maybeSingle() as { data: { is_master_admin: boolean } | null; error: unknown };
    if (userError) console.error('[checkPropertyAccess] users table error:', userError);
    if (userProfile?.is_master_admin) {
      console.log('[checkPropertyAccess] Master admin confirmed');
      return { authorized: true, role: 'master_admin' };
    }

    // 2. Get property's organization
    console.log('[checkPropertyAccess] Checking properties table for:', propertyId);
    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('organization_id')
      .eq('id', propertyId)
      .maybeSingle() as { data: { organization_id: string } | null; error: unknown };
    if (propError) console.error('[checkPropertyAccess] properties table error:', propError);
    console.log('[checkPropertyAccess] Property org_id:', property?.organization_id);

    // 3. Org-level access check
    if (property?.organization_id) {
      console.log('[checkPropertyAccess] Checking org memberships for org:', property.organization_id, 'user:', user.id);
      const { data: orgMembership, error: orgError } = await supabase
        .from('organization_memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', property.organization_id)
        .eq('is_active', true)
        .maybeSingle() as { data: { role: string } | null; error: unknown };
      if (orgError) console.error('[checkPropertyAccess] org_memberships error:', orgError);
      console.log('[checkPropertyAccess] Org membership:', orgMembership);

      if (orgMembership && ['org_admin', 'org_super_admin', 'owner', 'admin'].includes(orgMembership.role)) {
        console.log('[checkPropertyAccess] Org-level access granted:', orgMembership.role);
        return { authorized: true, role: orgMembership.role };
      }

      // Super tenant: must have property in their portfolio
      if (orgMembership?.role === 'super_tenant') {
        const { data: stProp } = await supabase
          .from('super_tenant_properties')
          .select('id')
          .eq('user_id', user.id)
          .eq('property_id', propertyId)
          .eq('organization_id', property.organization_id)
          .maybeSingle();
        if (stProp) {
          console.log('[checkPropertyAccess] Super-tenant portfolio access granted');
          return { authorized: true, role: 'super_tenant' };
        }
      }
    }

    // 4. Property-level membership check
    console.log('[checkPropertyAccess] Checking property_memberships for:', user.id, 'property:', propertyId);
    const { data: propMembership, error: propMemError } = await supabase
      .from('property_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('property_id', propertyId)
      .or('is_active.eq.true,is_active.is.null')
      .maybeSingle() as { data: { role: string } | null; error: unknown };
    if (propMemError) console.error('[checkPropertyAccess] property_memberships error:', propMemError);
    console.log('[checkPropertyAccess] Property membership:', propMembership);

    if (propMembership) {
      console.log('[checkPropertyAccess] Property-level access granted:', propMembership.role);
      return { authorized: true, role: propMembership.role };
    }

    console.log('[checkPropertyAccess] No matching membership — returning unauthorized');
    return { authorized: false };
  } catch (err) {
    console.error('[checkPropertyAccess] Unexpected error:', err);
    return { authorized: false, role: 'unknown' };
  }
}

// ---------------------------------------------------------------------
// Role path helpers — mirrors getRoleAllowedPaths / getRoleDefaultPath from web
// ---------------------------------------------------------------------
import { CAPABILITY_MATRIX } from '@/constants/capabilities';

const PROPERTY_ADMIN_ROLES = [
  'property_admin',
  'org_admin',
  'org_super_admin',
  'master_admin',
  'owner',
];

/**
 * Build allowed paths from capability matrix so sidebar modules always match route access.
 * Every role gets /dashboard. Additional paths are added based on CAPABILITY_MATRIX domains.
 */
export function getRoleAllowedPaths(role: string, propertyId: string): string[] {
  const basePath = `/property/${propertyId}`;
  const capabilities = CAPABILITY_MATRIX[role as keyof typeof CAPABILITY_MATRIX] || {};
  const paths: string[] = [
    basePath,
    `${basePath}/dashboard`,
    `${basePath}/lovable-mst`,
    `${basePath}/lovable-admin`,
    `${basePath}/lovable-super-admin`,
    `${basePath}/tenant`,
  ];

  if (capabilities.tickets) {
    paths.push(`${basePath}/tickets`);
    paths.push(`${basePath}/flow-map`);
  }
  if (capabilities.users) paths.push(`${basePath}/users`);
  if (capabilities.visitors) paths.push(`${basePath}/visitors`);
  if (capabilities.properties) paths.push(`${basePath}/rooms`);
  if (capabilities.assets) {
    paths.push(`${basePath}/diesel`);
    paths.push(`${basePath}/electricity`);
  }
  if (capabilities.procurement || capabilities.stock) {
    paths.push(`${basePath}/stock`);
    paths.push(`${basePath}/stock/scan`);
  }
  if (capabilities.reports) paths.push(`${basePath}/reports`);
  if (capabilities.security) paths.push(`${basePath}/security`);
  if (capabilities.sop) paths.push(`${basePath}/checklist`);

  // Common pages every logged-in user can reach
  paths.push(`${basePath}/settings`, `${basePath}/profile`);

  // Admin-level roles get blanket access
  if (PROPERTY_ADMIN_ROLES.includes(role)) {
    return [`${basePath}`];
  }

  return paths;
}

export function getRoleDefaultPath(role: string, propertyId: string): string {
  const normalizedRole = (role ?? '').toLowerCase().trim();
  if (['mst', 'maintenance_staff', 'staff'].includes(normalizedRole)) {
    return `/property/${propertyId}/lovable-mst`;
  }
  if ([
    'property_admin', 'admin', 'manager', 'property manager',
    'property_manager', 'facility_manager', 'facility manager',
    'spoc', 'administrator'
  ].includes(normalizedRole)) {
    return `/property/${propertyId}/dashboard`;
  }
  if (['org_admin', 'org_super_admin', 'owner'].includes(normalizedRole)) {
    return `/property/${propertyId}/dashboard`;
  }
  if (['tenant', 'super_tenant'].includes(normalizedRole)) {
    return `/property/${propertyId}/tenant`;
  }
  if (normalizedRole === 'security') {
    return `/property/${propertyId}/security`;
  }
  return `/property/${propertyId}/lovable-mst`; // Fallback to Lovable MST
}

/**
 * Check if a role is an admin-level role (gets full sidebar dashboard access).
 */
export function isAdminRole(role: string): boolean {
  return PROPERTY_ADMIN_ROLES.includes(role);
}

// =============================================================================
// Reports API
// =============================================================================

export interface ReportKPIs {
  totalSnags: number;
  closedSnags: number;
  openSnags: number;
  closureRate: number;
}

export interface ChartDataSet {
  labels: string[];
  data: number[];
  open?: number[];
  closed?: number[];
}

export interface ExecutiveReportResponse {
  property: { id: string; name: string; code: string };
  allTimeTotal: number;
  prevMonth: { label: string; total: number; closed: number; open: number; closureRate: number };
  currMonth: { label: string; total: number; closed: number; open: number; closureRate: number };
  topCategories: { name: string; count: number }[];
  trends: {
    prev: number[];
    curr: number[];
  };
  error?: string;
}

export interface RequestsReportResponse {
  success: boolean;
  month: { value: string; label: string };
  property: { id: string; name: string; code: string; address?: string };
  kpis: ReportKPIs;
  charts: {
    floor: ChartDataSet;
    department: ChartDataSet;
  };
  tickets: SnagTicket[];
  error?: string;
}

export interface SnagTicket {
  id: string;
  ticketNumber: string;
  ticketNumberDisplay: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  floor: string | null;
  floorLabel: string;
  location: string | null;
  reportedDate: string;
  closedDate: string | null;
  spocName: string;
  spocEmail: string;
  assigneeName: string;
  beforePhoto: string | null;
  afterPhoto: string | null;
  internal: boolean;
}

export interface SnagReportResponse {
  success: boolean;
  import: { id: string; filename: string; createdAt: string; completedAt: string | null; totalRows: number; validRows: number };
  property: { id: string; name: string; code: string; address?: string };
  kpis: ReportKPIs;
  charts: {
    floor: ChartDataSet;
    department: ChartDataSet;
  };
  tickets: SnagTicket[];
  error?: string;
}

export async function getExecutiveReport(propertyId: string): Promise<ExecutiveReportResponse> {
  return apiFetch<ExecutiveReportResponse>(`/api/reports/executive-summary?propertyId=${propertyId}`);
}

export async function getRequestsReport(propertyId: string, month?: string, startDate?: string, endDate?: string): Promise<RequestsReportResponse> {
  const params = new URLSearchParams({ propertyId });
  if (month) params.set('month', month);
  if (startDate && endDate) {
    params.set('startDate', startDate);
    params.set('endDate', endDate);
  }

  return apiFetch<RequestsReportResponse>(`/api/reports/requests-report?${params.toString()}`);
}

export async function getSnagReport(importId: string): Promise<SnagReportResponse> {
  return apiFetch<SnagReportResponse>(`/api/reports/snag-report/${importId}`);
}

// =============================================================================
// Procurement / Material Request APIs — mirrors saas_one web app
// =============================================================================

export interface MaterialRequestItem {
  id?: string;
  name: string;
  quantity: number;
  unit_price?: number | null;
  total_price?: number | null;
  photo_url?: string | null;
  description?: string | null;
}

export interface MaterialRequest {
  id: string;
  ticket_id: string;
  property_id: string;
  organization_id: string;
  requested_by: string;
  assignee_uid?: string | null;
  items: MaterialRequestItem[];
  status: string;
  priority?: string;
  total_amount?: number | null;
  total_estimated_cost?: number;
  notes?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  escalated_by?: string | null;
  escalated_at?: string | null;
  approval_level?: number;
  target_approver_id?: string | null;
  target_approver_ids?: string[];
  target_approver_names?: string[];
  has_custom_items?: boolean;
  budget_type?: string;
  created_at: string;
  updated_at: string;
  ticket?: {
    ticket_number: string;
    title: string;
    floor_number?: string | null;
  };
  requester?: { full_name: string } | null;
  approver?: { full_name: string } | null;
  rejecter?: { full_name: string } | null;
  target_approver?: { full_name: string } | null;
  assignee?: { full_name: string } | null;
}

export interface MaterialRequestListResponse {
  requests?: MaterialRequest[];
  error?: string;
}

export async function listMaterialRequests(input: {
  propertyId?: string;
  organizationId?: string;
  ticketId?: string;
  approverId?: string;
}): Promise<MaterialRequest[]> {
  const supabase = createClient();
  let query = supabase
    .from('material_requests')
    .select('*, ticket:ticket_id(ticket_number, title, floor_number), requester:requested_by(full_name), approver:approved_by(full_name), rejecter:rejected_by(full_name), target_approver:target_approver_id(full_name), assignee:assignee_uid(full_name)')
    .order('created_at', { ascending: false });

  if (input.propertyId) query = query.eq('property_id', input.propertyId);
  if (input.organizationId) query = query.eq('organization_id', input.organizationId);
  if (input.ticketId) query = query.eq('ticket_id', input.ticketId);
  if (input.approverId) query = query.eq('target_approver_id', input.approverId);

  const { data, error } = await query;
  if (error) throw new Error(error.message ?? 'Failed to load material requests');
  return (data ?? []) as MaterialRequest[];
}

export async function getProcurementCatalogItems(input: {
  propertyId?: string;
  organizationId?: string;
  search?: string;
  category?: string;
}): Promise<any[]> {
  const supabase = createClient();
  let query = supabase
    .from('stock_items')
    .select('*')
    .order('name', { ascending: true });

  if (input.propertyId) query = query.eq('property_id', input.propertyId);
  if (input.organizationId) query = query.eq('organization_id', input.organizationId);
  if (input.search) query = query.ilike('name', `%${input.search}%`);
  if (input.category) query = query.eq('category', input.category);

  const { data, error } = await query;
  if (error) throw new Error(error.message ?? 'Failed to load procurement catalog');
  return data ?? [];
}

export async function getProcurementUsers(input: {
  propertyId?: string;
  organizationId?: string;
}): Promise<Array<{ id: string; full_name: string; email?: string; user_photo_url?: string; role?: string }>> {
  const supabase = createClient();

  if (input.propertyId) {
    const { data, error } = await supabase
      .from('property_memberships')
      .select('role, users:user_id(id, full_name, email, user_photo_url)')
      .eq('property_id', input.propertyId);
    if (error) throw new Error(error.message ?? 'Failed to load procurement users');
    return ((data ?? []).map((m: any) => ({ ...m.users, role: m.role })).filter((u: any) => u?.id));
  }

  if (input.organizationId) {
    const { data, error } = await supabase
      .from('organization_memberships')
      .select('role, users:user_id(id, full_name, email, user_photo_url)')
      .eq('organization_id', input.organizationId);
    if (error) throw new Error(error.message ?? 'Failed to load procurement users');
    return ((data ?? []).map((m: any) => ({ ...m.users, role: m.role })).filter((u: any) => u?.id));
  }

  return [];
}

/**
 * List material requests pending approval for a specific approver.
 * Mirrors GET /api/procurement/requests?approverId=<id>&propertyId=<id>
 */
export async function listPendingApprovals(
  approverId: string,
  propertyId?: string,
  organizationId?: string
): Promise<MaterialRequest[]> {
  return listMaterialRequests({ approverId, propertyId, organizationId });
}

/**
 * Approve, reject, or escalate a material request.
 * Mirrors PATCH /api/procurement/requests/<id>
 */
export async function updateMaterialRequestStatus(
  requestId: string,
  status: 'approved' | 'rejected' | 'escalated',
  notes?: string
): Promise<MaterialRequest> {
  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id ?? null;

  const updatePayload: Record<string, any> = { status };
  if (notes !== undefined) updatePayload.notes = notes;
  const now = new Date().toISOString();
  if (status === 'approved') { updatePayload.approved_by = userId; updatePayload.approved_at = now; }
  if (status === 'rejected') { updatePayload.rejected_by = userId; updatePayload.rejected_at = now; }
  if (status === 'escalated') { updatePayload.escalated_by = userId; updatePayload.escalated_at = now; }

  const { data, error } = await supabase
    .from('material_requests')
    .update(updatePayload)
    .eq('id', requestId)
    .select('*')
    .single();

  if (error) throw new Error(error.message ?? 'Failed to update material request');
  return data as MaterialRequest;
}

export async function createTicketMaterialRequest(
  ticketId: string,
  payload: {
    assignee_uid: string;
    items: Array<{ name: string; qty?: string; quantity?: number; notes?: string; description?: string; unit_price?: number | null }>;
  }
): Promise<{ success?: boolean; material_request?: MaterialRequest; error?: string }> {
  try {
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    // Fetch ticket to get property_id and organization_id
    const { data: ticket, error: tErr } = await supabase
      .from('tickets')
      .select('property_id, organization_id')
      .eq('id', ticketId)
      .single();
    if (tErr) throw new Error(tErr.message);

    const items: MaterialRequestItem[] = payload.items.map((i) => ({
      name: i.name,
      quantity: i.quantity ?? (i.qty ? parseInt(i.qty, 10) : 1),
      description: i.description ?? i.notes ?? null,
      unit_price: i.unit_price ?? null,
      total_price: null,
      photo_url: null,
    }));

    const totalAmount = items.reduce((s, i) => s + (i.unit_price ?? 0) * (i.quantity ?? 1), 0);

    const { data, error } = await supabase
      .from('material_requests')
      .insert({
        ticket_id: ticketId,
        property_id: ticket.property_id,
        organization_id: ticket.organization_id,
        requested_by: userId,
        assignee_uid: payload.assignee_uid,
        items,
        status: 'pending',
        total_amount: totalAmount || null,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message ?? 'Failed to create material request');
    return { success: true, material_request: data as MaterialRequest };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to create material request' };
  }
}

/**
 * Upload a photo for a ticket.
 * Mirrors POST /api/tickets/[id]/photos from web app
 */
export async function uploadTicketPhoto(
  ticketId: string,
  photoUri: string,
  type: 'before' | 'after' = 'before'
): Promise<{ success: boolean; url?: string; error?: string }> {
  const token = await getSupabaseToken();
  const formData = new FormData();

  // On mobile, we need to create a file-like object from the URI
  // Ensure the URI is properly formatted for fetch/FormData
  const cleanUri = Platform.OS === 'android' ? photoUri : photoUri.replace('file://', '');
  
  const filename = photoUri.split('/').pop() || 'photo.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const fileType = match ? `image/${match[1]}` : `image/jpeg`;

  formData.append('file', {
    uri: photoUri, // Keep original URI for React Native FormData
    name: filename,
    type: fileType,
  } as any);
  formData.append('type', type);

  console.log(`[uploadTicketPhoto] Uploading to ${WEB_API_BASE}/api/tickets/${ticketId}/photos`);
  
  try {
    const response = await fetch(`${WEB_API_BASE}/api/tickets/${ticketId}/photos`, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[uploadTicketPhoto] Server error:', response.status, body);
      return { success: false, error: body || response.statusText };
    }

    const json = await response.json();
    console.log('[uploadTicketPhoto] Success:', json);
    return json;
  } catch (err) {
    console.error('[uploadTicketPhoto] Network error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

// ---------------------------------------------------------------------
// User Management & Add Member APIs (Unified with saas_one web)
// ---------------------------------------------------------------------

export interface UserListResponse {
  users: Array<{
    id: string;
    full_name: string;
    email: string;
    user_photo_url?: string;
    propertyRole?: string;
    orgRole?: string;
    propertyName?: string;
    propertyId?: string;
    is_active: boolean;
    joined_at: string;
    phone?: string;
  }>;
}

export interface CreateUserRequest {
  email: string;
  password?: string;
  full_name: string;
  phone?: string;
  organization_id: string;
  role?: string;
  property_id?: string;
  specialization?: string;
  skills?: string[];
}

export interface CreateUserResponse {
  success?: boolean;
  message?: string;
  user?: {
    id: string;
    email: string;
    full_name: string;
    role: string;
  };
  error?: string;
}

/**
 * Fetch all users for an organization or property directly via Supabase.
 * Replaces the Vercel API call to avoid "Failed to fetch" on mobile.
 */
export async function fetchUsersList(orgId?: string, propertyId?: string): Promise<UserListResponse> {
  const supabase = createClient();
  try {
    if (propertyId) {
      const { data, error } = await (supabase as any)
        .from('property_memberships')
        .select('role, is_active, created_at, users:user_id(id, full_name, email, user_photo_url, phone)')
        .eq('property_id', propertyId);
      if (error) throw error;
      const users = (data || []).map((m: any) => ({
        id: m.users?.id,
        full_name: m.users?.full_name || 'Unknown',
        email: m.users?.email || '',
        user_photo_url: m.users?.user_photo_url,
        phone: m.users?.phone,
        propertyRole: m.role,
        propertyId,
        is_active: m.is_active ?? true,
        joined_at: m.created_at,
      })).filter((u: any) => u.id);
      return { users };
    }
    if (orgId) {
      const { data, error } = await (supabase as any)
        .from('organization_memberships')
        .select('role, is_active, created_at, users:user_id(id, full_name, email, user_photo_url, phone)')
        .eq('organization_id', orgId);
      if (error) throw error;
      const users = (data || []).map((m: any) => ({
        id: m.users?.id,
        full_name: m.users?.full_name || 'Unknown',
        email: m.users?.email || '',
        user_photo_url: m.users?.user_photo_url,
        phone: m.users?.phone,
        orgRole: m.role,
        is_active: m.is_active ?? true,
        joined_at: m.created_at,
      })).filter((u: any) => u.id);
      return { users };
    }
    return { users: [] };
  } catch (err: any) {
    console.error('[fetchUsersList] Supabase error:', err);
    return { users: [] };
  }
}

/**
 * Create a membership record for an existing user.
 * Note: Full user account creation (auth.admin.createUser) requires a backend.
 * This adds an existing user to a property/org membership.
 */
export async function createMemberUser(data: CreateUserRequest): Promise<CreateUserResponse> {
  const supabase = createClient();
  try {
    // Check if user exists by email
    const { data: existingUser, error: lookupError } = await (supabase as any)
      .from('users')
      .select('id, full_name, email')
      .eq('email', data.email.toLowerCase().trim())
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!existingUser) {
      return { success: false, error: 'User not found. Ask the user to sign up first, then add them here.' };
    }

    // Add to property membership if propertyId given
    if (data.property_id) {
      const { error: memError } = await (supabase as any)
        .from('property_memberships')
        .upsert({
          user_id: existingUser.id,
          property_id: data.property_id,
          organization_id: data.organization_id,
          role: data.role || 'staff',
          is_active: true,
          joined_at: new Date().toISOString(),
        }, { onConflict: 'user_id,property_id' });
      if (memError) throw memError;
    }

    // Always add to org membership
    const { error: orgMemError } = await (supabase as any)
      .from('organization_memberships')
      .upsert({
        user_id: existingUser.id,
        organization_id: data.organization_id,
        role: data.role || 'staff',
        is_active: true,
        joined_at: new Date().toISOString(),
      }, { onConflict: 'user_id,organization_id' });
    if (orgMemError) throw orgMemError;

    return {
      success: true,
      message: `${existingUser.full_name} added successfully`,
      user: { id: existingUser.id, email: existingUser.email, full_name: existingUser.full_name, role: data.role || 'staff' },
    };
  } catch (err: any) {
    console.error('[createMemberUser] Error:', err);
    return { success: false, error: err.message || 'Failed to add member' };
  }
}

export interface UpdateRoleRequest {
  userId: string;
  newRole: string;
  propertyId?: string;
  organizationId?: string;
  skills?: string[];
  oldRole?: string;
}

export interface UpdateRoleResponse {
  success?: boolean;
  error?: string;
}

/**
 * Update a user's role directly via Supabase.
 * Replaces the Vercel API call.
 */
export async function updateMemberRole(data: UpdateRoleRequest): Promise<UpdateRoleResponse> {
  const supabase = createClient();
  try {
    if (data.propertyId) {
      const { error } = await (supabase as any)
        .from('property_memberships')
        .update({ role: data.newRole })
        .eq('user_id', data.userId)
        .eq('property_id', data.propertyId);
      if (error) throw error;
    }
    if (data.organizationId) {
      const { error } = await (supabase as any)
        .from('organization_memberships')
        .update({ role: data.newRole })
        .eq('user_id', data.userId)
        .eq('organization_id', data.organizationId);
      if (error) throw error;
    }
    return { success: true };
  } catch (err: any) {
    console.error('[updateMemberRole] Error:', err);
    return { success: false, error: err.message || 'Failed to update role' };
  }
}

// ---------------------------------------------------------------------
// Meeting Room APIs
// ---------------------------------------------------------------------

export interface MeetingRoom {
  id: string;
  property_id: string;
  name: string;
  photo_url?: string;
  location?: string;
  capacity: number;
  size?: number;
  amenities?: string[];
  status: string;
  created_by?: string;
  created_at: string;
}

export interface MeetingRoomBooking {
  id: string;
  meeting_room_id: string;
  property_id: string;
  user_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  company_id?: string;
  organization_id?: string;
  created_at: string;
  meeting_room?: { name: string; photo_url?: string; location?: string };
  tenant?: { full_name: string; email: string };
}

export interface MeetingRoomCredit {
  id: string;
  property_id: string;
  user_id?: string;
  company_id?: string;
  assigned_by?: string;
  monthly_hours: number;
  remaining_hours: number;
  last_reset_at: string;
  next_reset_at: string;
  created_at: string;
  updated_at: string;
}

export async function getMeetingRooms(propertyId: string, status?: string): Promise<{ rooms?: MeetingRoom[]; error?: string }> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const res = await apiFetch<any>(`/api/meeting-rooms/available?propertyId=${propertyId}&date=${today}${status ? `&status=${status}` : ''}`);
    return { rooms: res.rooms as MeetingRoom[] };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getMeetingRoomBookings(propertyId: string, status?: string): Promise<{ bookings?: MeetingRoomBooking[]; error?: string }> {
  try {
    const res = await apiFetch<any>(`/api/meeting-room-bookings?propertyId=${propertyId}${status ? `&status=${status}` : ''}`);
    return { bookings: res.bookings as MeetingRoomBooking[] };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getMeetingRoomCredits(propertyId: string): Promise<{ credit?: MeetingRoomCredit | null; company?: { id: string; name: string; logo_url?: string } | null; error?: string }> {
  try {
    const res = await apiFetch<any>(`/api/meeting-room-credits?propertyId=${propertyId}`);
    return { credit: res.credit as MeetingRoomCredit | null, company: res.company || null };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function updateMeetingRoomCreditsApi(payload: any) {
  return apiFetch<any>('/api/meeting-room-credits', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateMeetingRoomRefillRequestApi(id: string, payload: any) {
  return apiFetch<any>(`/api/meeting-room-credits/refill-requests/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export interface CreateBookingInput {
  meetingRoomId: string;
  propertyId: string;
  date: string;      // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
}

export async function createMeetingRoomBooking(input: CreateBookingInput): Promise<{ success?: boolean; booking?: MeetingRoomBooking; error?: string }> {
  try {
    const res = await apiFetch<any>('/api/meeting-room-bookings', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return { success: true, booking: res.booking as MeetingRoomBooking };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function cancelMeetingRoomBookingApi(bookingId: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await apiFetch<any>(`/api/meeting-room-bookings/${bookingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' })
    });
    if (res.error) throw new Error(res.error);
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export interface CreateCompanyInput {
  name: string;
  property_id: string;
  organization_id: string;
  logo_url?: string;
}

export async function createCompanyApi(input: CreateCompanyInput): Promise<{ success?: boolean; company?: any; error?: string }> {
  try {
    const res = await apiFetch<any>('/api/companies', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return { success: true, company: res.company };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function manageCompanyMemberApi(companyId: string, userId: string, action: 'add' | 'remove'): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await apiFetch<any>(`/api/companies/${companyId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, action })
    });
    if (res.error) throw new Error(res.error);
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export interface CreateMeetingRoomInput {
  name: string;
  propertyId: string;
  location?: string;
  capacity: number;
  size?: number;
  amenities?: string[];
  photo_url?: string;
  status?: string;
}

export async function createMeetingRoomApi(input: CreateMeetingRoomInput): Promise<{ success?: boolean; room?: MeetingRoom; error?: string }> {
  try {
    const res = await apiFetch<any>('/api/meeting-rooms', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return { success: true, room: res.room as MeetingRoom };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function updateMeetingRoomApi(id: string, input: Partial<CreateMeetingRoomInput>): Promise<{ success?: boolean; room?: MeetingRoom; error?: string }> {
  try {
    const res = await apiFetch<any>(`/api/meeting-rooms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
    return { success: true, room: res.room as MeetingRoom };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function deleteMeetingRoomApi(id: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await apiFetch<any>(`/api/meeting-rooms/${id}`, {
      method: 'DELETE',
    });
    if (res.error) throw new Error(res.error);
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function uploadMeetingRoomPhoto(photoUri: string): Promise<{ success?: boolean; url?: string; error?: string }> {
  const token = await getSupabaseToken();
  const formData = new FormData();
  const filename = photoUri.split('/').pop() || 'photo.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const fileType = match ? `image/${match[1]}` : `image/jpeg`;

  formData.append('file', {
    uri: photoUri,
    name: filename,
    type: fileType,
  } as any);

  try {
    const response = await fetch(`${WEB_API_BASE}/api/meeting-rooms/photos`, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { success: false, error: body || response.statusText };
    }

    const json = await response.json();
    return { success: true, url: json.url };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function getChecklistDataApi(propertyId: string) {
  return apiFetch<any>(`/api/checklist?propertyId=${propertyId}`);
}
export async function getChecklistTemplateCompletionsApi(propertyId: string, templateId: string, limit?: number) {
  return apiFetch<any>(`/api/checklist/template-completions?propertyId=${propertyId}&templateId=${templateId}${limit ? `&limit=${limit}` : ''}`);
}
export async function createChecklistTemplateApi(payload: any) {
  return apiFetch<any>('/api/checklist/templates', { method: 'POST', body: JSON.stringify(payload) });
}
export async function startChecklistCompletionApi(payload: any) {
  return apiFetch<any>('/api/checklist/completions', { method: 'POST', body: JSON.stringify(payload) });
}
export async function updateChecklistCompletionApi(id: string, payload: any) {
  return apiFetch<any>(`/api/checklist/completions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
export async function updateChecklistTemplateApi(id: string, payload: any) {
  return apiFetch<any>(`/api/checklist/templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
export async function uploadChecklistMediaApi(formData: FormData) {
  return apiFetch<any>('/api/checklist/media', { method: 'POST', body: formData });
}
export async function deleteChecklistMediaApi(type: string, url: string, completionId?: string) {
  return apiFetch<any>('/api/checklist/media', { method: 'DELETE', body: JSON.stringify({ type, url, completionId }) });
}

export async function getPpmDataApi(propertyId: string) {
  return apiFetch<any>(`/api/ppm?propertyId=${propertyId}`);
}
export async function createPpmScheduleApi(payload: any) {
  return apiFetch<any>('/api/ppm', { method: 'POST', body: JSON.stringify(payload) });
}
export async function updatePpmStatusApi(payload: any) {
  return apiFetch<any>('/api/ppm/status', { method: 'PATCH', body: JSON.stringify(payload) });
}
export async function uploadPpmMediaApi(formData: FormData) {
  return apiFetch<any>('/api/ppm/media', { method: 'POST', body: formData });
}
export async function deletePpmMediaApi(payload: any) {
  return apiFetch<any>('/api/ppm/media', { method: 'DELETE', body: JSON.stringify(payload) });
}

export async function getCompaniesWithCreditsApi(propertyId: string) {
  return apiFetch<any>(`/api/companies?propertyId=${propertyId}`);
}
