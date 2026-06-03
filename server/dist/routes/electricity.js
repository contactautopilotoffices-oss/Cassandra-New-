"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.electricityRoutes = void 0;
const zod_1 = require("zod");
const supabase_js_1 = require("../utils/supabase.js");
// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const MeterQuerySchema = zod_1.z.object({
    propertyId: zod_1.z.string().min(1),
});
const CreateMeterSchema = zod_1.z.object({
    property_id: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1).max(255),
    meter_number: zod_1.z.string().optional().nullable(),
    meter_type: zod_1.z.enum(['main', 'generator', 'solar', 'sub']).default('main'),
    max_load_kw: zod_1.z.coerce.number().optional().nullable(),
    status: zod_1.z.string().optional().nullable(),
    initial_multiplier: zod_1.z.object({
        ct_ratio_primary: zod_1.z.coerce.number().optional().nullable(),
        ct_ratio_secondary: zod_1.z.coerce.number().optional().nullable(),
        pt_ratio_primary: zod_1.z.coerce.number().optional().nullable(),
        pt_ratio_secondary: zod_1.z.coerce.number().optional().nullable(),
        meter_constant: zod_1.z.coerce.number().optional().nullable(),
        multiplier_value: zod_1.z.coerce.number().optional().nullable(),
        effective_from: zod_1.z.string(),
        reason: zod_1.z.string().optional().nullable(),
    }).optional(),
});
const UpdateMeterSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255).optional(),
    meter_number: zod_1.z.string().optional().nullable(),
    meter_type: zod_1.z.enum(['main', 'generator', 'solar', 'sub']).optional(),
    max_load_kw: zod_1.z.coerce.number().optional().nullable(),
    status: zod_1.z.string().optional().nullable(),
    last_reading: zod_1.z.coerce.number().optional().nullable(),
});
const ReadingQuerySchema = zod_1.z.object({
    propertyId: zod_1.z.string().min(1),
    meterId: zod_1.z.string().optional(),
    fromDate: zod_1.z.string().optional(),
    toDate: zod_1.z.string().optional(),
    limit: zod_1.z.coerce.number().int().positive().default(200),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
});
const CreateReadingSchema = zod_1.z.object({
    property_id: zod_1.z.string().min(1),
    meter_id: zod_1.z.string().min(1),
    reading_date: zod_1.z.string().min(1),
    opening_reading: zod_1.z.coerce.number(),
    closing_reading: zod_1.z.coerce.number(),
    notes: zod_1.z.string().optional().nullable(),
    photo_url: zod_1.z.string().optional().nullable(),
    created_by: zod_1.z.string().optional().nullable(),
});
const TariffQuerySchema = zod_1.z.object({
    propertyId: zod_1.z.string().min(1),
});
const CreateTariffSchema = zod_1.z.object({
    property_id: zod_1.z.string().min(1),
    utility_provider: zod_1.z.string().optional().nullable(),
    rate_per_unit: zod_1.z.coerce.number().positive(),
    unit_type: zod_1.z.string().optional().nullable(),
    effective_from: zod_1.z.string().min(1),
    effective_to: zod_1.z.string().optional().nullable(),
});
const UpdateTariffSchema = zod_1.z.object({
    utility_provider: zod_1.z.string().optional().nullable(),
    rate_per_unit: zod_1.z.coerce.number().positive().optional(),
    unit_type: zod_1.z.string().optional().nullable(),
    effective_from: zod_1.z.string().optional(),
    effective_to: zod_1.z.string().optional().nullable(),
});
const MultiplierQuerySchema = zod_1.z.object({
    meterId: zod_1.z.string().min(1),
});
const CreateMultiplierSchema = zod_1.z.object({
    meter_id: zod_1.z.string().min(1),
    ct_ratio_primary: zod_1.z.coerce.number().optional().nullable(),
    ct_ratio_secondary: zod_1.z.coerce.number().optional().nullable(),
    pt_ratio_primary: zod_1.z.coerce.number().optional().nullable(),
    pt_ratio_secondary: zod_1.z.coerce.number().optional().nullable(),
    meter_constant: zod_1.z.coerce.number().optional().nullable(),
    multiplier_value: zod_1.z.coerce.number().optional().nullable(),
    effective_from: zod_1.z.string().min(1),
    effective_to: zod_1.z.string().optional().nullable(),
    reason: zod_1.z.string().optional().nullable(),
});
const UpdateMultiplierSchema = zod_1.z.object({
    ct_ratio_primary: zod_1.z.coerce.number().optional().nullable(),
    ct_ratio_secondary: zod_1.z.coerce.number().optional().nullable(),
    pt_ratio_primary: zod_1.z.coerce.number().optional().nullable(),
    pt_ratio_secondary: zod_1.z.coerce.number().optional().nullable(),
    meter_constant: zod_1.z.coerce.number().optional().nullable(),
    multiplier_value: zod_1.z.coerce.number().optional().nullable(),
    effective_from: zod_1.z.string().optional(),
    effective_to: zod_1.z.string().optional().nullable(),
    reason: zod_1.z.string().optional().nullable(),
});
// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------
const electricityRoutes = async (fastify) => {
    // ── GET /electricity/meters ───────────────────────────────────────────────
    fastify.get('/electricity/meters', async (request, reply) => {
        try {
            const { propertyId } = MeterQuerySchema.parse(request.query);
            const { data, error } = await supabase_js_1.supabaseAdmin
                .from('electricity_meters')
                .select('*')
                .eq('property_id', propertyId)
                .order('created_at', { ascending: false });
            if (error) {
                fastify.log.error(`[ELECTRICITY] Meters query failed: ${error.message}`);
                reply.status(500);
                return { error: 'query_failed', message: error.message };
            }
            return { data: data || [] };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
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
            const { data, error } = await supabase_js_1.supabaseAdmin
                .from('electricity_meters')
                .insert(meterPayload)
                .select()
                .single();
            if (error) {
                fastify.log.error(`[ELECTRICITY] Meter insert failed: ${error.message}`);
                reply.status(500);
                return { error: 'insert_failed', message: error.message };
            }
            const meter = data;
            if (initial_multiplier) {
                const { error: multErr } = await supabase_js_1.supabaseAdmin
                    .from('meter_multipliers')
                    .insert({ ...initial_multiplier, meter_id: meter.id });
                if (multErr) {
                    fastify.log.warn(`[ELECTRICITY] Multiplier insert failed: ${multErr.message}`);
                }
            }
            reply.status(201);
            return { data: meter };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                reply.status(400);
                return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
            }
            throw err;
        }
    });
    // ── GET /electricity/meters/:id ───────────────────────────────────────────
    fastify.get('/electricity/meters/:id', async (request, reply) => {
        const { id } = request.params;
        const { data, error } = await supabase_js_1.supabaseAdmin
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
        return { data: data };
    });
    // ── PUT /electricity/meters/:id ───────────────────────────────────────────
    fastify.put('/electricity/meters/:id', async (request, reply) => {
        try {
            const { id } = request.params;
            const parsed = UpdateMeterSchema.parse(request.body);
            const updatePayload = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined));
            if (Object.keys(updatePayload).length === 0) {
                reply.status(400);
                return { error: 'validation_error', message: 'No fields to update' };
            }
            const { data, error } = await supabase_js_1.supabaseAdmin
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
            return { data: data };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                reply.status(400);
                return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
            }
            throw err;
        }
    });
    // ── DELETE /electricity/meters/:id ────────────────────────────────────────
    fastify.delete('/electricity/meters/:id', async (request, reply) => {
        const { id } = request.params;
        const { error } = await supabase_js_1.supabaseAdmin
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
            const { propertyId, meterId, fromDate, toDate, limit, offset } = ReadingQuerySchema.parse(request.query);
            let query = supabase_js_1.supabaseAdmin
                .from('electricity_readings')
                .select('*, meter:electricity_meters(id, name, meter_type)', { count: 'exact' })
                .eq('property_id', propertyId)
                .range(offset, offset + limit - 1)
                .order('reading_date', { ascending: false });
            if (meterId)
                query = query.eq('meter_id', meterId);
            if (fromDate)
                query = query.gte('reading_date', fromDate);
            if (toDate)
                query = query.lte('reading_date', toDate);
            const { data, error, count } = await query;
            if (error) {
                fastify.log.error(`[ELECTRICITY] Readings query failed: ${error.message}`);
                reply.status(500);
                return { error: 'query_failed', message: error.message };
            }
            return {
                data: data || [],
                total: count || 0,
                limit,
                offset,
            };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
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
            const { data, error } = await supabase_js_1.supabaseAdmin
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
            return { data: data };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
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
            const { data, error } = await supabase_js_1.supabaseAdmin
                .from('grid_tariffs')
                .select('*')
                .eq('property_id', propertyId)
                .order('effective_from', { ascending: false });
            if (error) {
                fastify.log.error(`[ELECTRICITY] Tariffs query failed: ${error.message}`);
                reply.status(500);
                return { error: 'query_failed', message: error.message };
            }
            return { data: data || [] };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
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
                await supabase_js_1.supabaseAdmin
                    .from('grid_tariffs')
                    .update({ effective_to: prevDate.toISOString().split('T')[0] })
                    .eq('property_id', parsed.property_id)
                    .is('effective_to', null);
            }
            const { data, error } = await supabase_js_1.supabaseAdmin
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
            return { data: data };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                reply.status(400);
                return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
            }
            throw err;
        }
    });
    // ── PUT /electricity/tariffs/:id ──────────────────────────────────────────
    fastify.put('/electricity/tariffs/:id', async (request, reply) => {
        try {
            const { id } = request.params;
            const parsed = UpdateTariffSchema.parse(request.body);
            const updatePayload = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined));
            if (Object.keys(updatePayload).length === 0) {
                reply.status(400);
                return { error: 'validation_error', message: 'No fields to update' };
            }
            const { data, error } = await supabase_js_1.supabaseAdmin
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
            return { data: data };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                reply.status(400);
                return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
            }
            throw err;
        }
    });
    // ── DELETE /electricity/tariffs/:id ───────────────────────────────────────
    fastify.delete('/electricity/tariffs/:id', async (request, reply) => {
        const { id } = request.params;
        // Fetch the tariff to know its property before deleting
        const { data: tariff } = await supabase_js_1.supabaseAdmin
            .from('grid_tariffs')
            .select('property_id')
            .eq('id', id)
            .maybeSingle();
        const { error } = await supabase_js_1.supabaseAdmin
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
            const { data: prev } = await supabase_js_1.supabaseAdmin
                .from('grid_tariffs')
                .select('id')
                .eq('property_id', tariff.property_id)
                .order('effective_from', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (prev?.id) {
                await supabase_js_1.supabaseAdmin
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
            const { data, error } = await supabase_js_1.supabaseAdmin
                .from('meter_multipliers')
                .select('*')
                .eq('meter_id', meterId)
                .order('effective_from', { ascending: false });
            if (error) {
                fastify.log.error(`[ELECTRICITY] Multipliers query failed: ${error.message}`);
                reply.status(500);
                return { error: 'query_failed', message: error.message };
            }
            return { data: data || [] };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
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
                await supabase_js_1.supabaseAdmin
                    .from('meter_multipliers')
                    .update({ effective_to: prevDate.toISOString().split('T')[0] })
                    .eq('meter_id', parsed.meter_id)
                    .is('effective_to', null);
            }
            const { data, error } = await supabase_js_1.supabaseAdmin
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
            return { data: data };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                reply.status(400);
                return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
            }
            throw err;
        }
    });
    // ── PUT /electricity/multipliers/:id ──────────────────────────────────────
    fastify.put('/electricity/multipliers/:id', async (request, reply) => {
        try {
            const { id } = request.params;
            const parsed = UpdateMultiplierSchema.parse(request.body);
            const updatePayload = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined));
            if (Object.keys(updatePayload).length === 0) {
                reply.status(400);
                return { error: 'validation_error', message: 'No fields to update' };
            }
            const { data, error } = await supabase_js_1.supabaseAdmin
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
            return { data: data };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                reply.status(400);
                return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
            }
            throw err;
        }
    });
};
exports.electricityRoutes = electricityRoutes;
//# sourceMappingURL=electricity.js.map