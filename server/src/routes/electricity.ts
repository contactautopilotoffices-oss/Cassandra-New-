import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../utils/supabase.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ElectricityMeter {
  id: string;
  property_id: string;
  name: string;
  meter_number: string | null;
  meter_type: 'main' | 'generator' | 'solar' | 'sub';
  max_load_kw: number | null;
  status: string | null;
  last_reading: number | null;
  created_at: string;
  updated_at: string;
}

interface ElectricityReading {
  id: string;
  property_id: string;
  meter_id: string;
  reading_date: string;
  opening_reading: number;
  closing_reading: number;
  computed_units: number | null;
  final_units: number | null;
  computed_cost: number | null;
  multiplier_id: string | null;
  multiplier_value_used: number | null;
  tariff_id: string | null;
  tariff_rate_used: number | null;
  peak_load_kw: number | null;
  notes: string | null;
  alert_status: string | null;
  photo_url: string | null;
  ocr_reading: number | null;
  ocr_confidence: number | null;
  ocr_status: string | null;
  created_by: string | null;
  created_at: string;
  meter?: ElectricityMeter;
}

interface GridTariff {
  id: string;
  property_id: string;
  utility_provider: string | null;
  rate_per_unit: number;
  unit_type: string | null;
  effective_from: string;
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
}

interface MeterMultiplier {
  id: string;
  meter_id: string;
  ct_ratio_primary: number | null;
  ct_ratio_secondary: number | null;
  pt_ratio_primary: number | null;
  pt_ratio_secondary: number | null;
  meter_constant: number | null;
  multiplier_value: number | null;
  effective_from: string;
  effective_to: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const MeterQuerySchema = z.object({
  propertyId: z.string().min(1),
});

const CreateMeterSchema = z.object({
  property_id: z.string().min(1),
  name: z.string().min(1).max(255),
  meter_number: z.string().optional().nullable(),
  meter_type: z.enum(['main', 'generator', 'solar', 'sub']).default('main'),
  max_load_kw: z.coerce.number().optional().nullable(),
  status: z.string().optional().nullable(),
  initial_multiplier: z.object({
    ct_ratio_primary: z.coerce.number().optional().nullable(),
    ct_ratio_secondary: z.coerce.number().optional().nullable(),
    pt_ratio_primary: z.coerce.number().optional().nullable(),
    pt_ratio_secondary: z.coerce.number().optional().nullable(),
    meter_constant: z.coerce.number().optional().nullable(),
    multiplier_value: z.coerce.number().optional().nullable(),
    effective_from: z.string(),
    reason: z.string().optional().nullable(),
  }).optional(),
});

const UpdateMeterSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  meter_number: z.string().optional().nullable(),
  meter_type: z.enum(['main', 'generator', 'solar', 'sub']).optional(),
  max_load_kw: z.coerce.number().optional().nullable(),
  status: z.string().optional().nullable(),
  last_reading: z.coerce.number().optional().nullable(),
});

const ReadingQuerySchema = z.object({
  propertyId: z.string().min(1),
  meterId: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.coerce.number().int().positive().default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateReadingSchema = z.object({
  property_id: z.string().min(1),
  meter_id: z.string().min(1),
  reading_date: z.string().min(1),
  opening_reading: z.coerce.number(),
  closing_reading: z.coerce.number(),
  notes: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  created_by: z.string().optional().nullable(),
});

const TariffQuerySchema = z.object({
  propertyId: z.string().min(1),
});

const CreateTariffSchema = z.object({
  property_id: z.string().min(1),
  utility_provider: z.string().optional().nullable(),
  rate_per_unit: z.coerce.number().positive(),
  unit_type: z.string().optional().nullable(),
  effective_from: z.string().min(1),
  effective_to: z.string().optional().nullable(),
});

const UpdateTariffSchema = z.object({
  utility_provider: z.string().optional().nullable(),
  rate_per_unit: z.coerce.number().positive().optional(),
  unit_type: z.string().optional().nullable(),
  effective_from: z.string().optional(),
  effective_to: z.string().optional().nullable(),
});

const MultiplierQuerySchema = z.object({
  meterId: z.string().min(1),
});

const CreateMultiplierSchema = z.object({
  meter_id: z.string().min(1),
  ct_ratio_primary: z.coerce.number().optional().nullable(),
  ct_ratio_secondary: z.coerce.number().optional().nullable(),
  pt_ratio_primary: z.coerce.number().optional().nullable(),
  pt_ratio_secondary: z.coerce.number().optional().nullable(),
  meter_constant: z.coerce.number().optional().nullable(),
  multiplier_value: z.coerce.number().optional().nullable(),
  effective_from: z.string().min(1),
  effective_to: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
});

const UpdateMultiplierSchema = z.object({
  ct_ratio_primary: z.coerce.number().optional().nullable(),
  ct_ratio_secondary: z.coerce.number().optional().nullable(),
  pt_ratio_primary: z.coerce.number().optional().nullable(),
  pt_ratio_secondary: z.coerce.number().optional().nullable(),
  meter_constant: z.coerce.number().optional().nullable(),
  multiplier_value: z.coerce.number().optional().nullable(),
  effective_from: z.string().optional(),
  effective_to: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const electricityRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // ── GET /electricity/meters ───────────────────────────────────────────────
  fastify.get('/electricity/meters', async (request, reply) => {
    try {
      const { propertyId } = MeterQuerySchema.parse(request.query);

      const { data, error } = await supabaseAdmin
        .from('electricity_meters')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false });

      if (error) {
        fastify.log.error(`[ELECTRICITY] Meters query failed: ${error.message}`);
        reply.status(500);
        return { error: 'query_failed', message: error.message };
      }

      return { data: (data as ElectricityMeter[]) || [] };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── POST /electricity/meters ──────────────────────────────────────────────
  fastify.post('/electricity/meters', async (request, reply) => {
    try {
      const parsed = CreateMeterSchema.parse(request.body);
      const { initial_multiplier, ...meterPayload } = parsed;

      const { data, error } = await supabaseAdmin
        .from('electricity_meters')
        .insert(meterPayload)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[ELECTRICITY] Meter insert failed: ${error.message}`);
        reply.status(500);
        return { error: 'insert_failed', message: error.message };
      }

      const meter = data as ElectricityMeter;

      if (initial_multiplier) {
        const { error: multErr } = await supabaseAdmin
          .from('meter_multipliers')
          .insert({ ...initial_multiplier, meter_id: meter.id });

        if (multErr) {
          fastify.log.warn(`[ELECTRICITY] Multiplier insert failed: ${multErr.message}`);
        }
      }

      reply.status(201);
      return { data: meter };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── GET /electricity/meters/:id ───────────────────────────────────────────
  fastify.get('/electricity/meters/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const { data, error } = await supabaseAdmin
      .from('electricity_meters')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      fastify.log.error(`[ELECTRICITY] Get meter failed: ${error.message}`);
      reply.status(500);
      return { error: 'query_failed', message: error.message };
    }
    if (!data) {
      reply.status(404);
      return { error: 'not_found', message: `Meter ${id} not found` };
    }

    return { data: data as ElectricityMeter };
  });

  // ── PUT /electricity/meters/:id ───────────────────────────────────────────
  fastify.put('/electricity/meters/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const parsed = UpdateMeterSchema.parse(request.body);

      const updatePayload = Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => v !== undefined)
      );

      if (Object.keys(updatePayload).length === 0) {
        reply.status(400);
        return { error: 'validation_error', message: 'No fields to update' };
      }

      const { data, error } = await supabaseAdmin
        .from('electricity_meters')
        .update({ ...updatePayload, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[ELECTRICITY] Meter update failed: ${error.message}`);
        reply.status(500);
        return { error: 'update_failed', message: error.message };
      }

      return { data: data as ElectricityMeter };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── DELETE /electricity/meters/:id ────────────────────────────────────────
  fastify.delete('/electricity/meters/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const { error } = await supabaseAdmin
      .from('electricity_meters')
      .delete()
      .eq('id', id);

    if (error) {
      fastify.log.error(`[ELECTRICITY] Meter delete failed: ${error.message}`);
      reply.status(500);
      return { error: 'delete_failed', message: error.message };
    }

    return { data: true };
  });

  // ── GET /electricity/readings ─────────────────────────────────────────────
  fastify.get('/electricity/readings', async (request, reply) => {
    try {
      const { propertyId, meterId, fromDate, toDate, limit, offset } = ReadingQuerySchema.parse(
        request.query
      );

      let query = supabaseAdmin
        .from('electricity_readings')
        .select('*, meter:electricity_meters(id, name, meter_type)', { count: 'exact' })
        .eq('property_id', propertyId)
        .range(offset, offset + limit - 1)
        .order('reading_date', { ascending: false });

      if (meterId) query = query.eq('meter_id', meterId);
      if (fromDate) query = query.gte('reading_date', fromDate);
      if (toDate) query = query.lte('reading_date', toDate);

      const { data, error, count } = await query;

      if (error) {
        fastify.log.error(`[ELECTRICITY] Readings query failed: ${error.message}`);
        reply.status(500);
        return { error: 'query_failed', message: error.message };
      }

      return {
        data: (data as ElectricityReading[]) || [],
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

  // ── POST /electricity/readings ────────────────────────────────────────────
  fastify.post('/electricity/readings', async (request, reply) => {
    try {
      const parsed = CreateReadingSchema.parse(request.body);
      const computed_units = parsed.closing_reading - parsed.opening_reading;

      const newReading = {
        property_id: parsed.property_id,
        meter_id: parsed.meter_id,
        reading_date: parsed.reading_date,
        opening_reading: parsed.opening_reading,
        closing_reading: parsed.closing_reading,
        computed_units,
        final_units: computed_units,
        notes: parsed.notes ?? null,
        photo_url: parsed.photo_url ?? null,
        created_by: parsed.created_by ?? null,
      };

      const { data, error } = await supabaseAdmin
        .from('electricity_readings')
        .insert(newReading)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[ELECTRICITY] Reading insert failed: ${error.message}`);
        reply.status(500);
        return { error: 'insert_failed', message: error.message };
      }

      reply.status(201);
      return { data: data as ElectricityReading };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── GET /electricity/tariffs ──────────────────────────────────────────────
  fastify.get('/electricity/tariffs', async (request, reply) => {
    try {
      const { propertyId } = TariffQuerySchema.parse(request.query);

      const { data, error } = await supabaseAdmin
        .from('grid_tariffs')
        .select('*')
        .eq('property_id', propertyId)
        .order('effective_from', { ascending: false });

      if (error) {
        fastify.log.error(`[ELECTRICITY] Tariffs query failed: ${error.message}`);
        reply.status(500);
        return { error: 'query_failed', message: error.message };
      }

      return { data: (data as GridTariff[]) || [] };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── POST /electricity/tariffs ─────────────────────────────────────────────
  fastify.post('/electricity/tariffs', async (request, reply) => {
    try {
      const parsed = CreateTariffSchema.parse(request.body);

      // Close any existing active tariff for the same property
      if (parsed.property_id && parsed.effective_from) {
        const prevDate = new Date(parsed.effective_from);
        prevDate.setDate(prevDate.getDate() - 1);
        await supabaseAdmin
          .from('grid_tariffs')
          .update({ effective_to: prevDate.toISOString().split('T')[0] })
          .eq('property_id', parsed.property_id)
          .is('effective_to', null);
      }

      const { data, error } = await supabaseAdmin
        .from('grid_tariffs')
        .insert(parsed)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[ELECTRICITY] Tariff insert failed: ${error.message}`);
        reply.status(500);
        return { error: 'insert_failed', message: error.message };
      }

      reply.status(201);
      return { data: data as GridTariff };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── PUT /electricity/tariffs/:id ──────────────────────────────────────────
  fastify.put('/electricity/tariffs/:id', async (request, reply) => {
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
        .from('grid_tariffs')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[ELECTRICITY] Tariff update failed: ${error.message}`);
        reply.status(500);
        return { error: 'update_failed', message: error.message };
      }

      return { data: data as GridTariff };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── DELETE /electricity/tariffs/:id ───────────────────────────────────────
  fastify.delete('/electricity/tariffs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Fetch the tariff to know its property before deleting
    const { data: tariff } = await supabaseAdmin
      .from('grid_tariffs')
      .select('property_id')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from('grid_tariffs')
      .delete()
      .eq('id', id);

    if (error) {
      fastify.log.error(`[ELECTRICITY] Tariff delete failed: ${error.message}`);
      reply.status(500);
      return { error: 'delete_failed', message: error.message };
    }

    // Re-open the most recent previous tariff for the same property
    if (tariff?.property_id) {
      const { data: prev } = await supabaseAdmin
        .from('grid_tariffs')
        .select('id')
        .eq('property_id', tariff.property_id)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prev?.id) {
        await supabaseAdmin
          .from('grid_tariffs')
          .update({ effective_to: null })
          .eq('id', prev.id);
      }
    }

    return { data: true };
  });

  // ── GET /electricity/multipliers ──────────────────────────────────────────
  fastify.get('/electricity/multipliers', async (request, reply) => {
    try {
      const { meterId } = MultiplierQuerySchema.parse(request.query);

      const { data, error } = await supabaseAdmin
        .from('meter_multipliers')
        .select('*')
        .eq('meter_id', meterId)
        .order('effective_from', { ascending: false });

      if (error) {
        fastify.log.error(`[ELECTRICITY] Multipliers query failed: ${error.message}`);
        reply.status(500);
        return { error: 'query_failed', message: error.message };
      }

      return { data: (data as MeterMultiplier[]) || [] };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── POST /electricity/multipliers ─────────────────────────────────────────
  fastify.post('/electricity/multipliers', async (request, reply) => {
    try {
      const parsed = CreateMultiplierSchema.parse(request.body);

      // Close any existing active multiplier for the same meter
      if (parsed.meter_id && parsed.effective_from) {
        const prevDate = new Date(parsed.effective_from);
        prevDate.setDate(prevDate.getDate() - 1);
        await supabaseAdmin
          .from('meter_multipliers')
          .update({ effective_to: prevDate.toISOString().split('T')[0] })
          .eq('meter_id', parsed.meter_id)
          .is('effective_to', null);
      }

      const { data, error } = await supabaseAdmin
        .from('meter_multipliers')
        .insert(parsed)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[ELECTRICITY] Multiplier insert failed: ${error.message}`);
        reply.status(500);
        return { error: 'insert_failed', message: error.message };
      }

      reply.status(201);
      return { data: data as MeterMultiplier };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });

  // ── PUT /electricity/multipliers/:id ──────────────────────────────────────
  fastify.put('/electricity/multipliers/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const parsed = UpdateMultiplierSchema.parse(request.body);

      const updatePayload = Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => v !== undefined)
      );

      if (Object.keys(updatePayload).length === 0) {
        reply.status(400);
        return { error: 'validation_error', message: 'No fields to update' };
      }

      const { data, error } = await supabaseAdmin
        .from('meter_multipliers')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        fastify.log.error(`[ELECTRICITY] Multiplier update failed: ${error.message}`);
        reply.status(500);
        return { error: 'update_failed', message: error.message };
      }

      return { data: data as MeterMultiplier };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      throw err;
    }
  });
};
