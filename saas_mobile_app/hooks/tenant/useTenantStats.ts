'use client';
import { useMemo } from 'react';

interface TenantStats {
  open: number;
  total: number;
  critical: number;
  completion: number;
}

export function useTenantStats(tickets: { status: string; priority: string }[]): TenantStats {
  return useMemo(() => {
    const open = tickets.filter((t) => !['resolved', 'closed'].includes(t.status?.toLowerCase())).length;
    const total = tickets.length;
    const critical = tickets.filter(
      (t) => t.priority?.toLowerCase() === 'critical' && !['resolved', 'closed'].includes(t.status?.toLowerCase())
    ).length;
    const completed = tickets.filter((t) => ['resolved', 'closed'].includes(t.status?.toLowerCase())).length;
    const completion = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { open, total, critical, completion };
  }, [tickets]);
}
