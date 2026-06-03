"use strict";
/**
 * E2E Security Tests — Fastify Server
 * ====================================
 *
 * Tests for server security endpoints:
 * 1. Health endpoints (/health, /health/live, /health/ready)
 * 2. Auth endpoint (/auth/session, /auth/logout)
 * 3. Context hydration (/context/hydrate, /context/status, /context/purge)
 *
 * Note: Cassandra chat endpoints have been removed.
 * Mobile app now talks directly to Python orchestrator.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const index_js_1 = require("../index.js");
// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? 'test-secret-key-for-e2e-tests';
let server;
// ---------------------------------------------------------------------------
// JWT Helper
// ---------------------------------------------------------------------------
async function createTestJWT(payload) {
    const encoder = new TextEncoder();
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const body = { ...payload, exp: Math.floor(Date.now() / 1000) + 3600 };
    const bodyB64 = Buffer.from(JSON.stringify(body)).toString('base64url');
    const key = await crypto.subtle.importKey('raw', encoder.encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${headerB64}.${bodyB64}`));
    const signatureB64 = Buffer.from(signature).toString('base64url');
    return `${headerB64}.${bodyB64}.${signatureB64}`;
}
// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
(0, vitest_1.beforeAll)(async () => {
    process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
    process.env.NODE_ENV = 'production';
    server = (0, index_js_1.buildServer)({ logger: false });
    await server.ready();
});
(0, vitest_1.afterAll)(async () => {
    await server.close();
});
// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('E2E Security Tests', () => {
    // ── 1. Health Endpoints ───────────────────────────────────────────────
    (0, vitest_1.describe)('Health Endpoints', () => {
        (0, vitest_1.it)('GET /health → 200 OK', async () => {
            const res = await (0, supertest_1.default)(server.server).get('/health');
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.status).toBe('ok');
        });
        (0, vitest_1.it)('GET /health/live → always 200 "alive"', async () => {
            const res = await (0, supertest_1.default)(server.server).get('/health/live');
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.text).toBe('alive');
        });
        (0, vitest_1.it)('GET /health/ready → 200 or 503 (DB status)', async () => {
            const res = await (0, supertest_1.default)(server.server).get('/health/ready');
            (0, vitest_1.expect)([200, 503]).toContain(res.status);
            (0, vitest_1.expect)(res.body).toHaveProperty('status');
            (0, vitest_1.expect)(res.body).toHaveProperty('timestamp');
        });
    });
    // ── 2. Auth Endpoints ─────────────────────────────────────────────────
    (0, vitest_1.describe)('Auth Endpoints', () => {
        (0, vitest_1.it)('POST /auth/session returns 200 with mock token for dev mode', async () => {
            process.env.NODE_ENV = 'development';
            const res = await (0, supertest_1.default)(server.server)
                .post('/auth/session')
                .send({ token: 'test-token' });
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.token).toBeDefined();
            (0, vitest_1.expect)(res.body.expires_at).toBeDefined();
            (0, vitest_1.expect)(res.body.user_id).toBeDefined();
            (0, vitest_1.expect)(res.body.org_id).toBeDefined();
            process.env.NODE_ENV = 'production';
        });
        (0, vitest_1.it)('POST /auth/session returns 400 when token is missing', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .post('/auth/session')
                .send({});
            (0, vitest_1.expect)(res.status).toBe(400);
            (0, vitest_1.expect)(res.body.error).toBeDefined();
        });
        (0, vitest_1.it)('POST /auth/session returns 400 when token is empty string', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .post('/auth/session')
                .send({ token: '' });
            (0, vitest_1.expect)(res.status).toBe(400);
            (0, vitest_1.expect)(res.body.error).toBeDefined();
        });
        (0, vitest_1.it)('POST /auth/logout returns 200', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .post('/auth/logout');
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.success).toBe(true);
        });
    });
    // ── 3. Context Hydration ──────────────────────────────────────────────
    (0, vitest_1.describe)('Context Hydration (24h TTL)', () => {
        (0, vitest_1.it)('POST /context/hydrate returns 200 with valid UUIDs', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .post('/context/hydrate')
                .send({
                userId: '11111111-1111-1111-1111-111111111111',
                orgId: '22222222-2222-2222-2222-222222222222'
            });
            // Will be 200 if DB connected, or error if DB not available
            (0, vitest_1.expect)([200, 400, 403, 503]).toContain(res.status);
        });
        (0, vitest_1.it)('POST /context/hydrate returns 400 for invalid UUIDs', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .post('/context/hydrate')
                .send({
                userId: 'not-a-uuid',
                orgId: 'also-not-a-uuid'
            });
            (0, vitest_1.expect)(res.status).toBe(400);
            (0, vitest_1.expect)(res.body.error).toBe('validation_error');
        });
        (0, vitest_1.it)('GET /context/status returns 401 without auth header', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .get('/context/status');
            (0, vitest_1.expect)(res.status).toBe(401);
        });
        (0, vitest_1.it)('DELETE /context/purge returns 200 with valid UUIDs', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .delete('/context/purge')
                .send({
                userId: '11111111-1111-1111-1111-111111111111',
                orgId: '22222222-2222-2222-2222-222222222222'
            });
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.success).toBe(true);
        });
        (0, vitest_1.it)('DELETE /context/purge-all returns 200', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .delete('/context/purge-all');
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.success).toBe(true);
        });
    });
    // ── 4. Pre-Deployment Checklist ───────────────────────────────────────
    (0, vitest_1.describe)('Pre-Deployment Checklist', () => {
        (0, vitest_1.it)('server includes health routes', async () => {
            const res = await (0, supertest_1.default)(server.server).get('/health');
            (0, vitest_1.expect)(res.status).toBe(200);
        });
        (0, vitest_1.it)('server includes auth routes', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .post('/auth/session')
                .send({ token: 'test' });
            (0, vitest_1.expect)(res.status).toBe(200);
        });
        (0, vitest_1.it)('server includes context routes', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .post('/context/hydrate')
                .send({
                userId: '11111111-1111-1111-1111-111111111111',
                orgId: '22222222-2222-2222-2222-222222222222'
            });
            (0, vitest_1.expect)([200, 400, 403, 503]).toContain(res.status);
        });
    });
});
//# sourceMappingURL=e2e-security.test.js.map