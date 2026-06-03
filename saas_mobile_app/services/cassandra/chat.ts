/**
 * Cassandra Chat Service — Simplified SSE Streaming
 *
 * Flow:
 *   1. Get session token from cassandraAuthService (validates membership)
 *   2. POST /chat/stream with Bearer token + message body
 *   3. Parse SSE events (queued → processing → reasoning → answer → done)
 *
 * No Supabase JWT in headers. No Fastify proxy.
 * Direct mobile → Python with simple session token.
 */

import { getValidToken, getOrgId, API_URL } from './cassandraAuthService';

const BASE_URL = process.env.EXPO_PUBLIC_CASSANDRA_API_URL || API_URL;

export interface StreamChatOptions {
  photoUrl?: string;
  propertyId: string;  // Required — which property the user is chatting about
  conversationHistory?: Array<{ role: string; content: string }>;
}

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

// ─── SSE Parser ──────────────────────────────────────────────────────────────

class SSEParser {
  private buffer = '';
  private currentEvent = 'message';
  private dataBuffer = '';

  append(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const events: SSEEvent[] = [];
    let lineBuffer = '';

    for (let i = 0; i < this.buffer.length; i++) {
      const char = this.buffer[i];
      if (char === '\n') {
        const line = lineBuffer.trim();
        lineBuffer = '';

        if (line.startsWith('event:')) {
          this._flush(events);
          this.currentEvent = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          this.dataBuffer += line.substring(5);
        } else if (line === '') {
          this._flush(events);
        }
      } else {
        lineBuffer += char;
      }
    }

    this.buffer = lineBuffer;
    return events;
  }

  finalize(): SSEEvent[] {
    const events: SSEEvent[] = [];
    if (this.buffer.trim()) {
      const line = this.buffer.trim();
      if (line.startsWith('event:')) {
        this.currentEvent = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        this.dataBuffer += line.substring(5);
      }
    }
    this._flush(events);
    return events;
  }

  private _flush(events: SSEEvent[]) {
    if (!this.dataBuffer) return;
    try {
      events.push({ event: this.currentEvent, data: JSON.parse(this.dataBuffer) });
    } catch {
      events.push({ event: this.currentEvent, data: { raw: this.dataBuffer } });
    }
    this.dataBuffer = '';
    this.currentEvent = 'message';
  }
}

// ─── Stream Chat ─────────────────────────────────────────────────────────────

export function streamChat(
  message: string,
  sessionId: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
  options?: StreamChatOptions,
  onReasoning?: (step: string) => void,
  onCitation?: (sources: unknown[]) => void,
) {
  const propertyId = options?.propertyId || '';

  if (!propertyId) {
    onError('No property selected. Please select a property first.');
    return;
  }

  console.log('[streamChat] Starting. propertyId:', propertyId, 'message:', message.substring(0, 30));

  // Get session token, then make the request
  getValidToken(propertyId)
    .then((token) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/chat/stream`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', 'application/json');

      let cursor = 0;
      let doneEmitted = false;
      const sseParser = new SSEParser();

      const handleDone = () => {
        if (!doneEmitted) {
          doneEmitted = true;
          onDone();
        }
      };

      const processEvents = (events: SSEEvent[]) => {
        for (const ev of events) {
          switch (ev.event) {
            case 'queued':
              onReasoning?.('Request queued...');
              break;
            case 'processing':
              onReasoning?.('Cassandra is thinking...');
              break;
            case 'reasoning': {
              const msg = (ev.data.message as string) || '';
              if (msg) onReasoning?.(msg);
              break;
            }
            case 'tool_start': {
              const tool = (ev.data.tool as string) || '';
              const toolLabels: Record<string, string> = {
                create_ticket: 'Creating ticket…',
                sql_query: 'Running query…',
                query_tickets: 'Searching tickets…',
                fetch_context: 'Loading context…',
                calculate_date: 'Calculating date…',
                health_score: 'Scoring health…',
                enroll_voice: 'Enrolling voice…',
              };
              if (tool) onReasoning?.(toolLabels[tool] ?? `Running ${tool}…`);
              break;
            }
            case 'tool_result': {
              const success = ev.data.success as boolean;
              const tool = (ev.data.tool as string) || '';
              const doneLabels: Record<string, string> = {
                create_ticket: 'Ticket created',
                sql_query: 'Query complete',
                query_tickets: 'Tickets loaded',
                fetch_context: 'Context loaded',
                calculate_date: 'Date calculated',
                health_score: 'Health scored',
              };
              if (onReasoning) {
                onReasoning(success ? (doneLabels[tool] ?? 'Done') : 'Retrying…');
              }
              break;
            }
            case 'answer': {
              const text = (ev.data.token as string) || (ev.data.text as string) || '';
              if (text) onToken(text);
              break;
            }
            case 'citation': {
              const sources = (ev.data.sources as unknown[]) || [];
              if (sources.length) onCitation?.(sources);
              break;
            }
            case 'error': {
              const errMsg = (ev.data.message as string) || 'Unknown error';
              onError(errMsg);
              break;
            }
            case 'done':
              handleDone();
              break;
          }
        }
      };

      xhr.onreadystatechange = () => {
        if (
          xhr.readyState === XMLHttpRequest.LOADING ||
          xhr.readyState === XMLHttpRequest.DONE
        ) {
          const newChunk = xhr.responseText.slice(cursor);
          cursor = xhr.responseText.length;
          const events = sseParser.append(newChunk);
          processEvents(events);
        }
      };

      xhr.onerror = () => {
        console.log('[streamChat] XHR error. status:', xhr.status);
        onError('Cannot reach Cassandra. Check your connection.');
      };

      xhr.ontimeout = () => {
        onError('Request timed out.');
      };

      xhr.onload = () => {
        const finalEvents = sseParser.finalize();
        processEvents(finalEvents);
        handleDone();
      };

      xhr.timeout = 120000;

      signal?.addEventListener('abort', () => xhr.abort());

      // Send request
      const body = {
        message,
        context: {
          property_id: propertyId,
        },
        conversation_history: options?.conversationHistory || [],
        ...(options?.photoUrl && { photo_url: options.photoUrl }),
      };

      xhr.send(JSON.stringify(body));
    })
    .catch((err) => {
      console.error('[streamChat] Auth error:', err);
      onError(err.message || 'Authentication failed. Please sign in again.');
    });
}
