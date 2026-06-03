/**
 * Planner — converts extracted intent into an execution plan (step sequence).
 */

import { ExtractedIntent, Intent } from './intent';

export interface ExecutionStep {
  step: string;
  params: Record<string, unknown>;
  purpose: string;
  required: boolean;
}

export interface Plan {
  steps: ExecutionStep[];
  estimatedSteps: number;
  canProceed: boolean;
  reason: string;
}

const INTENT_TO_STEPS: Record<Intent, (entities: Record<string, unknown>) => ExecutionStep[]> = {
  greeting: () => [
    { step: 'respond_greeting', params: {}, purpose: 'Greet the user warmly', required: true },
  ],

  small_talk: () => [
    { step: 'respond_small_talk', params: {}, purpose: 'Respond to casual conversation', required: true },
  ],

  create_ticket: (entities) => [
    {
      step: 'create_ticket',
      params: {
        title: entities.title ?? 'Voice-created ticket',
        description: entities.description ?? '',
        priority: entities.priority ?? 'medium',
      },
      purpose: 'Create the maintenance ticket',
      required: true,
    },
  ],

  check_ticket: (entities) => [
    {
      step: 'get_ticket_status',
      params: { ticket_id: entities.ticket_id, status: entities.status },
      purpose: 'Look up ticket status',
      required: true,
    },
  ],

  list_tickets: (entities) => [
    { step: 'list_tickets', params: { limit: 10, status: entities.status }, purpose: 'List recent tickets', required: true },
  ],

  get_property_info: () => [
    { step: 'get_property_info', params: {}, purpose: 'Get property statistics', required: true },
  ],

  list_visitors: (entities) => [
    { step: 'list_visitors', params: { limit: entities.limit ?? 5 }, purpose: 'List recent visitor check-ins', required: true },
  ],

  list_rooms: (entities) => [
    {
      step: 'list_meeting_rooms',
      params: { date: entities.date, capacity: entities.capacity },
      purpose: 'List available meeting rooms',
      required: true,
    },
  ],

  book_room: (entities) => {
    const steps: ExecutionStep[] = [];
    if (!entities.room_id) {
      steps.push({
        step: 'list_meeting_rooms',
        params: { date: entities.date, capacity: entities.capacity ?? 1 },
        purpose: 'Find available rooms',
        required: true,
      });
    }
    steps.push({
      step: 'book_meeting_room',
      params: {
        room_id: entities.room_id,
        date: entities.date ?? new Date().toISOString().split('T')[0],
        start_time: entities.start_time ?? '09:00',
        end_time: entities.end_time ?? '10:00',
      },
      purpose: 'Book the meeting room',
      required: true,
    });
    return steps;
  },

  cancel_booking: (entities) => [
    { step: 'cancel_booking', params: { booking_id: entities.booking_id }, purpose: 'Cancel the meeting room booking', required: true },
  ],

  unknown: () => [
    { step: 'clarify_intent', params: {}, purpose: 'Ask user to clarify their request', required: true },
  ],
};

export function createPlan(intent: ExtractedIntent): Plan {
  const { intent: intentType, entities, confidence } = intent;

  if (confidence < 0.5 && intentType === 'unknown') {
    return {
      steps: [{ step: 'clarify_intent', params: {}, purpose: 'Ask for clarification', required: true }],
      estimatedSteps: 1,
      canProceed: true,
      reason: `Low confidence (${confidence.toFixed(2)}) — asking for clarification`,
    };
  }

  const stepGenerator = INTENT_TO_STEPS[intentType] ?? INTENT_TO_STEPS.unknown;
  const steps = stepGenerator(entities);

  return {
    steps,
    estimatedSteps: steps.length,
    canProceed: steps.length > 0 && steps.some(s => s.required),
    reason: `Intent "${intentType}" with ${steps.length} step(s)`,
  };
}

export interface StepResult {
  step: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
