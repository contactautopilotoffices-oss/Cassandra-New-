/**
 * Cassandra Room Service
 *
 * All endpoints use fetchWithAuth (Cassandra token, not Supabase).
 * Base URL from EXPO_PUBLIC_CASSANDRA_API_URL.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithAuth } from '@/lib/cassandra';
import { writeMemory } from '@/lib/cassandra';
import {
  CassandraRoomFull,
  CassandraRoomListItem,
  ListRoomsResponse,
  CreateRoomResponse,
  CorrectTranscriptResponse,
  ActionItem,
  ActionItemStatus,
  WriteMemoryBody,
  RetrievedMemory,
} from '@/types/cassandra-room';

// ─── Room List ─────────────────────────────────────────────────────────────

export async function listRooms(
  propertyId: string,
  options?: { page?: number; page_size?: number; status?: string }
): Promise<ListRoomsResponse> {
  const params = new URLSearchParams({
    property_id: propertyId,
    ...(options?.page !== undefined && { page: String(options.page) }),
    ...(options?.page_size !== undefined && { page_size: String(options.page_size) }),
    ...(options?.status && { status: options.status }),
  });

  const res = await fetchWithAuth(`/api/v1/properties/${encodeURIComponent(propertyId)}/rooms?${params}`);
  return res.json();
}

// ─── Room Detail ──────────────────────────────────────────────────────────

export async function getRoomFull(roomId: string): Promise<CassandraRoomFull> {
  const res = await fetchWithAuth(`/api/v1/rooms/${encodeURIComponent(roomId)}/full`);
  return res.json();
}

// ─── Create Room ───────────────────────────────────────────────────────────

export async function createRoom(
  propertyId: string,
  name: string,
  orgId: string
): Promise<CreateRoomResponse> {
  const res = await fetchWithAuth(`/api/v1/properties/${encodeURIComponent(propertyId)}/rooms`, {
    method: 'POST',
    body: JSON.stringify({ name, org_id: orgId }),
  });
  return res.json();
}

// ─── End Room ─────────────────────────────────────────────────────────────

export async function endRoom(
  propertyId: string,
  roomId: string
): Promise<{ room: CassandraRoomFull }> {
  const res = await fetchWithAuth(
    `/api/v1/properties/${encodeURIComponent(propertyId)}/rooms/${encodeURIComponent(roomId)}/end`,
    { method: 'POST' }
  );
  return res.json();
}

// ─── Action Items ──────────────────────────────────────────────────────────

export async function updateActionItem(
  roomId: string,
  actionItemId: string,
  updates: {
    status?: ActionItemStatus;
    assignee?: string;
    due_date?: string;
    notes?: string;
  }
): Promise<{ action_item: ActionItem }> {
  const res = await fetchWithAuth(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/action-items/${encodeURIComponent(actionItemId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  );
  return res.json();
}

// ─── Transcript Correction ─────────────────────────────────────────────────

/**
 * Corrects a single transcript segment and writes the correction to
 * Cassandra's memory layer so the model learns from corrections.
 */
export async function correctTranscript(
  roomId: string,
  segmentId: string,
  correctedText: string,
  orgId: string
): Promise<CorrectTranscriptResponse> {
  const res = await fetchWithAuth(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/transcript/${encodeURIComponent(segmentId)}/correct`,
    {
      method: 'POST',
      body: JSON.stringify({ corrected_text: correctedText }),
    }
  );
  const data: CorrectTranscriptResponse = await res.json();

  // Write the correction to memory — non-fatal if it fails
  await writeMemory({
    org_id: orgId,
    content: correctedText,
    memory_type: 'correction',
    context: { room_id: roomId, transcript_id: segmentId },
  } as WriteMemoryBody);

  return data;
}

// ─── Memory Search ────────────────────────────────────────────────────────

/**
 * Search Cassandra's memory layer for context relevant to a room or query.
 * Falls back to AsyncStorage for locally staged corrections when backend
 * is unavailable.
 */
export async function searchMemory(
  orgId: string,
  query: string,
  options?: { limit?: number; memory_type?: string }
): Promise<{ memories: RetrievedMemory[] }> {
  try {
    const params = new URLSearchParams({
      org_id: orgId,
      query,
      ...(options?.limit !== undefined && { limit: String(options.limit) }),
      ...(options?.memory_type && { memory_type: options.memory_type }),
    });

    const res = await fetchWithAuth(`/api/v1/memory/search?${params}`);
    return res.json();
  } catch {
    // Backend not ready — fall back to locally staged corrections
    return loadLocalCorrections(orgId, query);
  }
}

// ─── Local Corrections Cache (fallback) ───────────────────────────────────

const LOCAL_CORRECTIONS_KEY = (orgId: string) => `@cassandra_corrections:${orgId}`;

export async function loadLocalCorrections(
  orgId: string,
  _query: string
): Promise<{ memories: RetrievedMemory[] }> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_CORRECTIONS_KEY(orgId));
    if (!raw) return { memories: [] };
    const corrections = JSON.parse(raw) as RetrievedMemory[];
    return { memories: corrections };
  } catch {
    return { memories: [] };
  }
}

export async function stageLocalCorrection(
  orgId: string,
  segmentId: string,
  correctedText: string
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_CORRECTIONS_KEY(orgId));
    const existing: RetrievedMemory[] = raw ? JSON.parse(raw) : [];

    const updated: RetrievedMemory[] = existing.filter((m) => m.context?.transcript_id !== segmentId);
    updated.push({
      id: `local:${segmentId}`,
      content: correctedText,
      memory_type: 'correction',
      created_at: new Date().toISOString(),
      context: { transcript_id: segmentId },
    });

    await AsyncStorage.setItem(LOCAL_CORRECTIONS_KEY(orgId), JSON.stringify(updated));
  } catch {
    // Non-fatal
  }
}

// ─── Format memory context for AI injection ───────────────────────────────

export function formatMemoryContext(memories: RetrievedMemory[]): string {
  if (!memories.length) return '';
  return memories
    .map(
      (m) =>
        `[${m.memory_type}]${m.context?.room_id ? ` (room:${m.context.room_id.slice(0, 8)})` : ''} ${m.content}`
    )
    .join('\n');
}
