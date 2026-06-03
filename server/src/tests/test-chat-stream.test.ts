/**
 * Stream Tests Placeholder
 * ========================
 *
 * The cassandra streaming endpoints have been removed.
 * Mobile app now talks directly to Python.
 *
 * This file is kept as a placeholder for future stream-related tests
 * if needed for other endpoints.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildServer } from '../index.js';

describe('Server Stream Endpoints', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = buildServer({ logger: false });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('server is running and healthy', async () => {
    const res = await request(server.server).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
