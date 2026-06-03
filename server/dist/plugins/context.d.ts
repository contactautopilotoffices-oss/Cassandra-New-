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
import { FastifyPluginAsync } from 'fastify';
export declare const contextPlugin: FastifyPluginAsync;
//# sourceMappingURL=context.d.ts.map