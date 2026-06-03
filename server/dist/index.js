"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildServer = buildServer;
const dotenv_1 = require("dotenv");
// Load server/.env with override:true so our PORT=3001 wins over any PORT=8000
// inherited when the parent shell sources the shared root .env.shared.local.
(0, dotenv_1.config)({ override: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const health_js_1 = require("./routes/health.js");
const auth_js_1 = require("./routes/auth.js");
const tickets_js_1 = require("./routes/tickets.js");
const properties_js_1 = require("./routes/properties.js");
const ppm_js_1 = require("./routes/ppm.js");
const context_js_1 = require("./plugins/context.js");
const auth_js_2 = require("./plugins/auth.js");
const query_js_1 = require("./routes/query.js");
// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------
function buildServer(opts = {}) {
    const fastify = (0, fastify_1.default)({
        logger: opts.logger ?? true,
    });
    // ---------------------------------------------------------------------------
    // Plugins
    // ---------------------------------------------------------------------------
    fastify.register(cors_1.default, {
        origin: true,
        credentials: true,
    });
    // ---------------------------------------------------------------------------
    // Routes
    // ---------------------------------------------------------------------------
    fastify.register(health_js_1.healthRoutes);
    fastify.register(auth_js_1.authRoutes);
    fastify.register(auth_js_2.authPlugin);
    fastify.register(properties_js_1.propertyRoutes);
    fastify.register(query_js_1.queryRoutes);
    fastify.register(tickets_js_1.ticketRoutes);
    fastify.register(ppm_js_1.ppmRoutes);
    fastify.register(context_js_1.contextPlugin);
    // ---------------------------------------------------------------------------
    // Global error handler
    // ---------------------------------------------------------------------------
    fastify.setErrorHandler((error, request, reply) => {
        const statusCode = error.statusCode ?? 500;
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
    const signals = ['SIGINT', 'SIGTERM'];
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
const url_1 = require("url");
const isMainModule = process.argv[1] ?
    (0, url_1.fileURLToPath)(import.meta.url) === (0, url_1.fileURLToPath)(`file://${process.argv[1]}`) :
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
//# sourceMappingURL=index.js.map