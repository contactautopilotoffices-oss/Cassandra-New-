import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const TokenExchangeRequestSchema = z.object({
  token: z.string().min(1, 'Supabase JWT token is required'),
});

// Response schema for token exchange
const TokenExchangeResponseSchema = z.object({
  token: z.string(),
  expires_at: z.number(),
  user_id: z.string(),
  org_id: z.string(),
  role: z.string(),
  allowed_property_ids: z.array(z.string()),
  membership_id: z.string().optional(),
});

const TokenErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

// ---------------------------------------------------------------------------
// JWT Verification Helper
// ---------------------------------------------------------------------------

async function verifySupabaseJWT(token: string, secret: string): Promise<{
  sub: string;
  org_id?: string;
  role?: string;
  exp: number;
} | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode payload to get exp
    const payloadDecoded = Buffer.from(
      payloadB64.replace(/-/g, '+').replace(/_/g, '/') +
      '='.repeat((4 - (payloadB64.length % 4)) % 4),
      'base64'
    ).toString('utf8');
    const payload = JSON.parse(payloadDecoded);

    // Verify signature using HMAC-SHA256
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Decode signature
    const sigBase64 = signatureB64.replace(/-/g, '+').replace(/_/g, '/') +
      '='.repeat((4 - (signatureB64.length % 4)) % 4);
    const signatureData = Buffer.from(sigBase64, 'base64');

    // Verify
    const messageData = encoder.encode(`${headerB64}.${payloadB64}`);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      signatureData,
      messageData
    );

    if (!isValid) {
      console.warn('[Auth] JWT signature verification failed');
      return null;
    }

    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      console.warn('[Auth] JWT has expired');
      return null;
    }

    return payload;
  } catch (err) {
    console.error('[Auth] JWT verification error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? '';

  /**
   * POST /auth/session
   * Exchanges a Supabase JWT for a server session token.
   */
  fastify.post('/auth/session', async (request, reply) => {
    const parseResult = TokenExchangeRequestSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.status(400);
      return {
        error: 'invalid_request',
        message: parseResult.error.errors.map(e => e.message).join(', '),
      };
    }

    const { token } = parseResult.data;
    const isProduction = process.env.NODE_ENV === 'production';

    // ── Production: Verify JWT signature ──────────────────────────────────
    if (isProduction) {
      if (!SUPABASE_JWT_SECRET) {
        fastify.log.error('[Auth] SUPABASE_JWT_SECRET not configured');
        reply.status(500);
        return {
          error: 'server_error',
          message: 'JWT secret not configured',
        };
      }

      const payload = await verifySupabaseJWT(token, SUPABASE_JWT_SECRET);
      if (!payload) {
        reply.status(401);
        return {
          error: 'invalid_token',
          message: 'Supabase token invalid or expired',
        };
      }

      // Generate session token
      const sessionToken = `session_${Buffer.from(token).toString('base64').substring(0, 32)}`;
      const expiresAtSeconds = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour

      // Extract org_id from JWT (may need to fetch from membership table)
      const orgId = payload.org_id || 'default_org';
      const role = payload.role || 'tenant';

      fastify.log.info(
        { userId: payload.sub, orgId, role },
        'Token exchange successful (production)'
      );

      return {
        token: sessionToken,
        expires_at: expiresAtSeconds,
        user_id: payload.sub,
        org_id: orgId,
        role,
        allowed_property_ids: [],
      };
    }

    // ── Dev Mode: Generate mock token ──────────────────────────────────────
    fastify.log.info({ tokenPrefix: token.substring(0, 20) }, 'Token exchange successful (dev mode)');

    const expiresAtSeconds = Math.floor(Date.now() / 1000) + 60 * 60;

    return {
      token: `session_mock_${Buffer.from(token).toString('base64').substring(0, 32)}`,
      expires_at: expiresAtSeconds,
      user_id: 'dev_user_id',
      org_id: 'dev_org_id',
      role: 'org_admin',
      allowed_property_ids: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
    };
  });

  /**
   * POST /auth/logout
   * Clears session on the server side (if applicable).
   */
  fastify.post('/auth/logout', {
    schema: {
      description: 'Logout — clears server-side session',
      tags: ['auth'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
      },
    },
  }, async () => {
    return { success: true };
  });
};
