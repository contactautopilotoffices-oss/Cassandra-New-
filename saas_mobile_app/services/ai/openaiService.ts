/**
 * @deprecated All AI calls now route through the server-side /api/voice proxy.
 * This file is kept only for the VoiceContext type used by other modules.
 * Do not use the OpenAI client or any LLM functions from this file.
 */

// ---------------------------------------------------------------------------
// Types (still used by voiceAgentPipeline.ts and openaiNativeRealtimeService.ts)
// ---------------------------------------------------------------------------
export interface VoiceContext {
  userId: string;
  propertyId: string;
  organizationId: string;
  userRole: string;
  userName: string;
  propertyName: string;
  sessionId?: string;
}
