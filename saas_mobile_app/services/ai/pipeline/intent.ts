/**
 * Intent Extraction — purely keyword-based (no LLM, no API key needed).
 *
 * @deprecated Use the server-side /api/voice proxy instead.
 *             This file is only used in the local-only fallback path.
 */

export type Intent =
  | 'create_ticket'
  | 'check_ticket'
  | 'list_tickets'
  | 'get_property_info'
  | 'list_visitors'
  | 'list_rooms'
  | 'book_room'
  | 'cancel_booking'
  | 'greeting'
  | 'small_talk'
  | 'unknown';

export interface ExtractedIntent {
  intent: Intent;
  entities: Record<string, unknown>;
  confidence: number;
  reasoning: string;
}

/**
 * Keyword-based intent extraction. Covers the common voice use cases.
 * No API key required — safe for local fallback.
 */
export function extractIntent(
  userText: string,
  _history?: Array<{ role: string; content: string }>
): ExtractedIntent {
  return fastPathClassification(userText);
}

function fastPathClassification(text: string): ExtractedIntent {
  const lower = text.toLowerCase().trim();

  if (/^(hi|hello|hey|good morning|good afternoon|good evening)/.test(lower))
    return { intent: 'greeting', entities: {}, confidence: 1.0, reasoning: 'Direct greeting' };
  if (/how are you|what'?s up|how'?s it going/.test(lower))
    return { intent: 'small_talk', entities: {}, confidence: 1.0, reasoning: 'Casual conversation' };
  if (/book.*room|reserve.*room|meeting.*room|room.*booking/.test(lower))
    return { intent: 'book_room', entities: extractTimeEntities(text), confidence: 0.9, reasoning: 'Keyword match for room booking' };
  if (/create.*ticket|report|raise.*ticket|log.*issue|fix.*issue/.test(lower))
    return { intent: 'create_ticket', entities: extractTicketEntities(text), confidence: 0.9, reasoning: 'Keyword match for ticket creation' };
  if (/ticket.*status|status.*ticket|how.*ticket|my.*ticket/.test(lower))
    return { intent: 'check_ticket', entities: {}, confidence: 0.85, reasoning: 'Keyword match for ticket status' };
  if (/open.*ticket|my.*tickets|list.*tickets|all.*tickets/.test(lower))
    return { intent: 'list_tickets', entities: {}, confidence: 0.9, reasoning: 'Keyword match for ticket listing' };
  if (/meeting.*rooms?|available.*rooms?|list.*rooms?/.test(lower))
    return { intent: 'list_rooms', entities: {}, confidence: 0.9, reasoning: 'Keyword match for room listing' };
  if (/visitor|who.*visited|guest.*check.?in/.test(lower))
    return { intent: 'list_visitors', entities: {}, confidence: 0.9, reasoning: 'Keyword match for visitor list' };
  if (/property.*info|how many.*ticket|stats.*property/.test(lower))
    return { intent: 'get_property_info', entities: {}, confidence: 0.85, reasoning: 'Keyword match for property info' };
  if (/cancel.*booking|cancel.*room|unbook/.test(lower))
    return { intent: 'cancel_booking', entities: {}, confidence: 0.9, reasoning: 'Keyword match for booking cancellation' };

  return { intent: 'unknown', entities: {}, confidence: 0.0, reasoning: 'No pattern matched' };
}

function extractTimeEntities(text: string): Record<string, unknown> {
  const entities: Record<string, unknown> = {};
  const today = new Date();

  if (/tomorrow/i.test(text)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    entities.date = tomorrow.toISOString().split('T')[0];
  } else if (/today/i.test(text)) {
    entities.date = today.toISOString().split('T')[0];
  }

  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2] ?? '0', 10);
    const period = timeMatch[3].toLowerCase();

    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    entities.start_time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    entities.end_time = `${String(hours + 1).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  return entities;
}

function extractTicketEntities(text: string): Record<string, unknown> {
  const entities: Record<string, unknown> = {};

  const priorityMatch = text.match(/urgent|critical|high priority|medium priority|low priority/i);
  if (priorityMatch) {
    const p = priorityMatch[0].toLowerCase();
    entities.priority = p.includes('critical') || p.includes('urgent') ? 'critical'
      : p.includes('high') ? 'high'
      : p.includes('medium') ? 'medium'
      : 'low';
  }

  const sentences = text.split(/[.,!?]/);
  if (sentences[0]) {
    entities.title = sentences[0].trim()
      .replace(/^(i want to |please |can you |could you |hey |hi )/i, '')
      .slice(0, 100);
  }

  entities.description = text;
  return entities;
}
