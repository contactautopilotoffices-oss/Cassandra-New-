import { SupabaseClient } from '@supabase/supabase-js';

declare module 'fastify' {
  interface FastifyRequest {
    supabase?: SupabaseClient;
  }
}
