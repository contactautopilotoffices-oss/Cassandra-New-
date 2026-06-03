// ============================================
// Ticket Service — routes through mobile server
// ============================================

import { serverApi } from '@/lib/serverApi';
import { createClient } from '@/utils/supabase/client';
import { getCurrentUserId as getCurrentUserIdFromApi } from '@/utils/api/mobileApi';
import { Ticket, TicketStatus, TicketPriority, TicketComment } from '@/types';

export interface CreateTicketData {
  title: string;
  description?: string;
  category: string;
  subcategory?: string;
  priority: TicketPriority;
  propertyId: string;
  organizationId: string;
  assignedTo?: string;
  photoBeforeUrl?: string;
}

export interface UpdateTicketData {
  title?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string;
  category?: string;
  subcategory?: string;
}

export interface TicketFilters {
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  assignedTo?: string;
  createdBy?: string;
  propertyId?: string;
  organizationId?: string;
  category?: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: Error | string | null;
  status: number;
}

async function getCurrentUserId(): Promise<string> {
  const userId = await getCurrentUserIdFromApi();
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function mapError(error: unknown, defaultMsg: string): Promise<Error> {
  if (error instanceof Error) return error;
  return new Error(defaultMsg);
}

export const ticketService = {
  // Get all tickets with filters
  async getTickets(
    filters?: TicketFilters,
    options?: {
      orderBy?: string;
      ascending?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<ApiResponse<Ticket[]>> {
    try {
      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;

      const queryFilters: any[] = [];
      if (filters?.propertyId) queryFilters.push({ op: 'eq', column: 'property_id', value: filters.propertyId });
      if (filters?.organizationId) queryFilters.push({ op: 'eq', column: 'organization_id', value: filters.organizationId });
      if (filters?.assignedTo) queryFilters.push({ op: 'eq', column: 'assigned_to', value: filters.assignedTo });
      if (filters?.createdBy) queryFilters.push({ op: 'eq', column: 'raised_by', value: filters.createdBy });
      if (filters?.category) queryFilters.push({ op: 'eq', column: 'category', value: filters.category });
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          queryFilters.push({ op: 'in', column: 'status', values: filters.status });
        } else {
          queryFilters.push({ op: 'eq', column: 'status', value: filters.status });
        }
      }

      const res = await serverApi.query<Ticket[]>({
        table: 'tickets',
        action: 'select',
        select: 'id, title, description, status, priority, category, property_id, organization_id, raised_by, assigned_to, created_at, updated_at, resolved_at, photo_before_url, photo_after_url',
        filters: queryFilters,
        orders: [{ column: options?.orderBy ?? 'created_at', ascending: options?.ascending ?? false }],
        limit,
        offset,
      });
      if (res.error) throw new Error(res.error.message ?? 'Failed to fetch tickets');
      return { data: res.data ?? [], error: null, status: 200 };
    } catch (error) {
      return { data: null, error: await mapError(error, 'Failed to fetch tickets'), status: 500 };
    }
  },

  // Get single ticket
  async getTicket(id: string): Promise<ApiResponse<Ticket>> {
    try {
      const res = await serverApi.query<Ticket>({
        table: 'tickets',
        action: 'select',
        select: '*, raised_by_user:raised_by(full_name), assigned_to_user:assigned_to(full_name), comments:ticket_comments(*)',
        filters: [{ op: 'eq', column: 'id', value: id }],
        maybeSingle: true,
      });
      if (res.error) throw new Error(res.error.message);
      if (!res.data) throw new Error('Ticket not found');
      return { data: res.data as Ticket, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: await mapError(error, 'Failed to fetch ticket'), status: 500 };
    }
  },

  // Create ticket
  async createTicket(data: CreateTicketData): Promise<ApiResponse<Ticket>> {
    try {
      const userId = await getCurrentUserId();
      const res = await serverApi.query<Ticket>({
        table: 'tickets',
        action: 'insert',
        values: {
          title: data.title,
          description: data.description,
          category: data.category,
          subcategory: data.subcategory,
          priority: data.priority,
          status: 'open',
          property_id: data.propertyId,
          organization_id: data.organizationId,
          assigned_to: data.assignedTo,
          raised_by: userId,
          photo_before_url: data.photoBeforeUrl,
        },
        single: true,
      });
      if (res.error) throw new Error(res.error.message ?? 'Failed to create ticket');
      return { data: res.data ?? null, error: null, status: 201 };
    } catch (error) {
      return { data: null, error: await mapError(error, 'Failed to create ticket'), status: 500 };
    }
  },

  // Update ticket
  async updateTicket(id: string, data: UpdateTicketData): Promise<ApiResponse<Ticket>> {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.priority !== undefined) updateData.priority = data.priority;
      if (data.assignedTo !== undefined) updateData.assigned_to = data.assignedTo;
      if (data.category !== undefined) updateData.category = data.category;
      if (data.subcategory !== undefined) updateData.subcategory = data.subcategory;
      updateData.updated_at = new Date().toISOString();
      if (data.status === 'resolved') updateData.resolved_at = new Date().toISOString();

      const res = await serverApi.query<Ticket>({
        table: 'tickets',
        action: 'update',
        values: updateData,
        filters: [{ op: 'eq', column: 'id', value: id }],
        single: true,
      });
      if (res.error) throw new Error(res.error.message ?? 'Failed to update ticket');
      return { data: res.data ?? null, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: await mapError(error, 'Failed to update ticket'), status: 500 };
    }
  },

  // Delete ticket
  async deleteTicket(id: string): Promise<ApiResponse<Ticket>> {
    try {
      const res = await serverApi.query({
        table: 'tickets',
        action: 'delete',
        filters: [{ op: 'eq', column: 'id', value: id }],
      });
      if (res.error) throw new Error(res.error.message ?? 'Failed to delete ticket');
      return { data: null, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: await mapError(error, 'Failed to delete ticket'), status: 500 };
    }
  },

  // Assign ticket
  async assignTicket(id: string, assignedTo: string): Promise<ApiResponse<Ticket>> {
    return this.updateTicket(id, { assignedTo });
  },

  // Update ticket status
  async updateStatus(id: string, status: TicketStatus): Promise<ApiResponse<Ticket>> {
    return this.updateTicket(id, { status });
  },

  // Bulk assign tickets
  async bulkAssign(ticketIds: string[], assignedTo: string): Promise<ApiResponse<void>> {
    try {
      const res = await serverApi.query({
        table: 'tickets',
        action: 'update',
        values: { assigned_to: assignedTo, updated_at: new Date().toISOString() },
        filters: [{ op: 'in', column: 'id', values: ticketIds }],
      });
      if (res.error) throw new Error(res.error.message ?? 'Bulk assign failed');
      return { data: null, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: await mapError(error, 'Bulk assign failed'), status: 500 };
    }
  },

  // Get ticket comments
  async getComments(ticketId: string): Promise<ApiResponse<TicketComment[]>> {
    try {
      const res = await serverApi.query<TicketComment[]>({
        table: 'ticket_comments',
        action: 'select',
        select: '*, user:users(full_name, user_photo_url)',
        filters: [{ op: 'eq', column: 'ticket_id', value: ticketId }],
        orders: [{ column: 'created_at', ascending: true }],
      });
      if (res.error) throw new Error(res.error.message ?? 'Failed to fetch comments');
      return { data: res.data ?? [], error: null, status: 200 };
    } catch (error) {
      return { data: null, error: await mapError(error, 'Failed to fetch comments'), status: 500 };
    }
  },

  // Add comment
  async addComment(ticketId: string, content: string, isInternal: boolean = false): Promise<ApiResponse<TicketComment>> {
    try {
      const userId = await getCurrentUserId();
      const res = await serverApi.query<TicketComment>({
        table: 'ticket_comments',
        action: 'insert',
        values: {
          ticket_id: ticketId,
          user_id: userId,
          comment: content,
          is_internal: isInternal,
        },
        single: true,
      });
      if (res.error) throw new Error(res.error.message ?? 'Failed to add comment');
      return { data: res.data ?? null, error: null, status: 201 };
    } catch (error) {
      return { data: null, error: await mapError(error, 'Failed to add comment'), status: 500 };
    }
  },

  // Get tickets by status (for Kanban)
  async getTicketsByStatus(status: TicketStatus, propertyId?: string): Promise<ApiResponse<Ticket[]>> {
    return this.getTickets({ status, propertyId });
  },

  // Get ticket statistics
  async getTicketStats(organizationId?: string, propertyId?: string): Promise<ApiResponse<{ open: number; in_progress: number; resolved: number; closed: number; total: number }>> {
    try {
      const filters: any[] = [];
      if (propertyId) filters.push({ op: 'eq', column: 'property_id', value: propertyId });
      if (organizationId) filters.push({ op: 'eq', column: 'organization_id', value: organizationId });

      const res = await serverApi.query<{ status: string }[]>({
        table: 'tickets',
        action: 'select',
        select: 'status',
        selectOptions: { count: 'exact' },
        filters,
      });
      if (res.error) throw new Error(res.error.message ?? 'Failed to fetch stats');

      const stats = { open: 0, in_progress: 0, resolved: 0, closed: 0, total: res.count ?? 0 };
      res.data?.forEach((t) => {
        if (t.status in stats) (stats as any)[t.status]++;
      });
      return { data: stats, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: await mapError(error, 'Failed to fetch stats'), status: 500 };
    }
  },

  // Subscribe to ticket changes (realtime — kept on direct Supabase)
  subscribeToTicketChanges(ticketId: string, callback: (payload: unknown) => void) {
    const supabase = createClient();
    return supabase
      .channel(`ticket-${ticketId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `id=eq.${ticketId}` }, callback)
      .subscribe();
  },

  // Subscribe to all tickets (realtime — kept on direct Supabase)
  subscribeToAllTickets(callback: (payload: unknown) => void) {
    const supabase = createClient();
    return supabase
      .channel('tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, callback)
      .subscribe();
  },
};

export default ticketService;
