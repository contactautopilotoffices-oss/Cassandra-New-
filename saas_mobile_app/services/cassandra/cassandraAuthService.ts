/**
 * Cassandra Auth Service — Simple Membership-Based Sessions
 *
 * Flow:
 *   1. Mobile calls POST /cassandra/session { user_id, property_id }
 *   2. Server validates property_memberships in FMS Supabase
 *   3. Server returns session_token (base64 encoded, 6-hour TTL)
 *   4. Mobile caches token in SecureStore
 *   5. All /chat/stream calls use Bearer session_token
 *
 * No JWT verification. No JWKS. No dual Supabase lookups.
 * Just validate membership once, then use the session token.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase } from '@/utils/supabase/client';

const TOKEN_KEY = 'cassandra_session_token';
const EXPIRES_KEY = 'cassandra_session_expires';
const ORG_ID_KEY = 'cassandra_org_id';
const PROPERTY_ID_KEY = 'cassandra_property_id';
const REFRESH_BUFFER_SECONDS = 300; // 5 minutes before expiry

const DEFAULT_URL = 'https://www.back2basiics.com';
const API_URL = (
  process.env.EXPO_PUBLIC_VOICE_API_URL ??
  process.env.EXPO_PUBLIC_CASSANDRA_API_URL ??
  DEFAULT_URL
).replace(/\/$/, '');

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function removeSecureItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

// ─── Session token accessors ─────────────────────────────────────────────────

export async function getCassandraToken(): Promise<string | null> {
  return getSecureItem(TOKEN_KEY);
}

export async function getOrgId(): Promise<string | null> {
  return getSecureItem(ORG_ID_KEY);
}

export async function getPropertyId(): Promise<string | null> {
  return getSecureItem(PROPERTY_ID_KEY);
}

// ─── Token validation ────────────────────────────────────────────────────────

export async function isTokenValid(): Promise<boolean> {
  const token = await getCassandraToken();
  if (!token) return false;
  const raw = await getSecureItem(EXPIRES_KEY);
  if (!raw) return false;
  const expires = parseInt(raw, 10);
  return (Date.now() / 1000) < (expires - REFRESH_BUFFER_SECONDS);
}

// ─── Session response type ───────────────────────────────────────────────────

export interface SessionResponse {
  session_token: string;
  org_id: string;
  property_id: string;
  user_id: string;
  role: string | null;
  expires_at: number;
  org_name: string | null;
  property_name: string | null;
}

// ─── Create session (the only auth call needed) ──────────────────────────────

export async function createSession(propertyId: string): Promise<SessionResponse> {
  // Get user_id from Supabase (we just need the ID, not the JWT)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    throw new Error('Not signed in. Please log in first.');
  }

  console.log(`[CassandraAuth] Creating session: user=${user.id.substring(0, 8)}... property=${propertyId.substring(0, 8)}...`);

  const res = await fetch(`${API_URL}/cassandra/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: user.id,
      property_id: propertyId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      throw new Error('You do not have access to this property.');
    }
    throw new Error(`Session creation failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as SessionResponse;

  // Cache everything
  await setSecureItem(TOKEN_KEY, data.session_token);
  await setSecureItem(EXPIRES_KEY, String(data.expires_at));
  await setSecureItem(ORG_ID_KEY, data.org_id);
  await setSecureItem(PROPERTY_ID_KEY, data.property_id);

  console.log(`[CassandraAuth] Session created. org=${data.org_id.substring(0, 8)}... expires=${new Date(data.expires_at * 1000).toISOString()}`);

  return data;
}

// ─── Get valid token (cached or fresh) ───────────────────────────────────────

/**
 * Returns a valid session token, creating a new session if needed.
 * When propertyId is not provided, falls back to any cached token.
 *
 * @param propertyId - Optional property ID. If not provided, uses cached token if valid.
 */
export async function getValidToken(propertyId?: string): Promise<string> {
  // Check if we have a valid cached token
  if (await isTokenValid()) {
    const cachedProperty = await getSecureItem(PROPERTY_ID_KEY);
    // If specific propertyId requested, must match cached property
    if (!propertyId || cachedProperty === propertyId) {
      const token = await getCassandraToken();
      if (token) return token;
    }
  }

  // No valid cached token — must have propertyId to create new session
  if (!propertyId) {
    const cachedProperty = await getSecureItem(PROPERTY_ID_KEY);
    if (cachedProperty) {
      // Use cached property ID to create session
      const session = await createSession(cachedProperty);
      return session.session_token;
    }
    throw new Error('Cannot get Cassandra token: no propertyId provided and no cached session found');
  }

  // Create new session with specified propertyId
  const session = await createSession(propertyId);
  return session.session_token;
}

// ─── Clear session ───────────────────────────────────────────────────────────

export async function clearToken(): Promise<void> {
  await removeSecureItem(TOKEN_KEY);
  await removeSecureItem(EXPIRES_KEY);
  await removeSecureItem(ORG_ID_KEY);
  await removeSecureItem(PROPERTY_ID_KEY);
}

// ─── WebSocket URL ───────────────────────────────────────────────────────────

export function getWebSocketUrl(orgId: string): string {
  const wsUrl = API_URL.replace(/^http/, 'ws');
  return `${wsUrl}/ws/audio/${encodeURIComponent(orgId)}`;
}

// ─── Retry on 401 ────────────────────────────────────────────────────────────

export async function withTokenRetry<T>(
  propertyId: string | undefined,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  await clearToken();
  const token = await getValidToken(propertyId);
  return fn(token);
}

export { API_URL };
