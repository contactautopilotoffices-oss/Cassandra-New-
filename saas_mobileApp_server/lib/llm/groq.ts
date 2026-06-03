/**
 * Groq LLM Client for Hybrid Ticket Classification
 * 
 * Purpose: Tie-breaker between ambiguous candidate buckets
 * - Never invents new buckets
 * - Strict input/output schema validation
 * - Silent fallback on failures
 */

import { z } from 'zod';
import { SkillGroup } from '../ticketing/classifyTicket';

// Input schema (what we send to Groq)
const LLMInputSchema = z.object({
    ticket_text: z.string(),
    candidate_buckets: z.array(z.string()),
    rule_scores: z.record(z.string(), z.number()),
    db_priority: z.string().optional(), // baseline priority from issue_categories table
});

// Output schema (what we expect from Groq)
const LLMOutputSchema = z.object({
    primary_category: z.string(),
    secondary_category: z.string().nullable().optional(),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']),
    risk_flag: z.string().nullable().optional(),
    reasoning: z.string(),
});

export type LLMInput = z.infer<typeof LLMInputSchema>;
export type LLMOutput = z.infer<typeof LLMOutputSchema>;

export interface GroqResponse {
    success: boolean;
    result?: LLMOutput;
    error?: string;
    latencyMs: number;
    fallbackUsed: boolean;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

// Configuration
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // Fast and capable
const TIMEOUT_MS = 5000; // Increased to 5s for complex reasoning
const MIN_CONFIDENCE_THRESHOLD = 0.65; // Below this, suggest human review

/**
 * Build the system prompt for situational reasoning
 */
function buildSystemPrompt(): string {
    return `You are an expert facilities incident triage system.
Your job is to infer the primary cause, secondary contributing factors, correct priority, and safety risks of maintenance tickets.

Rules:
1. Reason about context, negation, time, and cause vs symptom.
2. Identify the PRIMARY category responsible (from the provided list).
3. Identify a SECONDARY category if relevant (from the provided list), otherwise null.
4. Assign priority using these strict definitions:
   - Urgent: Immediate threat to life/safety — fire, flood, structural collapse, complete power failure, stuck lift with person inside.
   - High: Risk of damage, injury, or major service disruption — any leakage/water damage, electrical faults, broken locks, lift malfunction, sewage issues, AC failure in server room.
   - Medium: Affects comfort or routine operations — AC not cooling, lighting issues, minor plumbing (dripping tap without damage risk), cleaning requests, furniture issues.
   - Low: Purely cosmetic, no service impact — paint scuff, minor stain, aesthetic complaints.
   When in doubt between two levels, always choose the HIGHER priority.
5. Flag safety risks explicitly (e.g., "Fire risk", "Slip hazard", "Water damage risk").
6. Provide a concise one-line reasoning.

Respond ONLY in valid JSON format matching the requested schema.`;
}

/**
 * Build the user prompt with ticket context
 */
function buildUserPrompt(input: LLMInput): string {
    const priorityExamples = `
Priority Examples (use these as reference):
- Urgent: "lift stuck with person inside", "fire alarm triggered", "electrical spark near server room", "flooding on floor"
- High: "urinal tap leakage", "water pipe leaking", "AC not working in server room", "exposed wiring", "broken door lock", "sewage smell", "ceiling water seepage"
- Medium: "AC not cooling properly", "light flickering", "wifi slow", "chair broken", "tap dripping slightly", "washroom cleaning needed", "dustbin not cleared"
- Low: "paint scuff on wall", "minor stain on carpet", "desk slightly misaligned", "fingerprints on glass"`;

    const dbPriorityHint = input.db_priority
        ? `\nBaseline Priority (from category DB): ${input.db_priority} — only assign HIGHER than this if the ticket text clearly warrants it. Never assign lower.`
        : '';

    return `Target Categories: ${JSON.stringify(input.candidate_buckets)}

Ticket Description:
"${input.ticket_text}"

Rule Engine Context:
Scores: ${JSON.stringify(input.rule_scores)}
${priorityExamples}${dbPriorityHint}

Analyze the situation and return structured JSON.`;
}

/**
 * Call Groq API with timeout and error handling
 */
export async function classifyWithGroq(input: LLMInput): Promise<GroqResponse> {
    const startTime = Date.now();

    // Validate input
    const inputValidation = LLMInputSchema.safeParse(input);
    if (!inputValidation.success) {
        return {
            success: false,
            error: `Invalid input: ${inputValidation.error.message}`,
            latencyMs: Date.now() - startTime,
            fallbackUsed: true,
        };
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.warn('[GroqClient] GROQ_API_KEY not configured, using fallback');
        return {
            success: false,
            error: 'GROQ_API_KEY not configured',
            latencyMs: Date.now() - startTime,
            fallbackUsed: true,
        };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: buildSystemPrompt() },
                    { role: 'user', content: buildUserPrompt(input) },
                ],
                temperature: 0.1, // Low temp for consistency
                max_tokens: 200,
                response_format: { type: 'json_object' },
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[GroqClient] API error:', response.status, errorText);
            return {
                success: false,
                error: `API error: ${response.status}`,
                latencyMs: Date.now() - startTime,
                fallbackUsed: true,
            };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        const usage = data.usage ? {
            prompt_tokens: data.usage.prompt_tokens,
            completion_tokens: data.usage.completion_tokens,
            total_tokens: data.usage.total_tokens,
        } : undefined;

        if (!content) {
            return {
                success: false,
                error: 'Empty response from Groq',
                latencyMs: Date.now() - startTime,
                fallbackUsed: true,
                usage,
            };
        }

        // Parse and validate output
        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch {
            console.error('[GroqClient] Failed to parse JSON:', content);
            return {
                success: false,
                error: 'Invalid JSON in response',
                latencyMs: Date.now() - startTime,
                fallbackUsed: true,
                usage,
            };
        }

        // Normalize priority to Title Case — Groq often returns lowercase
        if (parsed && typeof parsed.priority === 'string') {
            const p = parsed.priority.toLowerCase();
            const map: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
            parsed.priority = map[p] ?? parsed.priority;
        }

        // Normalize primary_category — Groq occasionally returns null for vague inputs
        if (parsed && (parsed.primary_category === null || parsed.primary_category === undefined)) {
            parsed.primary_category = input.candidate_buckets?.[0] ?? 'GENERAL_MAINTENANCE';
        }

        const outputValidation = LLMOutputSchema.safeParse(parsed);
        if (!outputValidation.success) {
            console.error('[GroqClient] Invalid output schema:', outputValidation.error);
            return {
                success: false,
                error: `Invalid output: ${outputValidation.error.message}`,
                latencyMs: Date.now() - startTime,
                fallbackUsed: true,
                usage,
            };
        }

        const result = outputValidation.data;

        if (!input.candidate_buckets.includes(result.primary_category)) {
            console.error('[GroqClient] LLM selected invalid bucket:', result.primary_category);
            return {
                success: false,
                error: `LLM selected bucket not in candidates: ${result.primary_category}`,
                latencyMs: Date.now() - startTime,
                fallbackUsed: true,
                usage,
            };
        }

        return {
            success: true,
            result,
            latencyMs: Date.now() - startTime,
            fallbackUsed: false,
            usage,
        };

    } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === 'AbortError') {
            console.warn('[GroqClient] Request timed out');
            return {
                success: false,
                error: 'Request timed out',
                latencyMs: Date.now() - startTime,
                fallbackUsed: true,
            };
        }

        console.error('[GroqClient] Unexpected error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            latencyMs: Date.now() - startTime,
            fallbackUsed: true,
        };
    }
}

/**
 * Check if LLM confidence is high enough to trust
 */
export function isConfidenceAcceptable(confidence: number): boolean {
    return confidence >= MIN_CONFIDENCE_THRESHOLD;
}

/**
 * Convert skill group to display name for LLM context
 */
export function skillGroupToDisplayName(sg: SkillGroup): string {
    const names: Record<SkillGroup, string> = {
        technical: 'Technical',
        plumbing: 'Plumbing',
        vendor: 'Vendor',
        soft_services: 'Soft Services',
    };
    return names[sg];
}
