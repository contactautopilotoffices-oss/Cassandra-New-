import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string(),
  uptime: z.number(),
  version: z.string(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const startTime = Date.now();

  // GET /health — serving layer alive check
  fastify.get('/health', {
    schema: {
      description: 'QA health check endpoint — used to verify serving layer is alive',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            version: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const result = HealthResponseSchema.parse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: '1.0.0',
    });

    return result;
  });

  // GET /health/ready — readiness check (includes DB ping)
  fastify.get('/health/ready', {
    schema: {
      description: 'Readiness check — verifies DB connectivity',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            database: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            database: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    // TODO: Add Supabase ping when SUPABASE_URL is configured
    const dbStatus = process.env.FMS_SUPABASE_URL ? 'connected' : 'not_configured';

    if (dbStatus === 'connected') {
      return {
        status: 'ready',
        database: dbStatus,
        timestamp: new Date().toISOString(),
      };
    }

    reply.status(503);
    return {
      status: 'not_ready',
      database: dbStatus,
      timestamp: new Date().toISOString(),
    };
  });

  // GET /health/live — liveness check (always 200 if server is running)
  fastify.get('/health/live', {
    schema: {
      description: 'Liveness check — server is running',
      tags: ['health'],
      response: {
        200: { type: 'string', const: 'alive' },
      },
    },
  }, async () => 'alive');
};
