"use strict";
/**
 * PPM Routes — Preventive Maintenance Schedules
 *
 * Covers all endpoints called by saas_mobile_app/services/ppmService.ts:
 *   GET  /api/ppm                   — list schedules
 *   GET  /api/ppm/stats             — aggregate stats
 *   GET  /api/ppm/contracts         — AMC contracts
 *   GET  /api/ppm/search            — asset search
 *   GET  /api/ppm/vendors           — maintenance vendors
 *   POST /api/ppm                   — create schedule
 *   PATCH /api/ppm/:id              — update schedule status / done_date
 *   POST /api/ppm/:id/attachments   — upload attachment URL
 *   DELETE /api/ppm/:id/attachments — remove attachment
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ppmRoutes = ppmRoutes;
const zod_1 = require("zod");
const supabase_js_1 = require("../utils/supabase.js");
// ── Query schemas ────────────────────────────────────────────────────────────
const ScheduleQuerySchema = zod_1.z.object({
    propertyId: zod_1.z.string().optional(),
    organizationId: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    frequency: zod_1.z.string().optional(),
    limit: zod_1.z.coerce.number().int().positive().max(500).default(200),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
});
const UpdateScheduleSchema = zod_1.z.object({
    status: zod_1.z.enum(['pending', 'done', 'postponed', 'skipped']).optional(),
    done_date: zod_1.z.string().nullable().optional(),
    remark: zod_1.z.string().nullable().optional(),
    verification_status: zod_1.z.string().optional(),
    vendor_id: zod_1.z.string().nullable().optional(),
    vendor_name: zod_1.z.string().nullable().optional(),
    vendor_phone: zod_1.z.string().nullable().optional(),
    vendor_contact_person: zod_1.z.string().nullable().optional(),
});
const CreateScheduleSchema = zod_1.z.object({
    organization_id: zod_1.z.string().nullable().optional(),
    property_id: zod_1.z.string().nullable().optional(),
    system_name: zod_1.z.string().min(1),
    detail_name: zod_1.z.string().nullable().optional(),
    scope_of_work: zod_1.z.string().nullable().optional(),
    frequency: zod_1.z.string().default('monthly'),
    location: zod_1.z.string().nullable().optional(),
    vendor_name: zod_1.z.string().nullable().optional(),
    vendor_phone: zod_1.z.string().nullable().optional(),
    vendor_contact_person: zod_1.z.string().nullable().optional(),
    planned_date: zod_1.z.string(),
    status: zod_1.z.string().default('pending'),
    remark: zod_1.z.string().nullable().optional(),
});
// ── Plugin ───────────────────────────────────────────────────────────────────
async function ppmRoutes(fastify) {
    // ── GET /api/ppm — list schedules ─────────────────────────────────────────
    fastify.get('/api/ppm', async (req, reply) => {
        const parsed = ScheduleQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Bad Request', message: parsed.error.message });
        }
        const { propertyId, organizationId, status, frequency, limit, offset } = parsed.data;
        let query = supabase_js_1.supabaseAdmin
            .from('ppm_schedules')
            .select('*, maintenance_vendors(id, company_name, contact_person, phone)')
            .order('planned_date', { ascending: true })
            .range(offset, offset + limit - 1);
        if (propertyId)
            query = query.eq('property_id', propertyId);
        if (organizationId)
            query = query.eq('organization_id', organizationId);
        if (status)
            query = query.eq('status', status);
        if (frequency)
            query = query.eq('frequency', frequency);
        const { data, error } = await query;
        if (error) {
            fastify.log.error({ err: error }, '[PPM] fetchSchedules supabase error');
            return reply.status(500).send({ error: 'DatabaseError', message: error.message });
        }
        return reply.send({ schedules: data ?? [] });
    });
    // ── GET /api/ppm/stats — aggregate stats ──────────────────────────────────
    fastify.get('/api/ppm/stats', async (req, reply) => {
        const parsed = ScheduleQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Bad Request', message: parsed.error.message });
        }
        const { propertyId, organizationId } = parsed.data;
        let query = supabase_js_1.supabaseAdmin
            .from('ppm_schedules')
            .select('status, planned_date');
        if (propertyId)
            query = query.eq('property_id', propertyId);
        if (organizationId)
            query = query.eq('organization_id', organizationId);
        const { data, error } = await query;
        if (error) {
            return reply.status(500).send({ error: 'DatabaseError', message: error.message });
        }
        const rows = data ?? [];
        const today = new Date().toISOString().split('T')[0];
        const stats = {
            total: rows.length,
            done: rows.filter((r) => r.status === 'done').length,
            pending: rows.filter((r) => r.status === 'pending').length,
            postponed: rows.filter((r) => r.status === 'postponed').length,
            skipped: rows.filter((r) => r.status === 'skipped').length,
            overdue: rows.filter((r) => r.status === 'pending' && r.planned_date && r.planned_date < today).length,
        };
        return reply.send({ stats });
    });
    // ── GET /api/ppm/contracts — AMC contracts ────────────────────────────────
    fastify.get('/api/ppm/contracts', async (req, reply) => {
        const parsed = zod_1.z
            .object({ propertyId: zod_1.z.string().optional(), organizationId: zod_1.z.string().optional() })
            .safeParse(req.query);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Bad Request', message: parsed.error.message });
        }
        let query = supabase_js_1.supabaseAdmin
            .from('amc_contracts')
            .select('*')
            .order('contract_end_date', { ascending: true });
        if (parsed.data.propertyId)
            query = query.eq('property_id', parsed.data.propertyId);
        if (parsed.data.organizationId)
            query = query.eq('organization_id', parsed.data.organizationId);
        const { data, error } = await query;
        if (error) {
            // Table may not exist yet — return empty rather than crashing
            fastify.log.warn({ err: error }, '[PPM] amc_contracts query error');
            return reply.send({ contracts: [] });
        }
        return reply.send({ contracts: data ?? [] });
    });
    // ── GET /api/ppm/search — asset keyword search ────────────────────────────
    fastify.get('/api/ppm/search', async (req, reply) => {
        const parsed = zod_1.z
            .object({
            propertyId: zod_1.z.string().optional(),
            q: zod_1.z.string().min(1),
            limit: zod_1.z.coerce.number().int().positive().max(50).default(20),
        })
            .safeParse(req.query);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Bad Request', message: parsed.error.message });
        }
        const { propertyId, q, limit } = parsed.data;
        let query = supabase_js_1.supabaseAdmin
            .from('ppm_schedules')
            .select('*, maintenance_vendors(id, company_name, contact_person, phone)')
            .or(`system_name.ilike.%${q}%,detail_name.ilike.%${q}%,location.ilike.%${q}%`)
            .limit(limit);
        if (propertyId)
            query = query.eq('property_id', propertyId);
        const { data, error } = await query;
        if (error) {
            return reply.status(500).send({ error: 'DatabaseError', message: error.message });
        }
        return reply.send({ schedules: data ?? [] });
    });
    // ── GET /api/ppm/vendors — maintenance vendors ────────────────────────────
    fastify.get('/api/ppm/vendors', async (_req, reply) => {
        const { data, error } = await supabase_js_1.supabaseAdmin
            .from('maintenance_vendors')
            .select('id, company_name, contact_person, phone, email, specialization, is_active')
            .eq('is_active', true)
            .order('company_name', { ascending: true });
        if (error) {
            fastify.log.warn({ err: error }, '[PPM] maintenance_vendors query error');
            return reply.send({ vendors: [] });
        }
        return reply.send({ vendors: data ?? [] });
    });
    // ── POST /api/ppm — create schedule ──────────────────────────────────────
    fastify.post('/api/ppm', async (req, reply) => {
        const parsed = CreateScheduleSchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Bad Request', message: parsed.error.message });
        }
        const { data, error } = await supabase_js_1.supabaseAdmin
            .from('ppm_schedules')
            .insert(parsed.data)
            .select()
            .single();
        if (error) {
            fastify.log.error({ err: error }, '[PPM] createSchedule error');
            return reply.status(500).send({ error: 'DatabaseError', message: error.message });
        }
        return reply.status(201).send({ schedule: data });
    });
    // ── PATCH /api/ppm/:id — update schedule ──────────────────────────────────
    fastify.patch('/api/ppm/:id', async (req, reply) => {
        const { id } = req.params;
        const parsed = UpdateScheduleSchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Bad Request', message: parsed.error.message });
        }
        // Only pass fields that were provided
        const updatePayload = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
        if (Object.keys(updatePayload).length === 0) {
            return reply.status(400).send({ error: 'Bad Request', message: 'No fields to update' });
        }
        const { data, error } = await supabase_js_1.supabaseAdmin
            .from('ppm_schedules')
            .update({ ...updatePayload, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) {
            fastify.log.error({ err: error }, '[PPM] updateSchedule error');
            return reply.status(500).send({ error: 'DatabaseError', message: error.message });
        }
        return reply.send({ schedule: data });
    });
    // ── POST /api/ppm/:id/attachments — store attachment URL ─────────────────
    // The mobile uploads to Supabase Storage directly; this endpoint records the URL.
    fastify.post('/api/ppm/:id/attachments', async (req, reply) => {
        const { id } = req.params;
        const body = req.body;
        const url = body?.url;
        const attachType = (body?.attach_type ?? 'photo');
        if (!url) {
            return reply.status(400).send({ error: 'Bad Request', message: 'url is required' });
        }
        // Fetch current schedule to merge arrays
        const { data: existing, error: fetchErr } = await supabase_js_1.supabaseAdmin
            .from('ppm_schedules')
            .select('completion_photos, attachments')
            .eq('id', id)
            .single();
        if (fetchErr) {
            return reply.status(404).send({ error: 'NotFound', message: 'Schedule not found' });
        }
        let updatePayload = {};
        if (attachType === 'photo') {
            const photos = Array.isArray(existing.completion_photos) ? existing.completion_photos : [];
            updatePayload.completion_photos = [...photos, url];
        }
        else {
            // doc / invoice / certificate — stored in attachments JSONB
            const att = existing.attachments ?? {};
            if (attachType === 'doc' || attachType === 'certificate')
                att.certificate = url;
            else if (attachType === 'invoice')
                att.invoice = url;
            updatePayload.attachments = att;
        }
        const { data, error } = await supabase_js_1.supabaseAdmin
            .from('ppm_schedules')
            .update({ ...updatePayload, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) {
            return reply.status(500).send({ error: 'DatabaseError', message: error.message });
        }
        return reply.send({ url, schedule: data });
    });
    // ── DELETE /api/ppm/:id/attachments — remove attachment URL ──────────────
    fastify.delete('/api/ppm/:id/attachments', async (req, reply) => {
        const { id } = req.params;
        const { url, attach_type: attachType } = req.query;
        if (!url) {
            return reply.status(400).send({ error: 'Bad Request', message: 'url query param required' });
        }
        const { data: existing, error: fetchErr } = await supabase_js_1.supabaseAdmin
            .from('ppm_schedules')
            .select('completion_photos, attachments')
            .eq('id', id)
            .single();
        if (fetchErr) {
            return reply.status(404).send({ error: 'NotFound', message: 'Schedule not found' });
        }
        let updatePayload = {};
        if (!attachType || attachType === 'photo') {
            const photos = Array.isArray(existing.completion_photos) ? existing.completion_photos : [];
            updatePayload.completion_photos = photos.filter((p) => p !== url);
        }
        else {
            const att = { ...(existing.attachments ?? {}) };
            if (attachType === 'doc' || attachType === 'certificate')
                delete att.certificate;
            else if (attachType === 'invoice')
                delete att.invoice;
            updatePayload.attachments = att;
        }
        const { error } = await supabase_js_1.supabaseAdmin
            .from('ppm_schedules')
            .update({ ...updatePayload, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) {
            return reply.status(500).send({ error: 'DatabaseError', message: error.message });
        }
        return reply.send({ success: true });
    });
}
//# sourceMappingURL=ppm.js.map