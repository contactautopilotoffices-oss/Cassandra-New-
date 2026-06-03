/**
 * JWT Authentication Comprehensive Tests
 * =======================================
 *
 * Tests all JWT authentication scenarios:
 * 1. Valid signature - properly signed JWTs are accepted
 * 2. Expired JWT - expired tokens are rejected with proper error
 * 3. Forged JWT - tampered/invalid signature tokens are rejected
 * 4. Missing org_id - JWTs without org_id are rejected with MISSING_ORG_ID error
 * 5. Token store registration - valid tokens are registered with Python orchestrator
 * 6. Token validation - registered tokens can be validated
 * 7. TTL enforcement - tokens expire after TTL
 *
 * Module: 1.1 Auth Handshake (QA Verification)
 * PRD Reference: Section 4 (Two-Layer Auth), Section 7 (Production Safety)
 */
export {};
//# sourceMappingURL=test-auth-jwt.test.d.ts.map