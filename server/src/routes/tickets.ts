import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../utils/supabase.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Ticket {
  id: string;
  property_id: string;
  organization_id: string;
  raised_by: string;
  title: string;
  description: string | null;
  category_id: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  is_internal: boolean;
  photo_before_url: string | null;
  photo_after_url: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  comment: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Schemas (Zod only — no Fastify JSON Schema for body/querystring)
// ---------------------------------------------------------------------------

const TicketQuerySchema = z.object({
  propertyId: z.string().optional(),
  status: z.string().optional(),
  orgId: z.string().optional(),
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateTicketSchema = z.object({
  property_id: z.string().min(1),
  organization_id: z.string().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  category_id: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  is_internal: z.boolean().default(false),
  // FIX C0-11: Accept photo_before_url from Cassandra orchestrator (mobile upload)
  photo_before_url: z.string().url().optional().nullable(),
});

const CreateCommentSchema = z.object({
  comment: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Plugin — wired to Supabase (real data, not in-memory)
// ---------------------------------------------------------------------------

export const ticketRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /tickets
  fastify.get('/tickets', async (request, reply) => {
    try {
      const { propertyId, status, orgId, limit, offset } = TicketQuerySchema.parse(request.query);

      let sbQuery = supabaseAdmin.from('tickets').select('*', { count: 'exact' });

      if (orgId) sbQuery = sbQuery.eq('organization_id', orgId);
      if (propertyId) sbQuery = sbQuery.eq('property_id', propertyId);
      if (status) sbQuery = sbQuery.eq('status', status);

      sbQuery = sbQuery
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      const { data, error, count } = await sbQuery;

      if (error) {
        fastify.log.error(`[TICKETS] Query failed: ${error.message}`);
        reply.status(500);
        return { error: 'query_failed', message: error.message };
      }

      return {
        data: (data as Ticket[]) || [],
        total: count || 0,
        limit,
        offset,
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // GET /tickets/:id
  fastify.get('/tickets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { data, error } = await supabaseAdmin
      .from('tickets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      fastify.log.error(`[TICKETS] Get by id failed: ${error.message}`);
      reply.status(500);
      return { error: 'query_failed', message: error.message };
    }
    if (!data) {
      reply.status(404);
      return { error: 'not_found', message: `Ticket ${id} not found` };
    }
    return { data: data as Ticket };
  });

  // POST /tickets
  fastify.post('/tickets', async (request, reply) => {
    try {
      const parsed = CreateTicketSchema.parse(request.body);

      // Resolve organization_id from property if not provided
      let orgId = parsed.organization_id;
      if (!orgId) {
        const { data: prop } = await supabaseAdmin
          .from('properties')
          .select('organization_id')
          .eq('id', parsed.property_id)
          .maybeSingle();
        orgId = prop?.organization_id;
      }

      if (!orgId) {
        reply.status(400);
        return {
          error: 'missing_org_id',
          message: 'organization_id is required, or the property does not exist',
        };
      }

      const newTicket = {
        property_id: parsed.property_id,
        organization_id: orgId,
        title: parsed.title,
        description: parsed.description ?? null,
        category_id: parsed.category_id ?? null,
        priority: parsed.priority,
        status: 'open' as const,
        is_internal: parsed.is_internal,
        photo_before_url: parsed.photo_before_url ?? null,
        photo_after_url: null,
        assigned_to: null,
        raised_by: 'dev_user_id', // TODO: extract from authenticated user context
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from('tickets')
        .insert(newTicket)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[TICKETS] Insert failed: ${error.message}`);
        reply.status(500);
        return { error: 'insert_failed', message: error.message };
      }

      reply.status(201);
      return { data: data as Ticket };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // POST /tickets/:id/comments
  fastify.post('/tickets/:id/comments', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { comment } = CreateCommentSchema.parse(request.body);

      // Verify ticket exists
      const { data: ticket } = await supabaseAdmin
        .from('tickets')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (!ticket) {
        reply.status(404);
        return { error: 'not_found', message: `Ticket ${id} not found` };
      }

      const newComment = {
        ticket_id: id,
        user_id: 'dev_user_id', // TODO: extract from authenticated user context
        comment,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from('ticket_comments')
        .insert(newComment)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[TICKETS] Comment insert failed: ${error.message}`);
        reply.status(500);
        return { error: 'insert_failed', message: error.message };
      }

      return { data };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });
};
