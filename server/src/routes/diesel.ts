import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../utils/supabase.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Generator {
  id: string;
  property_id: string;
  name: string;
  make: string | null;
  capacity_kva: number | null;
  tank_capacity_litres: number | null;
  status: string;
  initial_run_hours: number | null;
  initial_kwh_reading: number | null;
  initial_diesel_level: number | null;
  effective_from_date: string | null;
  created_at: string;
}

interface DieselReading {
  id: string;
  property_id: string;
  generator_id: string;
  reading_date: string;
  opening_hours: number;
  closing_hours: number;
  opening_kwh: number | null;
  closing_kwh: number | null;
  opening_diesel_level: number;
  closing_diesel_level: number;
  diesel_added_litres: number;
  computed_consumed_litres: number | null;
  computed_run_hours: number | null;
  computed_cost: number | null;
  tariff_id: string | null;
  tariff_rate_used: number | null;
  notes: string | null;
  alert_status: string | null;
  created_by: string | null;
  created_at: string;
}

interface DGTariff {
  id: string;
  generator_id: string;
  cost_per_litre: number;
  effective_from: string;
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const GeneratorQuerySchema = z.object({
  propertyId: z.string().min(1),
});

const CreateGeneratorSchema = z.object({
  property_id: z.string().min(1),
  name: z.string().min(1).max(255),
  make: z.string().optional().nullable(),
  capacity_kva: z.coerce.number().optional().nullable(),
  tank_capacity_litres: z.coerce.number().optional().nullable(),
  status: z.string().optional().nullable(),
  initial_run_hours: z.coerce.number().optional().nullable(),
  initial_kwh_reading: z.coerce.number().optional().nullable(),
  initial_diesel_level: z.coerce.number().optional().nullable(),
  effective_from_date: z.string().optional().nullable(),
});

const UpdateGeneratorSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  make: z.string().optional().nullable(),
  capacity_kva: z.coerce.number().optional().nullable(),
  tank_capacity_litres: z.coerce.number().optional().nullable(),
  status: z.string().optional().nullable(),
  initial_run_hours: z.coerce.number().optional().nullable(),
  initial_kwh_reading: z.coerce.number().optional().nullable(),
  initial_diesel_level: z.coerce.number().optional().nullable(),
  effective_from_date: z.string().optional().nullable(),
});

const ReadingQuerySchema = z.object({
  propertyId: z.string().min(1),
  generatorId: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.coerce.number().int().positive().default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateReadingSchema = z.object({
  property_id: z.string().min(1),
  generator_id: z.string().min(1),
  reading_date: z.string().min(1),
  opening_hours: z.coerce.number(),
  closing_hours: z.coerce.number(),
  opening_kwh: z.coerce.number().optional().nullable(),
  closing_kwh: z.coerce.number().optional().nullable(),
  opening_diesel_level: z.coerce.number(),
  closing_diesel_level: z.coerce.number(),
  diesel_added_litres: z.coerce.number(),
  notes: z.string().optional().nullable(),
});

const TariffQuerySchema = z.object({
  generatorId: z.string().min(1),
});

const CreateTariffSchema = z.object({
  generator_id: z.string().min(1),
  cost_per_litre: z.coerce.number().positive(),
  effective_from: z.string().min(1),
  effective_to: z.string().optional().nullable(),
});

const UpdateTariffSchema = z.object({
  cost_per_litre: z.coerce.number().positive().optional(),
  effective_from: z.string().optional(),
  effective_to: z.string().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const dieselRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // ── GET /diesel/generators ────────────────────────────────────────────────
  fastify.get('/diesel/generators', async (request, reply) => {
    try {
      const { propertyId } = GeneratorQuerySchema.parse(request.query);

      const { data, error } = await supabaseAdmin
        .from('generators')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false });

      if (error) {
        fastify.log.error(`[DIESEL] Generators query failed: ${error.message}`);
        reply.status(500);
        return { error: 'query_failed', message: error.message };
      }

      return { data: (data as Generator[]) || [] };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── POST /diesel/generators ───────────────────────────────────────────────
  fastify.post('/diesel/generators', async (request, reply) => {
    try {
      const parsed = CreateGeneratorSchema.parse(request.body);

      const { data, error } = await supabaseAdmin
        .from('generators')
        .insert(parsed)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[DIESEL] Generator insert failed: ${error.message}`);
        reply.status(500);
        return { error: 'insert_failed', message: error.message };
      }

      reply.status(201);
      return { data: data as Generator };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── GET /diesel/generators/:id ────────────────────────────────────────────
  fastify.get('/diesel/generators/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const { data, error } = await supabaseAdmin
      .from('generators')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      fastify.log.error(`[DIESEL] Get generator failed: ${error.message}`);
      reply.status(500);
      return { error: 'query_failed', message: error.message };
    }
    if (!data) {
      reply.status(404);
      return { error: 'not_found', message: `Generator ${id} not found` };
    }

    return { data: data as Generator };
  });

  // ── PUT /diesel/generators/:id ────────────────────────────────────────────
  fastify.put('/diesel/generators/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const parsed = UpdateGeneratorSchema.parse(request.body);

      const updatePayload = Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => v !== undefined)
      );

      if (Object.keys(updatePayload).length === 0) {
        reply.status(400);
        return { error: 'validation_error', message: 'No fields to update' };
      }

      const { data, error } = await supabaseAdmin
        .from('generators')
        .update({ ...updatePayload, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[DIESEL] Generator update failed: ${error.message}`);
        reply.status(500);
        return { error: 'update_failed', message: error.message };
      }

      return { data: data as Generator };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── DELETE /diesel/generators/:id ─────────────────────────────────────────
  fastify.delete('/diesel/generators/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const { error } = await supabaseAdmin
      .from('generators')
      .delete()
      .eq('id', id);

    if (error) {
      fastify.log.error(`[DIESEL] Generator delete failed: ${error.message}`);
      reply.status(500);
      return { error: 'delete_failed', message: error.message };
    }

    return { data: true };
  });

  // ── GET /diesel/readings ──────────────────────────────────────────────────
  fastify.get('/diesel/readings', async (request, reply) => {
    try {
      const { propertyId, generatorId, fromDate, toDate, limit, offset } = ReadingQuerySchema.parse(
        request.query
      );

      let query = supabaseAdmin
        .from('diesel_readings')
        .select('*', { count: 'exact' })
        .eq('property_id', propertyId)
        .range(offset, offset + limit - 1)
        .order('reading_date', { ascending: false });

      if (generatorId) query = query.eq('generator_id', generatorId);
      if (fromDate) query = query.gte('reading_date', fromDate);
      if (toDate) query = query.lte('reading_date', toDate);

      const { data, error, count } = await query;

      if (error) {
        fastify.log.error(`[DIESEL] Readings query failed: ${error.message}`);
        reply.status(500);
        return { error: 'query_failed', message: error.message };
      }

      return {
        data: (data as DieselReading[]) || [],
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

  // ── POST /diesel/readings ─────────────────────────────────────────────────
  fastify.post('/diesel/readings', async (request, reply) => {
    try {
      const parsed = CreateReadingSchema.parse(request.body);
      const computed_run_hours = parsed.closing_hours - parsed.opening_hours;
      const computed_consumed_litres =
        parsed.opening_diesel_level + parsed.diesel_added_litres - parsed.closing_diesel_level;

      const newReading = {
        property_id: parsed.property_id,
        generator_id: parsed.generator_id,
        reading_date: parsed.reading_date,
        opening_hours: parsed.opening_hours,
        closing_hours: parsed.closing_hours,
        opening_kwh: parsed.opening_kwh ?? null,
        closing_kwh: parsed.closing_kwh ?? null,
        opening_diesel_level: parsed.opening_diesel_level,
        closing_diesel_level: parsed.closing_diesel_level,
        diesel_added_litres: parsed.diesel_added_litres,
        computed_run_hours,
        computed_consumed_litres,
        notes: parsed.notes ?? null,
      };

      const { data, error } = await supabaseAdmin
        .from('diesel_readings')
        .insert(newReading)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[DIESEL] Reading insert failed: ${error.message}`);
        reply.status(500);
        return { error: 'insert_failed', message: error.message };
      }

      reply.status(201);
      return { data: data as DieselReading };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── GET /diesel/tariffs ───────────────────────────────────────────────────
  fastify.get('/diesel/tariffs', async (request, reply) => {
    try {
      const { generatorId } = TariffQuerySchema.parse(request.query);

      const { data, error } = await supabaseAdmin
        .from('dg_tariffs')
        .select('*')
        .eq('generator_id', generatorId)
        .order('effective_from', { ascending: false });

      if (error) {
        fastify.log.error(`[DIESEL] Tariffs query failed: ${error.message}`);
        reply.status(500);
        return { error: 'query_failed', message: error.message };
      }

      return { data: (data as DGTariff[]) || [] };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── POST /diesel/tariffs ──────────────────────────────────────────────────
  fastify.post('/diesel/tariffs', async (request, reply) => {
    try {
      const parsed = CreateTariffSchema.parse(request.body);

      // Close any existing active tariff for the same generator
      if (parsed.generator_id && parsed.effective_from) {
        const prevDate = new Date(parsed.effective_from);
        prevDate.setDate(prevDate.getDate() - 1);
        await supabaseAdmin
          .from('dg_tariffs')
          .update({ effective_to: prevDate.toISOString().split('T')[0] })
          .eq('generator_id', parsed.generator_id)
          .is('effective_to', null);
      }

      const { data, error } = await supabaseAdmin
        .from('dg_tariffs')
        .insert(parsed)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[DIESEL] Tariff insert failed: ${error.message}`);
        reply.status(500);
        return { error: 'insert_failed', message: error.message };
      }

      reply.status(201);
      return { data: data as DGTariff };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── PUT /diesel/tariffs/:id ───────────────────────────────────────────────
  fastify.put('/diesel/tariffs/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const parsed = UpdateTariffSchema.parse(request.body);

      const updatePayload = Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => v !== undefined)
      );

      if (Object.keys(updatePayload).length === 0) {
        reply.status(400);
        return { error: 'validation_error', message: 'No fields to update' };
      }

      const { data, error } = await supabaseAdmin
        .from('dg_tariffs')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[DIESEL] Tariff update failed: ${error.message}`);
        reply.status(500);
        return { error: 'update_failed', message: error.message };
      }

      return { data: data as DGTariff };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── DELETE /diesel/tariffs/:id ────────────────────────────────────────────
  fastify.delete('/diesel/tariffs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Fetch the tariff to know its generator before deleting
    const { data: tariff } = await supabaseAdmin
      .from('dg_tariffs')
      .select('generator_id')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from('dg_tariffs')
      .delete()
      .eq('id', id);

    if (error) {
      fastify.log.error(`[DIESEL] Tariff delete failed: ${error.message}`);
      reply.status(500);
      return { error: 'delete_failed', message: error.message };
    }

    // Re-open the most recent previous tariff for the same generator
    if (tariff?.generator_id) {
      const { data: prev } = await supabaseAdmin
        .from('dg_tariffs')
        .select('id')
        .eq('generator_id', tariff.generator_id)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prev?.id) {
        await supabaseAdmin
          .from('dg_tariffs')
          .update({ effective_to: null })
          .eq('id', prev.id);
      }
    }

    return { data: true };
  });
};
