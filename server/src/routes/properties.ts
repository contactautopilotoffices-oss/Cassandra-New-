import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../utils/supabase.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Property {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  status?: string;
  code?: string;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const PropertyQuerySchema = z.object({
  organizationId: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const propertyRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /properties — list properties with filters
  fastify.get('/properties', async (request, reply) => {
    try {
      const { organizationId, status, search, limit, offset } = PropertyQuerySchema.parse(request.query);
      const supabase = request.supabase ?? supabaseAdmin;

      let sbQuery = supabase.from('properties').select('*', { count: 'exact' });

      if (organizationId) sbQuery = sbQuery.eq('organization_id', organizationId);
      if (status) sbQuery = sbQuery.eq('status', status);
      if (search) sbQuery = sbQuery.ilike('name', `%${search}%`);

      sbQuery = sbQuery
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      const { data, error, count } = await sbQuery;

      if (error) {
        fastify.log.error(`[PROPERTIES] Query failed: ${error.message}`);
        reply.status(500);
        return { error: 'query_failed', message: error.message };
      }

      return {
        data: (data as Property[]) || [],
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

  // GET /properties/:id — single property
  fastify.get('/properties/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const supabase = request.supabase ?? supabaseAdmin;

    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      fastify.log.error(`[PROPERTIES] Get by id failed: ${error.message}`);
      reply.status(500);
      return { error: 'query_failed', message: error.message };
    }

    if (!data) {
      reply.status(404);
      return { error: 'not_found', message: `Property ${id} not found` };
    }

    return { data: data as Property };
  });

  // POST /properties — create property
  fastify.post('/properties', async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1).max(255),
      organization_id: z.string().min(1),
      type: z.enum(['residential', 'commercial', 'industrial', 'mixed_use', 'coworking']).default('commercial'),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      code: z.string().optional(),
    });

    try {
      const parsed = schema.parse(request.body);
      const supabase = request.supabase ?? supabaseAdmin;

      const newProperty = {
        ...parsed,
        status: 'active',
        image_url: null,
      };

      const { data, error } = await supabase
        .from('properties')
        .insert(newProperty)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[PROPERTIES] Insert failed: ${error.message}`);
        reply.status(500);
        return { error: 'insert_failed', message: error.message };
      }

      reply.status(201);
      return { data: data as Property };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // GET /properties/:id/features — get property features from organization
  fastify.get('/properties/:id/features', async (request, reply) => {
    const { id } = request.params as { id: string };
    const supabase = request.supabase ?? supabaseAdmin;

    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('organization_id')
      .eq('id', id)
      .maybeSingle();

    if (propError) {
      fastify.log.error(`[PROPERTIES] Features query failed: ${propError.message}`);
      reply.status(500);
      return { error: 'query_failed', message: propError.message };
    }

    if (!property) {
      reply.status(404);
      return { error: 'not_found', message: `Property ${id} not found` };
    }

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('available_modules')
      .eq('id', property.organization_id)
      .maybeSingle();

    if (orgError) {
      fastify.log.error(`[PROPERTIES] Organization query failed: ${orgError.message}`);
      reply.status(500);
      return { error: 'query_failed', message: orgError.message };
    }

    const modules = org?.available_modules as string[] | undefined;

    if (modules && Array.isArray(modules)) {
      return {
        data: modules.map((m: string) => ({ module: m, enabled: true })),
      };
    }

    return {
      data: [
        { module: 'tickets', enabled: true },
        { module: 'visitors', enabled: true },
        { module: 'sop', enabled: true },
        { module: 'stock', enabled: true },
        { module: 'meeting_rooms', enabled: true },
      ],
    };
  });
};
