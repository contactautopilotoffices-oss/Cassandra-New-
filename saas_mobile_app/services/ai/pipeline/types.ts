/**
 * Shared types for the voice pipeline (mobile).
 */

export interface VoiceContext {
  userId: string;
  propertyId: string;
  organizationId: string;
  userRole: string;
  userName: string;
  propertyName: string;
  sessionId?: string;
}

export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}
