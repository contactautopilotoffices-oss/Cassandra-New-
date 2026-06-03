/**
 * Supabase Server Client — FMS Data (Expo project)
 * =================================================
 *
 * Uses the Expo/FMS Supabase project for all facility management data:
 * tickets, properties, memberships, etc.
 */
/**
 * Admin client (service role) for FMS data.
 * Can read all tenant data without RLS restrictions.
 */
export declare const supabaseAdmin: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
/**
 * Anon client for FMS data — respects RLS policies.
 */
export declare const supabaseAnon: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
//# sourceMappingURL=supabase.d.ts.map