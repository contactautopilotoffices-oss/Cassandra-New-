import { serverApi } from '@/lib/serverApi';
import { ApiResponse } from '@/types';
import type { Visitor, VisitorStatus } from '@/types';

// ---------------------------------------------------------------------------
// Date Filter Helpers
// ---------------------------------------------------------------------------

export type DateFilter = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export interface VisitorLog {
  id: string;
  visitor_id: string;
  name: string;
  mobile?: string;
  category: string;
  whom_to_meet: string;
  coming_from?: string;
  purpose?: string;
  photo_url?: string;
  checkin_time: string;
  checkout_time?: string;
  status: string;
}

export interface HostResult {
  id: string;
  name: string;
  full_name?: string;
  email?: string;
  role?: string;
}

export interface VisitorStats {
  total_today: number;
  checked_in: number;
  checked_out: number;
}

// ---------------------------------------------------------------------------
// VMS Service — routes through saas_mobile_server
// ---------------------------------------------------------------------------

function getDateRange(dateFilter?: DateFilter, customDate?: string): { from?: string; to?: string } {
  const now = new Date();
  // Work in local date — IST binding is handled by callers using date strings
  const todayStr = now.toISOString().split('T')[0];

  if (!dateFilter || dateFilter === 'today') {
    return { from: `${todayStr}T00:00:00.000Z`, to: `${todayStr}T23:59:59.999Z` };
  }
  if (dateFilter === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const ys = y.toISOString().split('T')[0];
    return { from: `${ys}T00:00:00.000Z`, to: `${ys}T23:59:59.999Z` };
  }
  if (dateFilter === 'week') {
    const w = new Date(now);
    w.setDate(w.getDate() - 7);
    return { from: w.toISOString(), to: now.toISOString() };
  }
  if (dateFilter === 'month') {
    const m = new Date(now);
    m.setMonth(m.getMonth() - 1);
    return { from: m.toISOString(), to: now.toISOString() };
  }
  if (dateFilter === 'custom' && customDate) {
    return { from: `${customDate}T00:00:00.000Z`, to: `${customDate}T23:59:59.999Z` };
  }
  return {};
}

export const vmsService = {
  // ── Fetch Visitors ────────────────────────────────────────────────────────
  async fetchVisitors(
    propertyId: string,
    options?: {
      dateFilter?: DateFilter;
      customDate?: string;
      status?: VisitorStatus | 'all';
      search?: string;
    }
  ): Promise<ApiResponse<{ visitors: VisitorLog[]; stats: VisitorStats }>> {
    try {
      const { from, to } = getDateRange(options?.dateFilter, options?.customDate);

      const filters: any[] = [
        { op: 'eq', column: 'property_id', value: propertyId },
      ];
      if (from) filters.push({ op: 'gte', column: 'checkin_time', value: from });
      if (to) filters.push({ op: 'lte', column: 'checkin_time', value: to });
      if (options?.status && options.status !== 'all') {
        filters.push({ op: 'eq', column: 'status', value: options.status });
      }
      if (options?.search) {
        filters.push({ op: 'ilike', column: 'name', value: `%${options.search}%` });
      }

      const { data, error } = await serverApi.query<VisitorLog[]>({
        table: 'visitor_logs',
        action: 'select',
        select: '*',
        filters,
        orders: [{ column: 'checkin_time', ascending: false }],
      });
      if (error) throw new Error(error.message);

      const visitors = (data ?? []) as VisitorLog[];

      // Compute stats from returned rows (today window)
      const todayStr = new Date().toISOString().split('T')[0];
      const todayVisitors = visitors.filter((v) => v.checkin_time?.startsWith(todayStr));
      const stats: VisitorStats = {
        total_today: todayVisitors.length,
        checked_in: todayVisitors.filter((v) => v.status === 'checked_in').length,
        checked_out: todayVisitors.filter((v) => v.status === 'checked_out').length,
      };

      return {
        success: true,
        data: { visitors, stats },
        status: 200,
      };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Fetch Visitor Stats ───────────────────────────────────────────────────
  async fetchStats(propertyId: string): Promise<ApiResponse<VisitorStats>> {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const { data, error } = await serverApi.query<Array<{ status: string; checkin_time: string }>>({
        table: 'visitor_logs',
        action: 'select',
        select: 'status, checkin_time',
        filters: [
          { op: 'eq', column: 'property_id', value: propertyId },
          { op: 'gte', column: 'checkin_time', value: `${todayStr}T00:00:00.000Z` },
          { op: 'lte', column: 'checkin_time', value: `${todayStr}T23:59:59.999Z` },
        ],
      });

      if (error) throw new Error(error.message);

      const rows = data ?? [];
      const stats: VisitorStats = {
        total_today: rows.length,
        checked_in: rows.filter((r: any) => r.status === 'checked_in').length,
        checked_out: rows.filter((r: any) => r.status === 'checked_out').length,
      };

      return { success: true, data: stats, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Check In ──────────────────────────────────────────────────────────────
  async checkIn(payload: {
    propertyId: string;
    name: string;
    mobile?: string;
    category: string;
    whom_to_meet: string;
    whom_to_meet_uid?: string;
    coming_from?: string;
    purpose?: string;
    photo_url?: string;
  }): Promise<ApiResponse<{ visitor: Visitor; visitorId: string }>> {
    try {
      const { data, error } = await serverApi.query<Visitor>({
        table: 'visitor_logs',
        action: 'insert',
        values: {
          property_id: payload.propertyId,
          name: payload.name,
          mobile: payload.mobile ?? null,
          category: payload.category,
          whom_to_meet: payload.whom_to_meet,
          whom_to_meet_uid: payload.whom_to_meet_uid ?? null,
          coming_from: payload.coming_from ?? null,
          purpose: payload.purpose ?? null,
          photo_url: payload.photo_url ?? null,
          status: 'checked_in',
          checkin_time: new Date().toISOString(),
        },
        select: '*',
        single: true,
      });

      if (error) throw new Error(error.message);
      return { success: true, data: { visitor: data as any, visitorId: (data as any).id }, status: 201 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Check Out ─────────────────────────────────────────────────────────────
  async checkOut(visitorId: string, _propertyId: string): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await serverApi.query<unknown>({
        table: 'visitor_logs',
        action: 'update',
        values: { status: 'checked_out', checkout_time: new Date().toISOString() },
        filters: [{ op: 'eq', column: 'id', value: visitorId }],
      });

      if (error) throw new Error(error.message);
      return { success: true, data: true, status: 200 };
    } catch (err: any) {
      return { success: false, data: false, error: err.message, status: 500 };
    }
  },

  // ── Force Check Out (admin) ───────────────────────────────────────────────
  async forceCheckout(
    visitorLogId: string,
    _propertyId: string,
    _reason?: string
  ): Promise<ApiResponse<{ visitor: VisitorLog }>> {
    try {
      const { data, error } = await serverApi.query<VisitorLog>({
        table: 'visitor_logs',
        action: 'update',
        values: { status: 'checked_out', checkout_time: new Date().toISOString() },
        filters: [{ op: 'eq', column: 'id', value: visitorLogId }],
        select: '*',
        single: true,
      });

      if (error) throw new Error(error.message);
      return { success: true, data: { visitor: data as VisitorLog }, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Search Hosts ──────────────────────────────────────────────────────────
  async searchHosts(propertyId: string, query: string): Promise<ApiResponse<HostResult[]>> {
    try {
      // Find property members whose name matches the search query
      const { data, error } = await serverApi.query<any[]>({
        table: 'property_memberships',
        action: 'select',
        select: 'users:user_id(id, full_name, email, role)',
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
        limit: 20,
      });

      if (error) throw new Error(error.message);

      const lq = query.toLowerCase();
      const hosts = (data ?? [])
        .map((m: any) => m.users)
        .filter((u: any) => u && (u.full_name?.toLowerCase().includes(lq) || u.email?.toLowerCase().includes(lq)))
        .map((h: any) => ({
          id: h.id,
          name: h.full_name || 'Unknown',
          full_name: h.full_name || 'Unknown',
          email: h.email || '',
          role: h.role || '',
        }));

      return { success: true, data: hosts, status: 200 };
    } catch (err: any) {
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Upload Photo ──────────────────────────────────────────────────────────
  async uploadPhoto(
    uri: string,
    visitorId: string,
    _propertyId: string
  ): Promise<ApiResponse<string>> {
    try {
      const fileRes = await fetch(uri);
      const blob = await fileRes.blob();
      const path = `visitor-photos/${visitorId}.jpg`;

      const { error: uploadError } = await serverApi.upload('visitor-photos', path, blob, 'image/jpeg');

      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = await serverApi.getPublicUrl('visitor-photos', path);

      return { success: true, data: urlData?.publicUrl ?? '', status: 201 };
    } catch (err: any) {
      return { success: false, data: '', error: err.message, status: 500 };
    }
  },
};
