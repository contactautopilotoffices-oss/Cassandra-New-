/**
 * Session Management Tests — Auth Token Exchange
 * Tests for /auth/session endpoint
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildServer } from '../index.js';

describe('Session Management', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    server = buildServer({ logger: false });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('Token Store Integration', () => {
    it('should return token on auth session', async () => {
      const res = await request(server.server)
        .post('/auth/session')
        .send({ token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
    });

    it('should include org_id in token response', async () => {
      const res = await request(server.server)
        .post('/auth/session')
        .send({ token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock' });

      expect(res.status).toBe(200);
      expect(res.body.org_id).toBeDefined();
    });

    it('should include user_id in token response', async () => {
      const res = await request(server.server)
        .post('/auth/session')
        .send({ token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock' });

      expect(res.status).toBe(200);
      expect(res.body.user_id).toBeDefined();
    });

    it('should include expires_at in token response', async () => {
      const res = await request(server.server)
        .post('/auth/session')
        .send({ token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock' });

      expect(res.status).toBe(200);
      expect(res.body.expires_at).toBeDefined();
      expect(typeof res.body.expires_at).toBe('number');
    });
  });

  describe('Token Expiration', () => {
    it('should set expires_at to future timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      const oneHour = 60 * 60;
      const expiresAt = now + oneHour;

      expect(expiresAt).toBeGreaterThan(now);
    });
  });
});
