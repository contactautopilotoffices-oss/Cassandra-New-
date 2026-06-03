/**
 * Cassandra API Client — Simplified
 *
 * fetchWithAuth: injects cached session token from cassandraAuthService.
 * Chat session CRUD, health check, memory write.
 */

import { Platform } from 'react-native';
import { toast } from './toast';
import { supabase } from '@/utils/supabase/client';
import {
  getValidToken,
  withTokenRetry,
  clearToken,
} from '@/services/cassandra/cassandraAuthService';

const DEFAULT_URL = 'https://www.back2basiics.com';
const API_URL = (
  process.env.EXPO_PUBLIC_VOICE_API_URL ??
  process.env.EXPO_PUBLIC_CASSANDRA_API_URL ??
  DEFAULT_URL
).replace(/\/$/, '');

// ─── Core fetch with auth ────────────────────────────────────────────────────

async function parseError(res: Response): Promise<string> {
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    detail = body.detail || body.message || detail;
  } catch { /* ignore */ }
  return detail;
}

async function fetchWithAuth(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  let token: string;
  try {
    token = await getValidToken();
  } catch {
    token = '';
  }

  const url = `${API_URL}${path.startsWith('/') ? path : '/' + path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    try {
      const retryToken = await withTokenRetry(undefined, async (token) => token);
      headers['Authorization'] = `Bearer ${retryToken}`;
      const retryRes = await fetch(url, { ...options, headers });
      if (!retryRes.ok) {
        const detail = await parseError(retryRes);
        toast.error(detail);
        throw new Error(detail);
      }
      return retryRes;
    } catch (err) {
      if (err instanceof Error && err.message.includes('exchange failed')) {
        clearToken();
      }
      throw err;
    }
  }

  if (!res.ok) {
    const detail = await parseError(res);
    toast.error(detail);
    throw new Error(detail);
  }

  return res;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Memory ──────────────────────────────────────────────────────────────────

export type MemoryType = 'annotation' | 'correction' | 'summary' | 'insight';

export interface WriteMemoryBody {
  org_id: string;
  content: string;
  memory_type: MemoryType;
  context?: {
    room_id?: string;
    transcript_id?: string;
    action_item_id?: string;
  };
}

export async function writeMemory(body: WriteMemoryBody): Promise<any> {
  try {
    const res = await fetchWithAuth('/api/v1/memory/write', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.json();
  } catch (err) {
    console.warn('[Cassandra] Memory write not yet available:', err);
    return { status: 'pending', _stub: true, body };
  }
}

// ─── Chat Sessions ───────────────────────────────────────────────────────────

export interface ChatSession {
  id: string;
  user_id: string;
  org_id: string;
  property_id?: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: string;
  text: string;
  created_at: number;
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatMessage[];
}

export async function createChatSession(
  userId: string,
  orgId: string,
  title?: string,
  propertyId?: string,
): Promise<ChatSession> {
  const res = await fetchWithAuth('/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      org_id: orgId,
      title: title || 'New Chat',
      property_id: propertyId,
    }),
  });
  return res.json();
}

export async function listChatSessions(
  userId: string,
  orgId?: string,
): Promise<ChatSession[]> {
  const qs = orgId
    ? `?user_id=${encodeURIComponent(userId)}&org_id=${encodeURIComponent(orgId)}`
    : `?user_id=${encodeURIComponent(userId)}`;
  const res = await fetchWithAuth(`/chat/sessions${qs}`);
  return res.json();
}

export async function getChatSession(sessionId: string): Promise<ChatSessionDetail> {
  const res = await fetchWithAuth(`/chat/sessions/${encodeURIComponent(sessionId)}`);
  return res.json();
}

export async function addChatMessage(
  sessionId: string,
  role: string,
  text: string,
): Promise<ChatMessage> {
  const res = await fetchWithAuth(
    `/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
    { method: 'PUT', body: JSON.stringify({ role, text }) },
  );
  return res.json();
}

export async function updateChatSessionTitle(
  sessionId: string,
  title: string,
): Promise<void> {
  await fetchWithAuth(
    `/chat/sessions/${encodeURIComponent(sessionId)}/title`,
    { method: 'PUT', body: JSON.stringify({ title }) },
  );
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await fetchWithAuth(`/chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

// ─── Exports ─────────────────────────────────────────────────────────────────
export { API_URL, fetchWithAuth };
