"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const index_js_1 = require("../index.js");
(0, vitest_1.describe)('Server Stream Endpoints', () => {
    let server;
    (0, vitest_1.beforeAll)(async () => {
        server = (0, index_js_1.buildServer)({ logger: false });
        await server.ready();
    });
    (0, vitest_1.afterAll)(async () => {
        await server.close();
    });
    (0, vitest_1.it)('server is running and healthy', async () => {
        const res = await (0, supertest_1.default)(server.server).get('/health');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body.status).toBe('ok');
    });
});
//# sourceMappingURL=test-chat-stream.test.js.map