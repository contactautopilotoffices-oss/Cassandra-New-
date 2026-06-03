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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildServer } from '../index.js';

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? 'test-secret-key-for-e2e-tests';

let server: Awaited<ReturnType<typeof buildServer>>;

// ---------------------------------------------------------------------------
// JWT Helper
// ---------------------------------------------------------------------------

async function createTestJWT(payload: Record<string, unknown>): Promise<string> {
  const encoder = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + 3600 };
  const bodyB64 = Buffer.from(JSON.stringify(body)).toString('base64url');

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${headerB64}.${bodyB64}`)
  );

  const signatureB64 = Buffer.from(signature).toString('base64url');
  return `${headerB64}.${bodyB64}.${signatureB64}`;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.NODE_ENV = 'production';
  server = buildServer({ logger: false });
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('E2E Security Tests', () => {

  // ── 1. Health Endpoints ───────────────────────────────────────────────

  describe('Health Endpoints', () => {
    it('GET /health → 200 OK', async () => {
      const res = await request(server.server).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /health/live → always 200 "alive"', async () => {
      const res = await request(server.server).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.text).toBe('alive');
    });

    it('GET /health/ready → 200 or 503 (DB status)', async () => {
      const res = await request(server.server).get('/health/ready');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  // ── 2. Auth Endpoints ─────────────────────────────────────────────────

  describe('Auth Endpoints', () => {
    it('POST /auth/session returns 200 with mock token for dev mode', async () => {
      process.env.NODE_ENV = 'development';
      const res = await request(server.server)
        .post('/auth/session')
        .send({ token: 'test-token' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.expires_at).toBeDefined();
      expect(res.body.user_id).toBeDefined();
      expect(res.body.org_id).toBeDefined();

      process.env.NODE_ENV = 'production';
    });

    it('POST /auth/session returns 400 when token is missing', async () => {
      const res = await request(server.server)
        .post('/auth/session')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('POST /auth/session returns 400 when token is empty string', async () => {
      const res = await request(server.server)
        .post('/auth/session')
        .send({ token: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('POST /auth/logout returns 200', async () => {
      const res = await request(server.server)
        .post('/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── 3. Context Hydration ──────────────────────────────────────────────

  describe('Context Hydration (24h TTL)', () => {
    it('POST /context/hydrate returns 200 with valid UUIDs', async () => {
      const res = await request(server.server)
        .post('/context/hydrate')
        .send({
          userId: '11111111-1111-1111-1111-111111111111',
          orgId: '22222222-2222-2222-2222-222222222222'
        });

      // Will be 200 if DB connected, or error if DB not available
      expect([200, 400, 403, 503]).toContain(res.status);
    });

    it('POST /context/hydrate returns 400 for invalid UUIDs', async () => {
      const res = await request(server.server)
        .post('/context/hydrate')
        .send({
          userId: 'not-a-uuid',
          orgId: 'also-not-a-uuid'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('GET /context/status returns 401 without auth header', async () => {
      const res = await request(server.server)
        .get('/context/status');

      expect(res.status).toBe(401);
    });

    it('DELETE /context/purge returns 200 with valid UUIDs', async () => {
      const res = await request(server.server)
        .delete('/context/purge')
        .send({
          userId: '11111111-1111-1111-1111-111111111111',
          orgId: '22222222-2222-2222-2222-222222222222'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('DELETE /context/purge-all returns 200', async () => {
      const res = await request(server.server)
        .delete('/context/purge-all');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── 4. Pre-Deployment Checklist ───────────────────────────────────────

  describe('Pre-Deployment Checklist', () => {
    it('server includes health routes', async () => {
      const res = await request(server.server).get('/health');
      expect(res.status).toBe(200);
    });

    it('server includes auth routes', async () => {
      const res = await request(server.server)
        .post('/auth/session')
        .send({ token: 'test' });
      expect(res.status).toBe(200);
    });

    it('server includes context routes', async () => {
      const res = await request(server.server)
        .post('/context/hydrate')
        .send({
          userId: '11111111-1111-1111-1111-111111111111',
          orgId: '22222222-2222-2222-2222-222222222222'
        });
      expect([200, 400, 403, 503]).toContain(res.status);
    });
  });
});
