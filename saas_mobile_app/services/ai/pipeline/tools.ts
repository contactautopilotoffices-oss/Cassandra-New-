/**
 * Tool Layer — validated Supabase tool implementations for the voice pipeline.
 */

import { supabase } from '@/utils/supabase/client';
import { serverApi } from '@/lib/serverApi';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const $ = supabase as unknown as any;

// ---------------------------------------------------------------------------
// Tool result types
// ---------------------------------------------------------------------------
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Ticket tools
// ---------------------------------------------------------------------------
export async function listTicketsTool(
  propertyId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const limit = Number(params.limit ?? 10);
    const status = params.status as string | undefined;

    let query = supabase
      .from('tickets')
      .select('id, ticket_number, title, status, priority, created_at')
      .eq('property_id', propertyId)
      .eq('is_internal', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return { success: true, data: data ?? [] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function getTicketStatusTool(
  propertyId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const ticketId = params.ticket_id as string | undefined;
    const status = params.status as string | undefined;

    let query = supabase
      .from('tickets')
      .select('id, ticket_number, title, status, priority, created_at')
      .eq('property_id', propertyId)
      .eq('is_internal', false)
      .order('created_at', { ascending: false });

    if (ticketId) {
      query = query.eq('id', ticketId).limit(1);
    } else if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return { success: true, data: data ?? [] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function createTicketTool(
  propertyId: string,
  organizationId: string,
  userId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const title = String(params.title ?? 'Voice-created ticket').slice(0, 200);
    const description = String(params.description ?? '');
    const priority = String(params.priority ?? 'medium') as 'low' | 'medium' | 'high' | 'critical';

    const { count } = await supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('property_id', propertyId);

    const ticketNum = `TKT-${String((count ?? 0) + 1).padStart(4, '0')}`;

    const { data, error } = await $
      .from('tickets')
      .insert({
        ticket_number: ticketNum,
        title,
        description,
        priority,
        status: 'open',
        raised_by: userId,
        property_id: propertyId,
        organization_id: organizationId,
      })
      .select('id, ticket_number')
      .single();

    if (error) throw new Error(error.message);

    return { success: true, data: { id: data.id, ticket_number: data.ticket_number } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Meeting room tools
// ---------------------------------------------------------------------------
export async function listRoomsTool(
  propertyId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const capacity = Number(params.capacity ?? 0);

    let query = supabase
      .from('meeting_rooms')
      .select('id, name, capacity, location, status')
      .eq('property_id', propertyId)
      .eq('status', 'active');

    if (capacity > 0) query = query.gte('capacity', capacity);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return { success: true, data: data ?? [] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function bookRoomTool(
  propertyId: string,
  userId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const roomId = params.room_id as string;
    const date = String(params.date ?? new Date().toISOString().split('T')[0]);
    const startTime = String(params.start_time ?? '09:00');
    const endTime = String(params.end_time ?? '10:00');

    if (!roomId) return { success: false, error: 'Room ID is required' };

    const bookingDateTime = new Date(`${date}T${startTime}`);
    if (bookingDateTime < new Date()) {
      return { success: false, error: 'Cannot book for a past date/time' };
    }

    const { data: overlaps, error: overlapError } = await supabase
      .from('meeting_room_bookings')
      .select('id')
      .eq('meeting_room_id', roomId)
      .eq('booking_date', date)
      .eq('status', 'confirmed')
      .lt('start_time', endTime)
      .gt('end_time', startTime);

    if (overlapError) throw new Error(overlapError.message);
    if (overlaps && overlaps.length > 0) {
      return { success: false, error: 'Room is already booked for this time slot' };
    }

    const { data, error } = await $
      .from('meeting_room_bookings')
      .insert({
        meeting_room_id: roomId,
        property_id: propertyId,
        user_id: userId,
        booking_date: date,
        start_time: startTime,
        end_time: endTime,
        status: 'confirmed',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Visitor tools
// ---------------------------------------------------------------------------
export async function listVisitorsTool(
  propertyId: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const limit = Number(params.limit ?? 5);

    const { data, error } = await $
      .from('visitor_logs')
      .select('id, name, host_name, check_in_time, check_out_time, purpose')
      .eq('property_id', propertyId)
      .order('check_in_time', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    return { success: true, data: data ?? [] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Property info tool
// ---------------------------------------------------------------------------
export async function getPropertyInfoTool(propertyId: string): Promise<ToolResult> {
  try {
    const { data, error } = await $
      .from('properties')
      .select('name, address')
      .eq('id', propertyId)
      .single();

    if (error) throw new Error(error.message);

    const [{ count: openCount }, { count: totalCount }] = await Promise.all([
      serverApi.query({
        table: 'tickets',
        action: 'select',
        select: '*',
        selectOptions: { count: 'exact', head: true },
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }, { op: 'eq', column: 'is_internal', value: false }, { op: 'not', column: 'status', operator: 'in', value: '(resolved,closed)' }],
      }),
      serverApi.query({
        table: 'tickets',
        action: 'select',
        select: '*',
        selectOptions: { count: 'exact', head: true },
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }, { op: 'eq', column: 'is_internal', value: false }],
      }),
    ]);

    return {
      success: true,
      data: {
        ...(data as Record<string, unknown>),
        openTicketCount: openCount ?? 0,
        totalTicketCount: totalCount ?? 0,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
