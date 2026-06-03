import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client authenticated with a Bearer token from the Authorization header.
 * Use this when mobile apps call API routes with `Authorization: Bearer <token>`.
 */
export function createClientFromToken(accessToken: string) {
  return createSupabaseClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

/**
 * Extract bearer token from an Authorization header value.
 * Returns null if the header is missing or malformed.
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
