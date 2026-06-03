/**
 * Supermemory Service — Mobile (React Native)
 *
 * NOTE: Supermemory API calls are proxied through the backend (/api/voice).
 * The API key is server-side only and never exposed to the mobile client.
 *
 * This module provides:
 * - Type definitions shared with the backend memory layer
 * - Container naming helpers (must match backend/memory.ts)
 * - Context formatter for displaying memory data returned from the backend
 *
 * Direct Supermemory calls from mobile are intentionally removed —
 * all memory operations go through the server-side pipeline.
 *
 * API base: https://api.supermemory.ai
 */

// ---------------------------------------------------------------------------
// Types — mirror backend/backend/services/ai/memory.ts
// ---------------------------------------------------------------------------
export type MemoryType = 'episodic' | 'semantic' | 'procedural';

export interface RetrievedMemory {
  content: string;
  type: MemoryType;
  score: number;     // retrieval similarity score
  lastUsed: string; // ISO timestamp
  source: string;
}

export interface MemoryContext {
  episodic: RetrievedMemory[];
  semantic: RetrievedMemory[];
  procedural: RetrievedMemory[];
}

// ---------------------------------------------------------------------------
// Container helpers — MUST match backend/backend/services/ai/memory.ts
// ---------------------------------------------------------------------------
export function userContainer(userId: string) { return `user_${userId}`; }
export function orgContainer(orgId: string) { return `org_${orgId}`; }
export function propContainer(propId: string) { return `prop_${propId}`; }
export function sessionContainer(sessionId: string) { return `sess_${sessionId}`; }

// ---------------------------------------------------------------------------
// Format memory context for LLM display (used by mobile to format
// prefetched memories returned from the backend proxy).
// Mirrors backend/backend/services/ai/memory.ts:formatMemoryContext()
// ---------------------------------------------------------------------------
export function formatMemoryContext(memories: MemoryContext, maxLen = 600): string {
  const sections: string[] = [];

  if (memories.semantic.length > 0) {
    sections.push(
      `## Learned Preferences\n` +
      memories.semantic
        .map((m) => `  [${m.source}] ${m.content}`)
        .join('\n')
    );
  }

  if (memories.episodic.length > 0) {
    sections.push(
      `## Recent Interaction Context\n` +
      memories.episodic
        .slice(0, 3)
        .map((m) => `  [${m.source}] ${m.content}`)
        .join('\n')
    );
  }

  if (memories.procedural.length > 0) {
    sections.push(
      `## Interaction Patterns\n` +
      memories.procedural
        .map((m) => `  [${m.source}] ${m.content}`)
        .join('\n')
    );
  }

  if (sections.length === 0) return '';

  let result = sections.join('\n\n');
  if (result.length > maxLen) {
    result = result.slice(0, maxLen) + '\n...(memory context truncated)';
  }
  return result;
}
