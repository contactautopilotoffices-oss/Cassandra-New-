"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.propertyRoutes = void 0;
const zod_1 = require("zod");
const supabase_js_1 = require("../utils/supabase.js");
// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const PropertyQuerySchema = zod_1.z.object({
    organizationId: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    search: zod_1.z.string().optional(),
    limit: zod_1.z.coerce.number().int().positive().default(20),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
});
// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------
const propertyRoutes = async (fastify) => {
    // GET /properties — list properties with filters
    fastify.get('/properties', async (request, reply) => {
        try {
            const { organizationId, status, search, limit, offset } = PropertyQuerySchema.parse(request.query);
            const supabase = request.supabase ?? supabase_js_1.supabaseAdmin;
            let sbQuery = supabase.from('properties').select('*', { count: 'exact' });
            if (organizationId)
                sbQuery = sbQuery.eq('organization_id', organizationId);
            if (status)
                sbQuery = sbQuery.eq('status', status);
            if (search)
                sbQuery = sbQuery.ilike('name', `%${search}%`);
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
    // GET /properties/:id — single property
    fastify.get('/properties/:id', async (request, reply) => {
        const { id } = request.params;
        const supabase = request.supabase ?? supabase_js_1.supabaseAdmin;
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
        return { data: data };
    });
    // POST /properties — create property
    fastify.post('/properties', async (request, reply) => {
        const schema = zod_1.z.object({
            name: zod_1.z.string().min(1).max(255),
            organization_id: zod_1.z.string().min(1),
            type: zod_1.z.enum(['residential', 'commercial', 'industrial', 'mixed_use', 'coworking']).default('commercial'),
            address: zod_1.z.string().optional(),
            city: zod_1.z.string().optional(),
            state: zod_1.z.string().optional(),
            zip: zod_1.z.string().optional(),
            phone: zod_1.z.string().optional(),
            email: zod_1.z.string().optional(),
            code: zod_1.z.string().optional(),
        });
        try {
            const parsed = schema.parse(request.body);
            const supabase = request.supabase ?? supabase_js_1.supabaseAdmin;
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
    // GET /properties/:id/features — get property features from organization
    fastify.get('/properties/:id/features', async (request, reply) => {
        const { id } = request.params;
        const supabase = request.supabase ?? supabase_js_1.supabaseAdmin;
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
        const modules = org?.available_modules;
        if (modules && Array.isArray(modules)) {
            return {
                data: modules.map((m) => ({ module: m, enabled: true })),
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
exports.propertyRoutes = propertyRoutes;
//# sourceMappingURL=properties.js.map