import { config as dotenvConfig } from 'dotenv';
// Load server/.env with override:true so our PORT=3001 wins over any PORT=8000
// inherited when the parent shell sources the shared root .env.shared.local.
dotenvConfig({ override: true });
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { ticketRoutes } from './routes/tickets.js';
import { propertyRoutes } from './routes/properties.js';
import { ppmRoutes } from './routes/ppm.js';
import { contextPlugin } from './plugins/context.js';
import { authPlugin } from './plugins/auth.js';
import { queryRoutes } from './routes/query.js';

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function buildServer(opts: { logger?: boolean } = {}) {
  const fastify = Fastify({
    logger: opts.logger ?? true,
  });

  // ---------------------------------------------------------------------------
  // Plugins
  // ---------------------------------------------------------------------------

  fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  fastify.register(healthRoutes);
  fastify.register(authRoutes);
  fastify.register(authPlugin);
  fastify.register(propertyRoutes);
  fastify.register(queryRoutes);
  fastify.register(ticketRoutes);
  fastify.register(ppmRoutes);
  fastify.register(contextPlugin);

  // ---------------------------------------------------------------------------
  // Global error handler
  // ---------------------------------------------------------------------------

  fastify.setErrorHandler((error, request, reply) => {
    const statusCode = (error as any).statusCode ?? 500;

    fastify.log.error({
      err: error,
      url: request.url,
      method: request.method,
    });

    reply.status(statusCode).send({
      error: error.name || 'InternalServerError',
      message: error.message,
      statusCode,
    });
  });

  // ---------------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------------

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      fastify.log.info(`Received ${signal}, shutting down gracefully...`);
      await fastify.close();
      process.exit(0);
    });
  });

  return fastify;
}

// ---------------------------------------------------------------------------
// Start server (only when run directly, not imported)
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

// Only start server when this file is run directly (not imported by tests)
import { fileURLToPath } from 'url';
const isMainModule = process.argv[1] ?
  fileURLToPath(import.meta.url) === fileURLToPath(`file://${process.argv[1]}`) :
  false;
if (isMainModule) {
  const server = buildServer();

  server.listen({ port: PORT, host: HOST }).then((address) => {
    console.log(`\n🚀 Autopilot Server running at ${address}`);
    console.log(`   Health:    ${address}/health`);
    console.log(`   Auth:      ${address}/auth/session`);
    console.log(`   Tickets:   ${address}/tickets`);
    console.log(`   Context:   ${address}/context/hydrate`);
    console.log(`   PPM:       ${address}/api/ppm\n`);

    // Route verification — log all registered routes for audit
    const routes = server.printRoutes({ commonPrefix: false });
    console.log('📋 Registered routes:');
    console.log(routes);
  });
}
