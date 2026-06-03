"use strict";
/**
 * Session Management Tests — Auth Token Exchange
 * Tests for /auth/session endpoint
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const index_js_1 = require("../index.js");
(0, vitest_1.describe)('Session Management', () => {
    let server;
    (0, vitest_1.beforeAll)(async () => {
        process.env.NODE_ENV = 'development';
        server = (0, index_js_1.buildServer)({ logger: false });
        await server.ready();
    });
    (0, vitest_1.afterAll)(async () => {
        await server.close();
    });
    (0, vitest_1.describe)('Token Store Integration', () => {
        (0, vitest_1.it)('should return token on auth session', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .post('/auth/session')
                .send({ token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock' });
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body).toHaveProperty('token');
        });
        (0, vitest_1.it)('should include org_id in token response', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .post('/auth/session')
                .send({ token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock' });
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.org_id).toBeDefined();
        });
        (0, vitest_1.it)('should include user_id in token response', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .post('/auth/session')
                .send({ token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock' });
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.user_id).toBeDefined();
        });
        (0, vitest_1.it)('should include expires_at in token response', async () => {
            const res = await (0, supertest_1.default)(server.server)
                .post('/auth/session')
                .send({ token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock' });
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.expires_at).toBeDefined();
            (0, vitest_1.expect)(typeof res.body.expires_at).toBe('number');
        });
    });
    (0, vitest_1.describe)('Token Expiration', () => {
        (0, vitest_1.it)('should set expires_at to future timestamp', () => {
            const now = Math.floor(Date.now() / 1000);
            const oneHour = 60 * 60;
            const expiresAt = now + oneHour;
            (0, vitest_1.expect)(expiresAt).toBeGreaterThan(now);
        });
    });
});
//# sourceMappingURL=test-sessions.test.js.map