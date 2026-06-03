"use strict";
/**
 * Context Hydration Plugin — Fastify
 * ==================================
 *
 * Implements PRD Section 5: Mobile (Expo) Requirements
 * - 24-hour TTL for membership data
 * - Context hydration: user_id, organization_id, allowed_property_ids, membership_id
 * - Purge all tokens and cache on SIGNED_OUT
 *
 * Architecture:
 *   Mobile App → Fastify (port 3001)
 *     → AuthContext fetches membership
 *     → Caches to AsyncStorage (24h TTL)
 *
 * Module: 4.2
 * Status: ACTIVE
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.contextPlugin = void 0;
const zod_1 = require("zod");
const supabase_js_1 = require("../utils/supabase.js");
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
// In-memory cache (production: Redis or AsyncStorage bridge)
const membershipCache = new Map();
// ---------------------------------------------------------------------------
// Cache Helpers
// ---------------------------------------------------------------------------
function cacheKey(userId, orgId) {
    return `${userId}:${orgId}`;
}
function getCachedMembership(userId, orgId) {
    const key = cacheKey(userId, orgId);
    const cached = membershipCache.get(key);
    if (!cached)
        return null;
    if (Date.now() > cached.expiresAt) {
        membershipCache.delete(key);
        return null;
    }
    return cached;
}
function setCachedMembership(data) {
    const key = cacheKey(data.userId, data.orgId);
    membershipCache.set(key, data);
}
function invalidateMembership(userId, orgId) {
    const key = cacheKey(userId, orgId);
    membershipCache.delete(key);
}
function purgeAllMemberships() {
    membershipCache.clear();
}
// ---------------------------------------------------------------------------
// JWT Extraction
// ---------------------------------------------------------------------------
function extractBearerToken(authHeader) {
    if (!authHeader)
        return null;
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        return parts[1];
    }
    return null;
}
function decodeJwtPayload(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        let payload = parts[1];
        const padding = 4 - (payload.length % 4);
        if (padding !== 4)
            payload += '='.repeat(padding);
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// Membership Schema
// ---------------------------------------------------------------------------
const MembershipQuerySchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
    orgId: zod_1.z.string().uuid(),
});
// ---------------------------------------------------------------------------
// Context Hydration Plugin
// ---------------------------------------------------------------------------
const contextPlugin = async (fastify) => {
    // ── POST /context/hydrate ────────────────────────────────────────────────
    /**
     * Called by AuthContext after SIGNED_IN to hydrate membership data.
     * Fetches from source (Supabase), caches (24h TTL).
     *
     * PRD: "Hydration: streamChat() must be hydrated with user_id,
     *       organization_id, allowed_property_ids, and membership_id."
     */
    fastify.post('/context/hydrate', async (request, reply) => {
        const parseResult = MembershipQuerySchema.safeParse(request.body);
        if (!parseResult.success) {
            reply.status(400);
            return {
                error: 'validation_error',
                message: parseResult.error.errors.map((e) => e.message).join(', '),
            };
        }
        const { userId, orgId } = parseResult.data;
        // Check cache first
        const cached = getCachedMembership(userId, orgId);
        if (cached) {
            fastify.log.debug(`[CONTEXT] Cache hit for user=${userId}, org=${orgId}`);
            return {
                data: cached,
                source: 'cache',
                ttlRemainingMs: cached.expiresAt - Date.now(),
            };
        }
        // Fetch fresh from Supabase
        try {
            // Step 1: Fetch organization membership (includes role)
            const { data: membershipRow, error: membershipErr } = await supabase_js_1.supabaseAdmin
                .from('organization_memberships')
                .select('id, role, email')
                .eq('user_id', userId)
                .eq('organization_id', orgId)
                .or('is_active.eq.true,is_active.is.null')
                .maybeSingle();
            if (membershipErr) {
                fastify.log.error(`[CONTEXT] Membership query failed: ${membershipErr.message}`);
                reply.status(503);
                return { error: 'membership_query_failed', message: membershipErr.message };
            }
            if (!membershipRow) {
                fastify.log.warn(`[CONTEXT] No membership found for user=${userId}, org=${orgId}`);
                reply.status(403);
                return { error: 'no_membership', message: 'User does not belong to this organization' };
            }
            const userRole = membershipRow.role;
            const userEmail = membershipRow.email;
            const membershipId = membershipRow.id;
            // Step 2: Fetch property memberships for this user
            const { data: propertyMemberships, error: propMemberErr } = await supabase_js_1.supabaseAdmin
                .from('property_memberships')
                .select('property_id, property(id, name, code, image_url)')
                .eq('user_id', userId)
                .or('is_active.eq.true,is_active.is.null');
            if (propMemberErr) {
                fastify.log.error(`[CONTEXT] Property membership query failed: ${propMemberErr.message}`);
                // Non-fatal — continue with empty property list
            }
            let propertyMetadata = {};
            const allowedPropertyIds = [];
            // Collect properties from explicit memberships
            if (propertyMemberships && propertyMemberships.length > 0) {
                for (const pm of propertyMemberships) {
                    if (pm.property) {
                        const prop = pm.property;
                        allowedPropertyIds.push(prop.id);
                        propertyMetadata[prop.id] = {
                            name: prop.name,
                            code: prop.code,
                            imageUrl: prop.image_url,
                        };
                    }
                }
            }
            // Step 3: If user is org admin, auto-inject all org properties
            const ORG_ADMIN_ROLES = ['org_super_admin', 'org_admin', 'owner'];
            if (ORG_ADMIN_ROLES.includes(userRole)) {
                const { data: orgProperties, error: orgPropsErr } = await supabase_js_1.supabaseAdmin
                    .from('properties')
                    .select('id, name, code, image_url')
                    .eq('organization_id', orgId);
                if (orgPropsErr) {
                    fastify.log.error(`[CONTEXT] Org properties query failed: ${orgPropsErr.message}`);
                    // Non-fatal
                }
                else if (orgProperties) {
                    for (const prop of orgProperties) {
                        if (!allowedPropertyIds.includes(prop.id)) {
                            allowedPropertyIds.push(prop.id);
                            propertyMetadata[prop.id] = {
                                name: prop.name,
                                code: prop.code,
                                imageUrl: prop.image_url,
                            };
                        }
                    }
                    fastify.log.info(`[CONTEXT] Auto-injected ${orgProperties.length} org properties for org_admin user`);
                }
            }
            const now = Date.now();
            const membershipData = {
                userId,
                orgId,
                email: userEmail,
                role: userRole,
                membershipId,
                allowedPropertyIds,
                propertyMetadata,
                cachedAt: now,
                expiresAt: now + CACHE_TTL_MS,
            };
            // Cache it
            setCachedMembership(membershipData);
            fastify.log.info(`[CONTEXT] Hydrated membership for user=${userId}, org=${orgId}, role=${userRole}, properties=${allowedPropertyIds.length}`);
            return {
                data: membershipData,
                source: 'network',
                ttlRemainingMs: CACHE_TTL_MS,
            };
        }
        catch (err) {
            fastify.log.error(`[CONTEXT] Unexpected error during hydration: ${err}`);
            reply.status(500);
            return { error: 'hydration_failed', message: 'Unexpected error during context hydration' };
        }
    });
    // ── GET /context/status ────────────────────────────────────────────────
    /**
     * Return current membership status (cache hit/miss, TTL remaining).
     */
    fastify.get('/context/status', async (request, reply) => {
        const authHeader = request.headers.authorization;
        const token = extractBearerToken(authHeader);
        if (!token) {
            reply.status(401);
            return { error: 'unauthorized' };
        }
        const payload = decodeJwtPayload(token);
        if (!payload) {
            reply.status(401);
            return { error: 'invalid_token' };
        }
        const userId = payload.sub;
        const orgId = (payload.org_id || payload.organization_id);
        if (!userId || !orgId) {
            reply.status(400);
            return { error: 'missing_identity' };
        }
        const cached = getCachedMembership(userId, orgId);
        if (cached) {
            return {
                status: 'cached',
                ttlRemainingMs: cached.expiresAt - Date.now(),
                role: cached.role,
                propertyCount: cached.allowedPropertyIds.length,
            };
        }
        return { status: 'not_cached', ttlRemainingMs: 0 };
    });
    // ── DELETE /context/purge ─────────────────────────────────────────────
    /**
     * Called on SIGNED_OUT.
     * PRD: "Purge: Clear all tokens and AsyncStorage cache on SIGNED_OUT."
     */
    fastify.delete('/context/purge', async (request, reply) => {
        const parseResult = zod_1.z.object({
            userId: zod_1.z.string().uuid(),
            orgId: zod_1.z.string().uuid(),
        }).safeParse(request.body);
        if (!parseResult.success) {
            reply.status(400);
            return { error: 'validation_error' };
        }
        const { userId, orgId } = parseResult.data;
        // Invalidate membership cache
        invalidateMembership(userId, orgId);
        // In production: also clear SecureStore tokens
        fastify.log.info(`[CONTEXT] Purged context for user=${userId}, org=${orgId}`);
        return { success: true, purged: { userId, orgId } };
    });
    // ── DELETE /context/purge-all ─────────────────────────────────────────
    /** Purge all cached memberships (admin only — e.g., system-wide logout). */
    fastify.delete('/context/purge-all', async (request, reply) => {
        const count = membershipCache.size;
        purgeAllMemberships();
        fastify.log.info(`[CONTEXT] Purged all ${count} cached memberships`);
        return { success: true, purgedCount: count };
    });
};
exports.contextPlugin = contextPlugin;
//# sourceMappingURL=context.js.map