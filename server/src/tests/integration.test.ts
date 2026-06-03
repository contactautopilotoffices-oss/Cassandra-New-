import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildServer } from '../index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MOCK_SUPABASE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock_token_for_qa';
const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const VALID_PROPERTY_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

let server: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  server = buildServer({ logger: false });
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

// ---------------------------------------------------------------------------
// Health Endpoint Tests (Module 3.2)
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 OK with status ok', async () => {
    const response = await request(server.server)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    expect(response.body.version).toBe('1.0.0');
  });

  it('has correct response schema', async () => {
    const response = await request(server.server)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('version');
  });
});

describe('GET /health/live', () => {
  it('returns "alive" string', async () => {
    const response = await request(server.server)
      .get('/health/live')
      .expect(200);

    expect(response.text).toBe('alive');
  });
});

describe('GET /health/ready', () => {
  it('returns 503 when Supabase is not configured', async () => {
    const response = await request(server.server)
      .get('/health/ready')
      .expect(503);

    expect(response.body.status).toBe('not_ready');
    expect(response.body.database).toBe('not_configured');
  });
});

// ---------------------------------------------------------------------------
// Auth Endpoint Tests (Module 1.2)
// ---------------------------------------------------------------------------

describe('POST /auth/session', () => {
  it('returns 200 with mock token for valid JWT format', async () => {
    const response = await request(server.server)
      .post('/auth/session')
      .send({ token: MOCK_SUPABASE_TOKEN })
      .expect(200);

    // Field name matches cassandraAuthService.ts interface: cassandra_token
    expect(response.body.token).toBeDefined();
    expect(response.body.expires_at).toBeDefined();
    expect(response.body.user_id).toBeDefined();

    // Verify expires_at is a valid Unix timestamp (seconds) — matches mobile interface
    expect(typeof response.body.expires_at).toBe('number');
    expect(response.body.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('returns 400 when token is missing', async () => {
    const response = await request(server.server)
      .post('/auth/session')
      .send({})
      .expect(400);

    expect(response.body.error).toBeDefined();
    expect(response.body.message).toBeDefined();
  });

  it('returns 400 when token is empty string', async () => {
    const response = await request(server.server)
      .post('/auth/session')
      .send({ token: '' })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });
});

describe('POST /auth/logout', () => {
  it('returns 200 with success true', async () => {
    const response = await request(server.server)
      .post('/auth/logout')
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ticket Endpoint Tests (Module 2, 5)
// ---------------------------------------------------------------------------

describe('GET /tickets', () => {
  it('returns 200 with tickets array', async () => {
    const response = await request(server.server)
      .get('/tickets')
      .expect(200);

    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.total).toBeDefined();
    expect(response.body.limit).toBeDefined();
    expect(response.body.offset).toBeDefined();
  });

  it('uses correct column names (is_internal, raised_by)', async () => {
    const response = await request(server.server)
      .get('/tickets')
      .expect(200);

    const ticket = response.body.data[0];
    expect(ticket).toHaveProperty('is_internal');
    expect(ticket).toHaveProperty('raised_by');
    expect(ticket).toHaveProperty('photo_before_url');
    expect(ticket).toHaveProperty('photo_after_url');
  });

  it('filters by propertyId', async () => {
    const response = await request(server.server)
      .get(`/tickets?propertyId=${VALID_PROPERTY_UUID}`)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((ticket: any) => {
      expect(ticket.property_id).toBe(VALID_PROPERTY_UUID);
    });
  });

  it('filters by status', async () => {
    const response = await request(server.server)
      .get('/tickets?status=open')
      .expect(200);

    response.body.data.forEach((ticket: any) => {
      expect(ticket.status).toBe('open');
    });
  });

  it('supports pagination', async () => {
    const response = await request(server.server)
      .get('/tickets?limit=1&offset=0')
      .expect(200);

    expect(response.body.data.length).toBe(1);
    expect(response.body.limit).toBe(1);
    expect(response.body.offset).toBe(0);
  });
});

describe('GET /tickets/:id', () => {
  it('returns 200 with ticket data', async () => {
    const response = await request(server.server)
      .get(`/tickets/${VALID_UUID}`)
      .expect(200);

    expect(response.body.data).toBeDefined();
    expect(response.body.data.id).toBe(VALID_UUID);
  });

  it('returns 404 for non-existent ticket', async () => {
    const response = await request(server.server)
      .get('/tickets/99999999-9999-9999-9999-999999999999')
      .expect(404);

    expect(response.body.error).toBe('not_found');
  });
});

describe('POST /tickets', () => {
  it('creates a ticket with correct column names', async () => {
    const newTicket = {
      property_id: VALID_PROPERTY_UUID,
      title: 'Test Ticket from QA',
      description: 'Created by integration tests',
      priority: 'high',
      is_internal: true,
    };

    const response = await request(server.server)
      .post('/tickets')
      .send(newTicket)
      .expect(201);

    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.title).toBe(newTicket.title);
    expect(response.body.data.is_internal).toBe(true);
    expect(response.body.data.raised_by).toBeDefined(); // NOT created_by
  });

  it('returns 400 for invalid ticket data', async () => {
    const response = await request(server.server)
      .post('/tickets')
      .send({ title: '' }) // title is required
      .expect(400);

    expect(response.body.error).toBe('validation_error');
  });

  it('returns 400 when property_id is missing', async () => {
    const response = await request(server.server)
      .post('/tickets')
      .send({ title: 'Test' })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });
});

describe('POST /tickets/:id/comments', () => {
  it('creates a comment on a ticket', async () => {
    const response = await request(server.server)
      .post(`/tickets/${VALID_UUID}/comments`)
      .send({ comment: 'This is a test comment' })
      .expect(200);

    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.comment).toBe('This is a test comment');
    expect(response.body.data.ticket_id).toBe(VALID_UUID);
    expect(response.body.data.comment).toBeDefined(); // NOT content
  });

  it('returns 404 for non-existent ticket', async () => {
    const response = await request(server.server)
      .post('/tickets/99999999-9999-9999-9999-999999999999/comments')
      .send({ comment: 'Test' })
      .expect(404);

    expect(response.body.error).toBe('not_found');
  });

  it('returns 400 when comment is empty', async () => {
    const response = await request(server.server)
      .post(`/tickets/${VALID_UUID}/comments`)
      .send({ comment: '' })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// E2E Smoke Test
// ---------------------------------------------------------------------------

describe('E2E: Auth → Fetch Tickets → Add Comment', () => {
  it('complete flow: authenticate, list tickets, add comment', async () => {
    // Step 1: Authenticate
    const authResponse = await request(server.server)
      .post('/auth/session')
      .send({ token: MOCK_SUPABASE_TOKEN })
      .expect(200);

    expect(authResponse.body.token).toBeDefined();

    // Step 2: Fetch tickets
    const ticketsResponse = await request(server.server)
      .get('/tickets')
      .expect(200);

    expect(ticketsResponse.body.data.length).toBeGreaterThan(0);

    // Step 3: Add comment to first ticket
    const ticketId = ticketsResponse.body.data[0].id;
    const commentResponse = await request(server.server)
      .post(`/tickets/${ticketId}/comments`)
      .send({ comment: 'E2E smoke test comment' })
      .expect(200);

    expect(commentResponse.body.data.comment).toBe('E2E smoke test comment');
  });
});

// ---------------------------------------------------------------------------
// Property Endpoint Tests (Module 1.3)
// ---------------------------------------------------------------------------

describe('GET /properties', () => {
  it('returns 200 with properties array', async () => {
    const response = await request(server.server)
      .get('/properties')
      .expect(200);

    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.total).toBeDefined();
  });

  it('filters by organizationId (org_id scoping)', async () => {
    const response = await request(server.server)
      .get('/properties?organizationId=org_dev_001')
      .expect(200);

    response.body.data.forEach((prop: any) => {
      expect(prop.organization_id).toBe('org_dev_001');
    });
  });

  it('filters by status', async () => {
    const response = await request(server.server)
      .get('/properties?status=active')
      .expect(200);

    response.body.data.forEach((prop: any) => {
      expect(prop.status).toBe('active');
    });
  });

  it('searches by name', async () => {
    const response = await request(server.server)
      .get('/properties?search=Tech')
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('supports pagination', async () => {
    const response = await request(server.server)
      .get('/properties?limit=1&offset=0')
      .expect(200);

    expect(response.body.data.length).toBe(1);
    expect(response.body.limit).toBe(1);
    expect(response.body.offset).toBe(0);
  });
});

describe('GET /properties/:id', () => {
  it('returns 200 with property data', async () => {
    const response = await request(server.server)
      .get('/properties/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
      .expect(200);

    expect(response.body.data).toBeDefined();
    expect(response.body.data.name).toBe('Tech Park Alpha');
    expect(response.body.data.organization_id).toBeDefined();
  });

  it('returns 404 for non-existent property', async () => {
    const response = await request(server.server)
      .get('/properties/99999999-9999-9999-9999-999999999999')
      .expect(404);

    expect(response.body.error).toBe('not_found');
  });
});

describe('POST /properties', () => {
  it('creates a property with correct schema', async () => {
    const newProperty = {
      name: 'Test Property',
      organization_id: 'org_dev_001',
      type: 'commercial',
      address: '123 Test St',
    };

    const response = await request(server.server)
      .post('/properties')
      .send(newProperty)
      .expect(201);

    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.name).toBe('Test Property');
    expect(response.body.data.organization_id).toBe('org_dev_001');
    expect(response.body.data.status).toBe('active');
  });

  it('returns 400 for missing name', async () => {
    const response = await request(server.server)
      .post('/properties')
      .send({ organization_id: 'org_dev_001' })
      .expect(400);

    expect(response.body.error).toBe('validation_error');
  });
});

describe('GET /properties/:id/features', () => {
  it('returns available modules for property', async () => {
    const response = await request(server.server)
      .get('/properties/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/features')
      .expect(200);

    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.data.length).toBeGreaterThan(0);

    // Verify module structure
    response.body.data.forEach((m: any) => {
      expect(m).toHaveProperty('module');
      expect(m).toHaveProperty('enabled');
    });
  });
});
