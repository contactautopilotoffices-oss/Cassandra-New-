/**
 * Supabase Server Client — FMS Data (Expo project)
 * =================================================
 *
 * Uses the Expo/FMS Supabase project for all facility management data:
 * tickets, properties, memberships, etc.
 */

import { createClient } from '@supabase/supabase-js';

// FMS/Expo project — where tickets, properties, users live
const fmsSupabaseUrl = process.env.FMS_SUPABASE_URL;
const fmsServiceRoleKey = process.env.AUTH_SUPABASE_SERVICE_ROLE_KEY; // Service role for FMS project
const fmsAnonKey = process.env.FMS_SUPABASE_ANON_KEY;

if (!fmsSupabaseUrl || !fmsServiceRoleKey || !fmsAnonKey) {
  throw new Error(
    'Missing FMS Supabase credentials: FMS_SUPABASE_URL, AUTH_SUPABASE_SERVICE_ROLE_KEY, FMS_SUPABASE_ANON_KEY'
  );
}

/**
 * Admin client (service role) for FMS data.
 * Can read all tenant data without RLS restrictions.
 */
export const supabaseAdmin = createClient(fmsSupabaseUrl, fmsServiceRoleKey);

/**
 * Anon client for FMS data — respects RLS policies.
 */
export const supabaseAnon = createClient(fmsSupabaseUrl, fmsAnonKey);
