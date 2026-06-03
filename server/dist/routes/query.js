"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryRoutes = void 0;
const zod_1 = require("zod");
const FilterOpSchema = zod_1.z.enum(['eq', 'neq', 'in', 'gte', 'lte', 'lt', 'gt', 'ilike', 'not', 'is', 'or']);
const QueryBodySchema = zod_1.z.object({
    table: zod_1.z.string(),
    action: zod_1.z.enum(['select', 'insert', 'update', 'delete', 'upsert']),
    select: zod_1.z.string().optional(),
    selectOptions: zod_1.z.object({ count: zod_1.z.enum(['exact', 'planned', 'estimated']).optional(), head: zod_1.z.boolean().optional() }).optional(),
    filters: zod_1.z.array(zod_1.z.object({
        op: FilterOpSchema,
        column: zod_1.z.string().optional(),
        value: zod_1.z.any().optional(),
        values: zod_1.z.array(zod_1.z.any()).optional(),
        operator: zod_1.z.string().optional(),
        expression: zod_1.z.string().optional(),
        foreignTable: zod_1.z.string().optional(),
    })).optional(),
    orders: zod_1.z.array(zod_1.z.object({ column: zod_1.z.string(), ascending: zod_1.z.boolean().optional() })).optional(),
    limit: zod_1.z.number().optional(),
    offset: zod_1.z.number().optional(),
    single: zod_1.z.boolean().optional(),
    maybeSingle: zod_1.z.boolean().optional(),
    values: zod_1.z.any().optional(),
    mutationOptions: zod_1.z.object({ onConflict: zod_1.z.string().optional(), ignoreDuplicates: zod_1.z.boolean().optional(), defaultToNull: zod_1.z.boolean().optional() }).optional(),
});
function applyFilters(query, filters) {
    if (!filters)
        return query;
    for (const f of filters) {
        switch (f.op) {
            case 'eq':
                query = query.eq(f.column, f.value);
                break;
            case 'neq':
                query = query.neq(f.column, f.value);
                break;
            case 'gte':
                query = query.gte(f.column, f.value);
                break;
            case 'lte':
                query = query.lte(f.column, f.value);
                break;
            case 'lt':
                query = query.lt(f.column, f.value);
                break;
            case 'gt':
                query = query.gt(f.column, f.value);
                break;
            case 'ilike':
                query = query.ilike(f.column, f.value);
                break;
            case 'is':
                query = query.is(f.column, f.value);
                break;
            case 'in':
                query = query.in(f.column, f.values);
                break;
            case 'not':
                query = query.not(f.column, f.operator, f.value);
                break;
            case 'or':
                query = query.or(f.expression);
                break;
        }
    }
    return query;
}
function wrapError(err) {
    if (err instanceof Error)
        return { message: err.message };
    if (typeof err === 'string')
        return { message: err };
    return { message: 'Unknown error' };
}
function requireSupabase(request, reply) {
    if (!request.supabase) {
        reply.status(401);
        reply.send({ error: 'unauthorized', message: 'Missing Authorization header' });
        return false;
    }
    return true;
}
const queryRoutes = async (fastify) => {
    // POST /api/query
    fastify.post('/api/query', async (request, reply) => {
        if (!requireSupabase(request, reply))
            return;
        try {
            const body = QueryBodySchema.parse(request.body);
            const { table, action, select, filters, orders, limit, offset, single, maybeSingle, values, mutationOptions, selectOptions } = body;
            const supabase = request.supabase;
            if (action === 'select') {
                const countOpt = selectOptions?.count;
                let q = supabase.from(table).select(select ?? '*', countOpt ? { count: countOpt, head: selectOptions?.head } : undefined);
                q = applyFilters(q, filters);
                if (orders) {
                    for (const o of orders)
                        q = q.order(o.column, { ascending: o.ascending ?? true });
                }
                if (limit !== undefined)
                    q = q.limit(limit);
                if (offset !== undefined)
                    q = q.range(offset, offset + (limit ?? 1000) - 1);
                if (single) {
                    const { data, error } = await q.single();
                    if (error)
                        return { data: null, error: wrapError(error) };
                    return { data, error: null };
                }
                if (maybeSingle) {
                    const { data, error } = await q.maybeSingle();
                    if (error)
                        return { data: null, error: wrapError(error) };
                    return { data, error: null };
                }
                const { data, error, count } = await q;
                if (error)
                    return { data: null, error: wrapError(error), count };
                return { data, error: null, count };
            }
            if (action === 'insert') {
                const { data, error } = await supabase
                    .from(table)
                    .insert(values)
                    .select(select ?? '*');
                if (error)
                    return { data: null, error: wrapError(error) };
                return { data, error: null };
            }
            if (action === 'upsert') {
                const { data, error } = await supabase
                    .from(table)
                    .upsert(values, {
                    onConflict: mutationOptions?.onConflict,
                    ignoreDuplicates: mutationOptions?.ignoreDuplicates,
                })
                    .select(select ?? '*');
                if (error)
                    return { data: null, error: wrapError(error) };
                return { data, error: null };
            }
            if (action === 'update') {
                let q = supabase.from(table).update(values);
                q = applyFilters(q, filters);
                const { data, error } = await q.select(select ?? '*');
                if (error)
                    return { data: null, error: wrapError(error) };
                return { data, error: null };
            }
            if (action === 'delete') {
                let q = supabase.from(table).delete();
                q = applyFilters(q, filters);
                const { data, error } = await q.select(select ?? '*');
                if (error)
                    return { data: null, error: wrapError(error) };
                return { data, error: null };
            }
            return { data: null, error: { message: `Unknown action: ${action}` } };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                reply.status(400);
                return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
            }
            return { data: null, error: wrapError(err) };
        }
    });
    // POST /api/rpc
    fastify.post('/api/rpc', async (request, reply) => {
        if (!requireSupabase(request, reply))
            return;
        const schema = zod_1.z.object({
            functionName: zod_1.z.string(),
            params: zod_1.z.record(zod_1.z.unknown()).optional(),
        });
        try {
            const { functionName, params } = schema.parse(request.body);
            const { data, error } = await request.supabase.rpc(functionName, params ?? {});
            if (error)
                return { data: null, error: wrapError(error) };
            return { data, error: null };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                reply.status(400);
                return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
            }
            return { data: null, error: wrapError(err) };
        }
    });
    // POST /api/storage/upload
    fastify.post('/api/storage/upload', async (request, reply) => {
        if (!requireSupabase(request, reply))
            return;
        const schema = zod_1.z.object({
            bucket: zod_1.z.string(),
            path: zod_1.z.string(),
            fileBase64: zod_1.z.string().optional(),
            contentType: zod_1.z.string().optional(),
        });
        try {
            const { bucket, path, fileBase64, contentType } = schema.parse(request.body);
            if (!fileBase64) {
                reply.status(400);
                return { error: 'validation_error', message: 'fileBase64 is required' };
            }
            const fileData = Buffer.from(fileBase64, 'base64');
            const { data, error } = await request.supabase.storage
                .from(bucket)
                .upload(path, fileData, { contentType, upsert: true });
            if (error)
                return { data: null, error: wrapError(error) };
            return { data: { path: data.path }, error: null };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                reply.status(400);
                return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
            }
            return { data: null, error: wrapError(err) };
        }
    });
    // GET /api/storage/url
    fastify.get('/api/storage/url', async (request, reply) => {
        if (!requireSupabase(request, reply))
            return;
        const schema = zod_1.z.object({
            bucket: zod_1.z.string(),
            path: zod_1.z.string(),
        });
        try {
            const { bucket, path } = schema.parse(request.query);
            const { data } = request.supabase.storage.from(bucket).getPublicUrl(path);
            return { data: { publicUrl: data.publicUrl }, error: null };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                reply.status(400);
                return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
            }
            return { data: null, error: wrapError(err) };
        }
    });
    // DELETE /api/storage/remove
    fastify.delete('/api/storage/remove', async (request, reply) => {
        if (!requireSupabase(request, reply))
            return;
        const schema = zod_1.z.object({
            bucket: zod_1.z.string(),
            path: zod_1.z.string(),
        });
        try {
            const { bucket, path } = schema.parse(request.body);
            const { error } = await request.supabase.storage.from(bucket).remove([path]);
            if (error)
                return { data: null, error: wrapError(error) };
            return { data: null, error: null };
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                reply.status(400);
                return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
            }
            return { data: null, error: wrapError(err) };
        }
    });
};
exports.queryRoutes = queryRoutes;
//# sourceMappingURL=query.js.map