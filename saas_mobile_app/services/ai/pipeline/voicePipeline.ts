/**
 * Main Voice Pipeline — mobile client.
 *
 * All LLM calls (intent extraction, response generation) are routed through the
 * server-side /api/voice proxy to keep API keys off the client.
 *
 * Tool execution (Supabase) remains local for lowest latency.
 *
 * Flow (server-side via proxy):
 * 1. Extract intent (gpt-4o-mini)
 * 2. Create plan (deterministic step mapping)
 * 3. Check guardrails per step
 * 4. Execute tools (Supabase)
 * 5. Retrieve context (Supabase RAG)
 * 6. Retrieve memories (Supermemory, server-side key)
 * 7. Generate response (gpt-4o-mini)
 * 8. Store memories (Supermemory, server-side key)
 */

import { supabase } from '@/utils/supabase/client';
import { VoiceContext, HistoryEntry } from './types';
import {
  listTicketsTool,
  getTicketStatusTool,
  createTicketTool,
  listRoomsTool,
  bookRoomTool,
  listVisitorsTool,
  getPropertyInfoTool,
} from './tools';
import { extractIntent, ExtractedIntent } from './intent';
import { createPlan, Plan, StepResult } from './planner';
import { checkGuardrails, sanitizeInput, GuardrailContext } from './guardrails';
import { retrieveContext, formatRetrievalContext } from './retrieval';

export interface VoicePipelineResult {
  transcript: string;
  intent: ExtractedIntent;
  plan: Plan;
  response: string;
  steps: StepResult[];
  status: 'success' | 'error' | 'partial' | 'clarification';
}

// ---------------------------------------------------------------------------
// The base URL for the backend voice proxy.
// Uses the environment variable so the mobile app works against dev/staging/prod.
// ---------------------------------------------------------------------------
const VOICE_API_BASE = process.env.EXPO_PUBLIC_VOICE_API_URL ?? '';

async function voiceApiProxy(
  transcript: string,
  ctx: VoiceContext,
  history: HistoryEntry[],
  sessionId: string
): Promise<VoicePipelineResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  if (!accessToken || !VOICE_API_BASE) {
    // Fall back to local-only execution (no LLM — tools + templates only)
    return localPipelineOnly(transcript, ctx, history, sessionId);
  }

  try {
    const res = await fetch(`${VOICE_API_BASE}/api/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        transcript,
        context: ctx,
        history,
        sessionId,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      console.warn('[voicePipeline] Proxy error, falling back to local:', err.error);
      return localPipelineOnly(transcript, ctx, history, sessionId);
    }

    const data = await res.json() as {
      transcript: string;
      response: string;
      intent: string;
      steps: StepResult[];
      status: string;
    };

    return {
      transcript: data.transcript,
      intent: { intent: data.intent as ExtractedIntent['intent'], entities: {}, confidence: 1, reasoning: 'proxy' },
      plan: { steps: data.steps.map(s => ({ step: s.step, params: {}, required: true, purpose: s.step })), estimatedSteps: data.steps.length, canProceed: true, reason: 'proxy' },
      response: data.response,
      steps: data.steps,
      status: data.status as VoicePipelineResult['status'],
    };
  } catch (err) {
    console.warn('[voicePipeline] Proxy unreachable, falling back to local:', err);
    return localPipelineOnly(transcript, ctx, history, sessionId);
  }
}

// ---------------------------------------------------------------------------
// Local-only pipeline fallback — runs tools locally, uses template responses.
// No API keys required. Functional but less intelligent.
// ---------------------------------------------------------------------------
async function localPipelineOnly(
  transcript: string,
  ctx: VoiceContext,
  history: HistoryEntry[],
  sessionId: string
): Promise<VoicePipelineResult> {
  const intent = await extractIntent(transcript, history);
  const plan = createPlan(intent);

  const guardrailCtx: GuardrailContext = {
    userId: ctx.userId,
    userRole: ctx.userRole,
    propertyId: ctx.propertyId,
    organizationId: ctx.organizationId,
  };

  const steps: StepResult[] = [];
  for (const step of plan.steps) {
    const guardrail = checkGuardrails(transcript, step.step, guardrailCtx);
    if (!guardrail.allowed) {
      steps.push({ step: step.step, success: false, error: guardrail.reason });
      continue;
    }
    const result = await executeStep(step.step, step.params, ctx);
    steps.push({ step: step.step, success: result.success, data: result.data, error: result.error });
  }

  // Template-based response (no LLM)
  const response = generateTemplateResponse(intent, steps, ctx);

  return {
    transcript,
    intent,
    plan,
    response,
    steps,
    status: steps.every(s => s.success) ? 'success' : 'partial',
  };
}

function generateTemplateResponse(
  intent: ExtractedIntent,
  steps: StepResult[],
  ctx: VoiceContext
): string {
  if (intent.intent === 'greeting') {
    return `Hello ${ctx.userName}! I'm Autopilot, your property assistant. How can I help you today?`;
  }
  if (intent.intent === 'small_talk') {
    return "I'm doing great, thanks for asking! I'm here to help you manage your property. What can I do for you?";
  }
  if (intent.intent === 'unknown') {
    return "I'm not sure I understood that. Could you rephrase? For example, you can say 'list my tickets' or 'book a meeting room for 3pm tomorrow'.";
  }

  const failedStep = steps.find(s => !s.success);
  if (failedStep) {
    return `I couldn't complete that request: ${failedStep.error}. Please try again or rephrase.`;
  }

  const ticketStep = steps.find(s => s.step === 'create_ticket');
  if (ticketStep?.success && ticketStep.data) {
    const d = ticketStep.data as { ticket_number: string };
    return `Done! Your ticket has been created. Ticket number: ${d.ticket_number}. An engineer will look into it soon.`;
  }

  const listStep = steps.find(s => s.step === 'list_tickets' || s.step === 'get_ticket_status');
  if (listStep?.success && listStep.data && Array.isArray(listStep.data) && (listStep.data as unknown[]).length > 0) {
    const tickets = listStep.data as Array<{ ticket_number: string; title: string; status: string }>;
    const summaries = tickets.slice(0, 5).map(t => `${t.ticket_number}: ${t.title} (${t.status})`);
    return `Here are your tickets:\n${summaries.join('\n')}`;
  }

  const visitorsStep = steps.find(s => s.step === 'list_visitors');
  if (visitorsStep?.success && visitorsStep.data && Array.isArray(visitorsStep.data) && (visitorsStep.data as unknown[]).length > 0) {
    const visitors = visitorsStep.data as Array<{ name: string; host_name?: string }>;
    const summaries = visitors.slice(0, 3).map(v => `${v.name}${v.host_name ? ` (hosted by ${v.host_name})` : ''}`);
    return `Recent visitors:\n${summaries.join('\n')}`;
  }

  const propStep = steps.find(s => s.step === 'get_property_info');
  if (propStep?.success && propStep.data) {
    const d = propStep.data as { name?: string; openTicketCount?: number; totalTicketCount?: number };
    const open = d.openTicketCount ?? 0;
    if (open === 0) return `All clear at ${d.name}! No open maintenance tickets.`;
    return `${d.name ?? 'This property'} has ${open} open ticket${open !== 1 ? 's' : ''} out of ${d.totalTicketCount ?? 0} total.`;
  }

  return "I've processed your request. Is there anything else I can help you with?";
}

// ---------------------------------------------------------------------------
// Public API — call this from the mobile voice UI
// ---------------------------------------------------------------------------
export async function runVoicePipeline(
  transcript: string,
  ctx: VoiceContext,
  history: HistoryEntry[],
  sessionId: string
): Promise<VoicePipelineResult> {
  return voiceApiProxy(transcript, ctx, history, sessionId);
}

// ---------------------------------------------------------------------------
// Execute a single step (local Supabase tools)
// ---------------------------------------------------------------------------
async function executeStep(
  step: string,
  params: Record<string, unknown>,
  ctx: VoiceContext
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const sanitized = sanitizeInput(params);

  switch (step) {
    case 'create_ticket':
      return createTicketTool(ctx.propertyId, ctx.organizationId, ctx.userId, sanitized);
    case 'get_ticket_status':
      return getTicketStatusTool(ctx.propertyId, sanitized);
    case 'list_tickets':
      return listTicketsTool(ctx.propertyId, sanitized);
    case 'get_property_info':
      return getPropertyInfoTool(ctx.propertyId);
    case 'list_visitors':
      return listVisitorsTool(ctx.propertyId, sanitized);
    case 'list_meeting_rooms':
      return listRoomsTool(ctx.propertyId, sanitized);
    case 'book_meeting_room':
      return bookRoomTool(ctx.propertyId, ctx.userId, sanitized);
    case 'respond_greeting':
      return { success: true, data: { response: 'Hello! How can I help you today?' } };
    case 'respond_small_talk':
      return { success: true, data: { response: "I'm doing great, thanks for asking! What can I help you with?" } };
    case 'clarify_intent':
      return { success: true, data: { response: "I'm not sure I understood that. Could you please rephrase?" } };
    default:
      return { success: false, error: `Unknown step: ${step}` };
  }
}
