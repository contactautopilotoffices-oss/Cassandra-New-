"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketRoutes = void 0;
const zod_1 = require("zod");
const supabase_js_1 = require("../utils/supabase.js");
// ---------------------------------------------------------------------------
// Schemas (Zod only — no Fastify JSON Schema for body/querystring)
// ---------------------------------------------------------------------------
const TicketQuerySchema = zod_1.z.object({
    propertyId: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    orgId: zod_1.z.string().optional(),
    limit: zod_1.z.coerce.number().int().positive().default(20),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
});
const CreateTicketSchema = zod_1.z.object({
    property_id: zod_1.z.string().min(1),
    organization_id: zod_1.z.string().optional(),
    title: zod_1.z.string().min(1).max(255),
    description: zod_1.z.string().optional(),
    category_id: zod_1.z.string().optional(),
    priority: zod_1.z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    is_internal: zod_1.z.boolean().default(false),
    // FIX C0-11: Accept photo_before_url from Cassandra orchestrator (mobile upload)
    photo_before_url: zod_1.z.string().url().optional().nullable(),
});
const CreateCommentSchema = zod_1.z.object({
    comment: zod_1.z.string().min(1),
});
// ---------------------------------------------------------------------------
// Plugin — wired to Supabase (real data, not in-memory)
// ---------------------------------------------------------------------------
const ticketRoutes = async (fastify) => {
    // GET /tickets
    fastify.get('/tickets', async (request, reply) => {
        try {
            const { propertyId, status, orgId, limit, offset } = TicketQuerySchema.parse(request.query);
            let sbQuery = supabase_js_1.supabaseAdmin.from('tickets').select('*', { count: 'exact' });
            if (orgId)
                sbQuery = sbQuery.eq('organization_id', orgId);
            if (propertyId)
                sbQuery = sbQuery.eq('property_id', propertyId);
            if (status)
                sbQuery = sbQuery.eq('status', status);
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
    // GET /tickets/:id
    fastify.get('/tickets/:id', async (request, reply) => {
        const { id } = request.params;
        const { data, error } = await supabase_js_1.supabaseAdmin
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
        return { data: data };
    });
    // POST /tickets
    fastify.post('/tickets', async (request, reply) => {
        try {
            const parsed = CreateTicketSchema.parse(request.body);
            // Resolve organization_id from property if not provided
            let orgId = parsed.organization_id;
            if (!orgId) {
                const { data: prop } = await supabase_js_1.supabaseAdmin
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
                status: 'open',
                is_internal: parsed.is_internal,
                photo_before_url: parsed.photo_before_url ?? null,
                photo_after_url: null,
                assigned_to: null,
                raised_by: 'dev_user_id', // TODO: extract from authenticated user context
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            const { data, error } = await supabase_js_1.supabaseAdmin
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
    // POST /tickets/:id/comments
    fastify.post('/tickets/:id/comments', async (request, reply) => {
        try {
            const { id } = request.params;
            const { comment } = CreateCommentSchema.parse(request.body);
            // Verify ticket exists
            const { data: ticket } = await supabase_js_1.supabaseAdmin
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
            const { data, error } = await supabase_js_1.supabaseAdmin
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
exports.ticketRoutes = ticketRoutes;
//# sourceMappingURL=tickets.js.map