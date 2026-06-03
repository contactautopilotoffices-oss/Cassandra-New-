'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { listTickets } from '@/utils/api/mobileApi';

export interface Ticket {
  id: string;
  ticket_number?: string;
  title?: string;
  description?: string;
  status: string;
  priority: string;
  created_at: string;
  raised_by?: string;
  assigned_to?: string;
  assignee?: { full_name?: string; user_photo_url?: string };
}

export function useTenantTickets(propertyId: string | undefined, userId: string | undefined) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchTickets = useCallback(async () => {
    if (!propertyId) {
      console.log('[useTenantTickets] No propertyId — skipping fetch');
      setLoading(false);
      return;
    }

    console.log('[useTenantTickets] Fetching via API for propertyId:', propertyId);
    setLoading(true);
    setError(null);

    try {
      const res = await listTickets({ propertyId });
      
      // Filter out internal tickets as this is the tenant view
      const tenantTickets = (res.tickets || []).filter((t: any) => t.is_internal === false);
      
      setTickets(tenantTickets as Ticket[]);
    } catch (err: any) {
      console.error('[useTenantTickets] Failed to fetch tickets:', err);
      setError(err.message || 'Failed to fetch tickets');
    }

    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Real-time subscription
  useEffect(() => {
    if (!propertyId) return;

    const channelName = `tenant_tickets_${propertyId}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `property_id=eq.${propertyId}`,
        },
        () => {
          fetchTickets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [propertyId, supabase, fetchTickets]);

  const stats = useMemo(() => {
    const open = tickets.filter((t) => !['resolved', 'closed'].includes(t.status?.toLowerCase())).length;
    const total = tickets.length;
    const critical = tickets.filter((t) => t.priority?.toLowerCase() === 'critical' && t.status !== 'resolved' && t.status !== 'closed').length;
    const completed = tickets.filter((t) => ['resolved', 'closed'].includes(t.status?.toLowerCase())).length;
    const completion = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { open, total, critical, completion };
  }, [tickets]);

  return { tickets, loading, error, stats, refetch: fetchTickets };
}
