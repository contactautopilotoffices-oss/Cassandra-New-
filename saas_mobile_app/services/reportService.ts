import { serverApi } from '@/lib/serverApi';
import { getCurrentUserId } from '@/utils/api/mobileApi';
import type { DashboardStats } from '@/types';
import { ApiResponse } from '@/types';
export type { DashboardStats } from '@/types';

export const reportService = {
  getDashboardStats,
  getTicketStats,
};

type TicketStatus = 'open' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' | 'escalated';
type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

interface TicketStats {
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<TicketPriority, number>;
  total: number;
}

async function resolveOrgId(_userId: string): Promise<string | null> {
  const res = await serverApi.query<{ organization_id: string }>({
    table: 'organization_memberships',
    action: 'select',
    select: 'organization_id',
    single: true,
  });
  return res.data?.organization_id ?? null;
}

async function resolvePropertyIdForOrg(orgId: string): Promise<string | null> {
  const res = await serverApi.query<{ id: string }>({
    table: 'properties',
    action: 'select',
    select: 'id',
    filters: [{ op: 'eq', column: 'organization_id', value: orgId }],
    single: true,
  });
  return res.data?.id ?? null;
}

export async function getDashboardStats(propertyId?: string): Promise<ApiResponse<DashboardStats>> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: 'User not authenticated' };

    let orgId: string | null = null;
    let resolvedPropertyId: string | null = propertyId ?? null;

    if (!propertyId) {
      orgId = await resolveOrgId(userId);
      if (!orgId) return { data: null, error: 'No organization found' };
      resolvedPropertyId = await resolvePropertyIdForOrg(orgId);
    }

    // --- Ticket count ---
    const ticketFilters: any[] = [];
    if (resolvedPropertyId) ticketFilters.push({ op: 'eq', column: 'property_id', value: resolvedPropertyId });
    else if (orgId) ticketFilters.push({ op: 'eq', column: 'organization_id', value: orgId });

    const ticketRes = await serverApi.query<{ id: string }>({
      table: 'tickets',
      action: 'select',
      select: 'id',
      selectOptions: { count: 'exact', head: true },
      filters: ticketFilters,
    });
    const ticketCount = ticketRes.count;

    // Tickets by status
    const ticketStatusFilters: any[] = [];
    if (resolvedPropertyId) ticketStatusFilters.push({ op: 'eq', column: 'property_id', value: resolvedPropertyId });
    else if (orgId) ticketStatusFilters.push({ op: 'eq', column: 'organization_id', value: orgId });

    const ticketStatusRes = await serverApi.query<{ status: string }>({
      table: 'tickets',
      action: 'select',
      select: 'status',
      filters: ticketStatusFilters,
    });
    const ticketRows = ticketStatusRes.data;

    const ticketsByStatus = ((ticketRows as { status: string }[] | null) ?? []).reduce((acc: Record<string, number>, t: any) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Resolved today
    const todayStr = new Date().toISOString().split('T')[0];
    const resolvedTodayFilters: any[] = [
      { op: 'in', column: 'status', values: ['resolved', 'closed'] },
      { op: 'gte', column: 'updated_at', value: `${todayStr}T00:00:00.000Z` },
    ];
    if (resolvedPropertyId) resolvedTodayFilters.push({ op: 'eq', column: 'property_id', value: resolvedPropertyId });
    else if (orgId) resolvedTodayFilters.push({ op: 'eq', column: 'organization_id', value: orgId });

    const resolvedTodayRes = await serverApi.query<{ id: string }>({
      table: 'tickets',
      action: 'select',
      select: 'id',
      selectOptions: { count: 'exact', head: true },
      filters: resolvedTodayFilters,
    });
    const resolvedToday = resolvedTodayRes.count;

    // --- Visitor count (today) ---
    const visitorFilters: any[] = [{ op: 'gte', column: 'checkin_time', value: `${todayStr}T00:00:00.000Z` }];
    if (resolvedPropertyId) visitorFilters.push({ op: 'eq', column: 'property_id', value: resolvedPropertyId });

    const visitorRes = await serverApi.query<{ id: string; status: string }>({
      table: 'visitor_logs',
      action: 'select',
      select: 'id, status',
      selectOptions: { count: 'exact' },
      filters: visitorFilters,
    });
    const visitorRows = visitorRes.data;
    const visitorTotal = visitorRes.count;

    const visitors = {
      today: visitorTotal ?? 0,
      total: visitorTotal ?? 0,
      checkedIn: ((visitorRows as { id: string; status: string }[] | null) ?? []).filter((v: any) => v.status === 'checked_in').length,
    };

    // --- Stock count ---
    const stockFilters: any[] = [];
    if (resolvedPropertyId) stockFilters.push({ op: 'eq', column: 'property_id', value: resolvedPropertyId });

    const stockRes = await serverApi.query<{ id: string }>({
      table: 'stock_items',
      action: 'select',
      select: 'id',
      selectOptions: { count: 'exact', head: true },
      filters: stockFilters,
    });
    const stockCount = stockRes.count;

    // --- User count ---
    const userFilters: any[] = [];
    if (resolvedPropertyId) userFilters.push({ op: 'eq', column: 'property_id', value: resolvedPropertyId });

    const userRes = await serverApi.query<{ id: string }>({
      table: 'property_memberships',
      action: 'select',
      select: 'id',
      selectOptions: { count: 'exact', head: true },
      filters: userFilters,
    });
    const userCount = userRes.count;

    const stats: DashboardStats = {
      tickets: {
        total: ticketCount ?? 0,
        open: ticketsByStatus['open'] ?? 0,
        inProgress: ticketsByStatus['in_progress'] ?? 0,
        resolved: ticketsByStatus['resolved'] ?? 0,
        closed: ticketsByStatus['closed'] ?? 0,
      },
      visitors,
      stock: { total: stockCount ?? 0, lowStock: 0, outOfStock: 0 },
      users: { total: userCount ?? 0, active: userCount ?? 0 },
      resolvedToday: resolvedToday ?? 0,
      avgResolutionTime: 0,
      slaCompliance: 100,
    };

    return { data: stats, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { data: null, error: message };
  }
}

export async function getTicketStats(propertyId?: string): Promise<ApiResponse<TicketStats>> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: 'User not authenticated' };

    let orgId: string | null = null;
    let resolvedPropertyId: string | null = propertyId ?? null;

    if (!propertyId) {
      orgId = await resolveOrgId(userId);
      if (!orgId) return { data: null, error: 'No organization found' };
      resolvedPropertyId = await resolvePropertyIdForOrg(orgId);
    }

    const ticketFilters: any[] = [];
    if (resolvedPropertyId) ticketFilters.push({ op: 'eq', column: 'property_id', value: resolvedPropertyId });
    else if (orgId) ticketFilters.push({ op: 'eq', column: 'organization_id', value: orgId });

    const res = await serverApi.query<{ status: string; priority: string }>({
      table: 'tickets',
      action: 'select',
      select: 'status, priority',
      filters: ticketFilters,
    });
    if (res.error) return { data: null, error: res.error.message };

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    for (const row of (res.data as { status: string; priority: string }[] | null) ?? []) {
      if (row.status) byStatus[row.status] = (byStatus[row.status] || 0) + 1;
      if (row.priority) byPriority[row.priority] = (byPriority[row.priority] || 0) + 1;
    }

    const stats: TicketStats = {
      byStatus: byStatus as Record<TicketStatus, number>,
      byPriority: byPriority as Record<TicketPriority, number>,
      total: ((res.data as { status: string; priority: string }[] | null) ?? []).length,
    };

    return { data: stats, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { data: null, error: message };
  }
}
