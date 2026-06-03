"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const index_js_1 = require("../index.js");
// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const MOCK_SUPABASE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock_token_for_qa';
const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const VALID_PROPERTY_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
let server;
(0, vitest_1.beforeAll)(async () => {
    server = (0, index_js_1.buildServer)({ logger: false });
    await server.ready();
});
(0, vitest_1.afterAll)(async () => {
    await server.close();
});
// ---------------------------------------------------------------------------
// Health Endpoint Tests (Module 3.2)
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GET /health', () => {
    (0, vitest_1.it)('returns 200 OK with status ok', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/health')
            .expect(200);
        (0, vitest_1.expect)(response.body.status).toBe('ok');
        (0, vitest_1.expect)(response.body.timestamp).toBeDefined();
        (0, vitest_1.expect)(response.body.uptime).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(response.body.version).toBe('1.0.0');
    });
    (0, vitest_1.it)('has correct response schema', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/health')
            .expect(200);
        (0, vitest_1.expect)(response.body).toHaveProperty('status');
        (0, vitest_1.expect)(response.body).toHaveProperty('timestamp');
        (0, vitest_1.expect)(response.body).toHaveProperty('uptime');
        (0, vitest_1.expect)(response.body).toHaveProperty('version');
    });
});
(0, vitest_1.describe)('GET /health/live', () => {
    (0, vitest_1.it)('returns "alive" string', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/health/live')
            .expect(200);
        (0, vitest_1.expect)(response.text).toBe('alive');
    });
});
(0, vitest_1.describe)('GET /health/ready', () => {
    (0, vitest_1.it)('returns 503 when Supabase is not configured', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/health/ready')
            .expect(503);
        (0, vitest_1.expect)(response.body.status).toBe('not_ready');
        (0, vitest_1.expect)(response.body.database).toBe('not_configured');
    });
});
// ---------------------------------------------------------------------------
// Auth Endpoint Tests (Module 1.2)
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('POST /auth/session', () => {
    (0, vitest_1.it)('returns 200 with mock token for valid JWT format', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .post('/auth/session')
            .send({ token: MOCK_SUPABASE_TOKEN })
            .expect(200);
        // Field name matches cassandraAuthService.ts interface: cassandra_token
        (0, vitest_1.expect)(response.body.token).toBeDefined();
        (0, vitest_1.expect)(response.body.expires_at).toBeDefined();
        (0, vitest_1.expect)(response.body.user_id).toBeDefined();
        // Verify expires_at is a valid Unix timestamp (seconds) — matches mobile interface
        (0, vitest_1.expect)(typeof response.body.expires_at).toBe('number');
        (0, vitest_1.expect)(response.body.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
    (0, vitest_1.it)('returns 400 when token is missing', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .post('/auth/session')
            .send({})
            .expect(400);
        (0, vitest_1.expect)(response.body.error).toBeDefined();
        (0, vitest_1.expect)(response.body.message).toBeDefined();
    });
    (0, vitest_1.it)('returns 400 when token is empty string', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .post('/auth/session')
            .send({ token: '' })
            .expect(400);
        (0, vitest_1.expect)(response.body.error).toBeDefined();
    });
});
(0, vitest_1.describe)('POST /auth/logout', () => {
    (0, vitest_1.it)('returns 200 with success true', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .post('/auth/logout')
            .expect(200);
        (0, vitest_1.expect)(response.body.success).toBe(true);
    });
});
// ---------------------------------------------------------------------------
// Ticket Endpoint Tests (Module 2, 5)
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GET /tickets', () => {
    (0, vitest_1.it)('returns 200 with tickets array', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/tickets')
            .expect(200);
        (0, vitest_1.expect)(response.body.data).toBeInstanceOf(Array);
        (0, vitest_1.expect)(response.body.data.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(response.body.total).toBeDefined();
        (0, vitest_1.expect)(response.body.limit).toBeDefined();
        (0, vitest_1.expect)(response.body.offset).toBeDefined();
    });
    (0, vitest_1.it)('uses correct column names (is_internal, raised_by)', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/tickets')
            .expect(200);
        const ticket = response.body.data[0];
        (0, vitest_1.expect)(ticket).toHaveProperty('is_internal');
        (0, vitest_1.expect)(ticket).toHaveProperty('raised_by');
        (0, vitest_1.expect)(ticket).toHaveProperty('photo_before_url');
        (0, vitest_1.expect)(ticket).toHaveProperty('photo_after_url');
    });
    (0, vitest_1.it)('filters by propertyId', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get(`/tickets?propertyId=${VALID_PROPERTY_UUID}`)
            .expect(200);
        (0, vitest_1.expect)(response.body.data.length).toBeGreaterThan(0);
        response.body.data.forEach((ticket) => {
            (0, vitest_1.expect)(ticket.property_id).toBe(VALID_PROPERTY_UUID);
        });
    });
    (0, vitest_1.it)('filters by status', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/tickets?status=open')
            .expect(200);
        response.body.data.forEach((ticket) => {
            (0, vitest_1.expect)(ticket.status).toBe('open');
        });
    });
    (0, vitest_1.it)('supports pagination', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/tickets?limit=1&offset=0')
            .expect(200);
        (0, vitest_1.expect)(response.body.data.length).toBe(1);
        (0, vitest_1.expect)(response.body.limit).toBe(1);
        (0, vitest_1.expect)(response.body.offset).toBe(0);
    });
});
(0, vitest_1.describe)('GET /tickets/:id', () => {
    (0, vitest_1.it)('returns 200 with ticket data', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get(`/tickets/${VALID_UUID}`)
            .expect(200);
        (0, vitest_1.expect)(response.body.data).toBeDefined();
        (0, vitest_1.expect)(response.body.data.id).toBe(VALID_UUID);
    });
    (0, vitest_1.it)('returns 404 for non-existent ticket', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/tickets/99999999-9999-9999-9999-999999999999')
            .expect(404);
        (0, vitest_1.expect)(response.body.error).toBe('not_found');
    });
});
(0, vitest_1.describe)('POST /tickets', () => {
    (0, vitest_1.it)('creates a ticket with correct column names', async () => {
        const newTicket = {
            property_id: VALID_PROPERTY_UUID,
            title: 'Test Ticket from QA',
            description: 'Created by integration tests',
            priority: 'high',
            is_internal: true,
        };
        const response = await (0, supertest_1.default)(server.server)
            .post('/tickets')
            .send(newTicket)
            .expect(201);
        (0, vitest_1.expect)(response.body.data.id).toBeDefined();
        (0, vitest_1.expect)(response.body.data.title).toBe(newTicket.title);
        (0, vitest_1.expect)(response.body.data.is_internal).toBe(true);
        (0, vitest_1.expect)(response.body.data.raised_by).toBeDefined(); // NOT created_by
    });
    (0, vitest_1.it)('returns 400 for invalid ticket data', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .post('/tickets')
            .send({ title: '' }) // title is required
            .expect(400);
        (0, vitest_1.expect)(response.body.error).toBe('validation_error');
    });
    (0, vitest_1.it)('returns 400 when property_id is missing', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .post('/tickets')
            .send({ title: 'Test' })
            .expect(400);
        (0, vitest_1.expect)(response.body.error).toBeDefined();
    });
});
(0, vitest_1.describe)('POST /tickets/:id/comments', () => {
    (0, vitest_1.it)('creates a comment on a ticket', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .post(`/tickets/${VALID_UUID}/comments`)
            .send({ comment: 'This is a test comment' })
            .expect(200);
        (0, vitest_1.expect)(response.body.data.id).toBeDefined();
        (0, vitest_1.expect)(response.body.data.comment).toBe('This is a test comment');
        (0, vitest_1.expect)(response.body.data.ticket_id).toBe(VALID_UUID);
        (0, vitest_1.expect)(response.body.data.comment).toBeDefined(); // NOT content
    });
    (0, vitest_1.it)('returns 404 for non-existent ticket', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .post('/tickets/99999999-9999-9999-9999-999999999999/comments')
            .send({ comment: 'Test' })
            .expect(404);
        (0, vitest_1.expect)(response.body.error).toBe('not_found');
    });
    (0, vitest_1.it)('returns 400 when comment is empty', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .post(`/tickets/${VALID_UUID}/comments`)
            .send({ comment: '' })
            .expect(400);
        (0, vitest_1.expect)(response.body.error).toBeDefined();
    });
});
// ---------------------------------------------------------------------------
// E2E Smoke Test
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('E2E: Auth → Fetch Tickets → Add Comment', () => {
    (0, vitest_1.it)('complete flow: authenticate, list tickets, add comment', async () => {
        // Step 1: Authenticate
        const authResponse = await (0, supertest_1.default)(server.server)
            .post('/auth/session')
            .send({ token: MOCK_SUPABASE_TOKEN })
            .expect(200);
        (0, vitest_1.expect)(authResponse.body.token).toBeDefined();
        // Step 2: Fetch tickets
        const ticketsResponse = await (0, supertest_1.default)(server.server)
            .get('/tickets')
            .expect(200);
        (0, vitest_1.expect)(ticketsResponse.body.data.length).toBeGreaterThan(0);
        // Step 3: Add comment to first ticket
        const ticketId = ticketsResponse.body.data[0].id;
        const commentResponse = await (0, supertest_1.default)(server.server)
            .post(`/tickets/${ticketId}/comments`)
            .send({ comment: 'E2E smoke test comment' })
            .expect(200);
        (0, vitest_1.expect)(commentResponse.body.data.comment).toBe('E2E smoke test comment');
    });
});
// ---------------------------------------------------------------------------
// Property Endpoint Tests (Module 1.3)
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('GET /properties', () => {
    (0, vitest_1.it)('returns 200 with properties array', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/properties')
            .expect(200);
        (0, vitest_1.expect)(response.body.data).toBeInstanceOf(Array);
        (0, vitest_1.expect)(response.body.data.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(response.body.total).toBeDefined();
    });
    (0, vitest_1.it)('filters by organizationId (org_id scoping)', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/properties?organizationId=org_dev_001')
            .expect(200);
        response.body.data.forEach((prop) => {
            (0, vitest_1.expect)(prop.organization_id).toBe('org_dev_001');
        });
    });
    (0, vitest_1.it)('filters by status', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/properties?status=active')
            .expect(200);
        response.body.data.forEach((prop) => {
            (0, vitest_1.expect)(prop.status).toBe('active');
        });
    });
    (0, vitest_1.it)('searches by name', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/properties?search=Tech')
            .expect(200);
        (0, vitest_1.expect)(response.body.data.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('supports pagination', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/properties?limit=1&offset=0')
            .expect(200);
        (0, vitest_1.expect)(response.body.data.length).toBe(1);
        (0, vitest_1.expect)(response.body.limit).toBe(1);
        (0, vitest_1.expect)(response.body.offset).toBe(0);
    });
});
(0, vitest_1.describe)('GET /properties/:id', () => {
    (0, vitest_1.it)('returns 200 with property data', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/properties/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
            .expect(200);
        (0, vitest_1.expect)(response.body.data).toBeDefined();
        (0, vitest_1.expect)(response.body.data.name).toBe('Tech Park Alpha');
        (0, vitest_1.expect)(response.body.data.organization_id).toBeDefined();
    });
    (0, vitest_1.it)('returns 404 for non-existent property', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/properties/99999999-9999-9999-9999-999999999999')
            .expect(404);
        (0, vitest_1.expect)(response.body.error).toBe('not_found');
    });
});
(0, vitest_1.describe)('POST /properties', () => {
    (0, vitest_1.it)('creates a property with correct schema', async () => {
        const newProperty = {
            name: 'Test Property',
            organization_id: 'org_dev_001',
            type: 'commercial',
            address: '123 Test St',
        };
        const response = await (0, supertest_1.default)(server.server)
            .post('/properties')
            .send(newProperty)
            .expect(201);
        (0, vitest_1.expect)(response.body.data.id).toBeDefined();
        (0, vitest_1.expect)(response.body.data.name).toBe('Test Property');
        (0, vitest_1.expect)(response.body.data.organization_id).toBe('org_dev_001');
        (0, vitest_1.expect)(response.body.data.status).toBe('active');
    });
    (0, vitest_1.it)('returns 400 for missing name', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .post('/properties')
            .send({ organization_id: 'org_dev_001' })
            .expect(400);
        (0, vitest_1.expect)(response.body.error).toBe('validation_error');
    });
});
(0, vitest_1.describe)('GET /properties/:id/features', () => {
    (0, vitest_1.it)('returns available modules for property', async () => {
        const response = await (0, supertest_1.default)(server.server)
            .get('/properties/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/features')
            .expect(200);
        (0, vitest_1.expect)(response.body.data).toBeInstanceOf(Array);
        (0, vitest_1.expect)(response.body.data.length).toBeGreaterThan(0);
        // Verify module structure
        response.body.data.forEach((m) => {
            (0, vitest_1.expect)(m).toHaveProperty('module');
            (0, vitest_1.expect)(m).toHaveProperty('enabled');
        });
    });
});
//# sourceMappingURL=integration.test.js.map