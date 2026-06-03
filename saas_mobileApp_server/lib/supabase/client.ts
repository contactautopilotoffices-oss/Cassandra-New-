import { createClient } from "@supabase/supabase-js";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createAnonClient(accessToken?: string) {
  const url = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createClient(url, anonKey, {
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      : undefined,
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
