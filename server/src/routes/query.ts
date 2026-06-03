import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const FilterOpSchema = z.enum(['eq', 'neq', 'in', 'gte', 'lte', 'lt', 'gt', 'ilike', 'not', 'is', 'or']);

const QueryBodySchema = z.object({
  table: z.string(),
  action: z.enum(['select', 'insert', 'update', 'delete', 'upsert']),
  select: z.string().optional(),
  selectOptions: z.object({ count: z.enum(['exact', 'planned', 'estimated']).optional(), head: z.boolean().optional() }).optional(),
  filters: z.array(z.object({
    op: FilterOpSchema,
    column: z.string().optional(),
    value: z.any().optional(),
    values: z.array(z.any()).optional(),
    operator: z.string().optional(),
    expression: z.string().optional(),
    foreignTable: z.string().optional(),
  })).optional(),
  orders: z.array(z.object({ column: z.string(), ascending: z.boolean().optional() })).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  single: z.boolean().optional(),
  maybeSingle: z.boolean().optional(),
  values: z.any().optional(),
  mutationOptions: z.object({ onConflict: z.string().optional(), ignoreDuplicates: z.boolean().optional(), defaultToNull: z.boolean().optional() }).optional(),
});

function applyFilters(query: any, filters?: any[]): any {
  if (!filters) return query;
  for (const f of filters) {
    switch (f.op) {
      case 'eq': query = query.eq(f.column, f.value); break;
      case 'neq': query = query.neq(f.column, f.value); break;
      case 'gte': query = query.gte(f.column, f.value); break;
      case 'lte': query = query.lte(f.column, f.value); break;
      case 'lt': query = query.lt(f.column, f.value); break;
      case 'gt': query = query.gt(f.column, f.value); break;
      case 'ilike': query = query.ilike(f.column, f.value); break;
      case 'is': query = query.is(f.column, f.value); break;
      case 'in': query = query.in(f.column, f.values); break;
      case 'not': query = query.not(f.column, f.operator, f.value); break;
      case 'or': query = query.or(f.expression); break;
    }
  }
  return query;
}

function wrapError(err: unknown): { message: string; code?: string } {
  if (err instanceof Error) return { message: err.message };
  if (typeof err === 'string') return { message: err };
  return { message: 'Unknown error' };
}

function requireSupabase(request: any, reply: any): boolean {
  if (!request.supabase) {
    reply.status(401);
    reply.send({ error: 'unauthorized', message: 'Missing Authorization header' });
    return false;
  }
  return true;
}

export const queryRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/query
  fastify.post('/api/query', async (request, reply) => {
    if (!requireSupabase(request, reply)) return;

    try {
      const body = QueryBodySchema.parse(request.body);
      const { table, action, select, filters, orders, limit, offset, single, maybeSingle, values, mutationOptions, selectOptions } = body;
      const supabase = request.supabase!;

      if (action === 'select') {
        const countOpt = selectOptions?.count;
        let q = supabase.from(table).select(select ?? '*', countOpt ? { count: countOpt, head: selectOptions?.head } : undefined);
        q = applyFilters(q, filters);
        if (orders) {
          for (const o of orders) q = q.order(o.column, { ascending: o.ascending ?? true });
        }
        if (limit !== undefined) q = q.limit(limit);
        if (offset !== undefined) q = q.range(offset, offset + (limit ?? 1000) - 1);
        if (single) {
          const { data, error } = await q.single();
          if (error) return { data: null, error: wrapError(error) };
          return { data, error: null };
        }
        if (maybeSingle) {
          const { data, error } = await q.maybeSingle();
          if (error) return { data: null, error: wrapError(error) };
          return { data, error: null };
        }
        const { data, error, count } = await q;
        if (error) return { data: null, error: wrapError(error), count };
        return { data, error: null, count };
      }

      if (action === 'insert') {
        const { data, error } = await supabase
          .from(table)
          .insert(values as any)
          .select(select ?? '*');
        if (error) return { data: null, error: wrapError(error) };
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
        if (error) return { data: null, error: wrapError(error) };
        return { data, error: null };
      }

      if (action === 'update') {
        let q = supabase.from(table).update(values);
        q = applyFilters(q, filters);
        const { data, error } = await q.select(select ?? '*');
        if (error) return { data: null, error: wrapError(error) };
        return { data, error: null };
      }

      if (action === 'delete') {
        let q = supabase.from(table).delete();
        q = applyFilters(q, filters);
        const { data, error } = await q.select(select ?? '*');
        if (error) return { data: null, error: wrapError(error) };
        return { data, error: null };
      }

      return { data: null, error: { message: `Unknown action: ${action}` } };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      return { data: null, error: wrapError(err) };
    }
  });

  // POST /api/rpc
  fastify.post('/api/rpc', async (request, reply) => {
    if (!requireSupabase(request, reply)) return;

    const schema = z.object({
      functionName: z.string(),
      params: z.record(z.unknown()).optional(),
    });

    try {
      const { functionName, params } = schema.parse(request.body);
      const { data, error } = await request.supabase!.rpc(functionName, params ?? {});
      if (error) return { data: null, error: wrapError(error) };
      return { data, error: null };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      return { data: null, error: wrapError(err) };
    }
  });

  // POST /api/storage/upload
  fastify.post('/api/storage/upload', async (request, reply) => {
    if (!requireSupabase(request, reply)) return;

    const schema = z.object({
      bucket: z.string(),
      path: z.string(),
      fileBase64: z.string().optional(),
      contentType: z.string().optional(),
    });

    try {
      const { bucket, path, fileBase64, contentType } = schema.parse(request.body);

      if (!fileBase64) {
        reply.status(400);
        return { error: 'validation_error', message: 'fileBase64 is required' };
      }

      const fileData = Buffer.from(fileBase64, 'base64');

      const { data, error } = await request.supabase!.storage
        .from(bucket)
        .upload(path, fileData, { contentType, upsert: true });

      if (error) return { data: null, error: wrapError(error) };
      return { data: { path: data.path }, error: null };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      return { data: null, error: wrapError(err) };
    }
  });

  // GET /api/storage/url
  fastify.get('/api/storage/url', async (request, reply) => {
    if (!requireSupabase(request, reply)) return;

    const schema = z.object({
      bucket: z.string(),
      path: z.string(),
    });

    try {
      const { bucket, path } = schema.parse(request.query);
      const { data } = request.supabase!.storage.from(bucket).getPublicUrl(path);
      return { data: { publicUrl: data.publicUrl }, error: null };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      return { data: null, error: wrapError(err) };
    }
  });

  // DELETE /api/storage/remove
  fastify.delete('/api/storage/remove', async (request, reply) => {
    if (!requireSupabase(request, reply)) return;

    const schema = z.object({
      bucket: z.string(),
      path: z.string(),
    });

    try {
      const { bucket, path } = schema.parse(request.body);
      const { error } = await request.supabase!.storage.from(bucket).remove([path]);
      if (error) return { data: null, error: wrapError(error) };
      return { data: null, error: null };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.status(400);
        return { error: 'validation_error', message: err.errors.map(e => e.message).join(', ') };
      }
      return { data: null, error: wrapError(err) };
    }
  });
};
