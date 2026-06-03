import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Admin Supabase client using service_role key.
 * This client BYPASSES Row Level Security (RLS) policies.
 *
 * Use ONLY for:
 * - Server-side admin operations that require elevated privileges
 * - Writing to user_voice_embeddings during enrollment
 *
 * WARNING: Never expose this client to the browser!
 */
export function createAdminClient() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.CASSANDRA_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase admin credentials. ' +
      'Ensure EXPO_PUBLIC_SUPABASE_URL and CASSANDRA_SUPABASE_SERVICE_ROLE_KEY are set.'
    );
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
