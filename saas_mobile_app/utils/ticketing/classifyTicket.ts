/**
 * Mobile Ticket Classification Engine
 * 
 * Ported from web app: backend/lib/ticketing/classifyTicket.ts
 * + backend/lib/llm/groq.ts
 * 
 * Hybrid approach:
 * 1. Rule Engine (keyword dictionary) — instant, deterministic
 * 2. Groq LLM (llama-3.3-70b) — AI tie-breaker for priority & secondary category
 */

import dictionary from './issueDictionary.json';

/* ─── Types ───────────────────────────────────────────────────────────────── */

export type SkillGroup = 'technical' | 'plumbing' | 'vendor' | 'soft_services';
export type Confidence = 'high' | 'low';

export interface ClassificationResult {
  issue_code: string | null;
  skill_group: SkillGroup;
  confidence: Confidence;
  priority: string;
  risk_flag: string | null;
  llm_reasoning: string | null;
  secondary_category_code: string | null;
  classification_source: 'rule_engine' | 'groq_llm' | 'hybrid';
}

export interface EnhancedClassificationResult extends ClassificationResult {
  // no additional fields yet, but available for future extension
}

/* ─── Skill Group Display Helpers ───────────────────────────────────────────── */

export function getSkillGroupDisplayName(sg: SkillGroup): string {
  const map: Record<SkillGroup, string> = {
    technical: 'Technical',
    plumbing: 'Plumbing',
    vendor: 'Vendor',
    soft_services: 'Soft Services',
  };
  return map[sg] ?? sg;
}

export function getSkillGroupColor(sg: SkillGroup): { bg: string; text: string; border: string } {
  const map: Record<SkillGroup, { bg: string; text: string; border: string }> = {
    technical:    { bg: 'rgba(59,130,246,0.1)',  text: '#3B82F6', border: 'rgba(59,130,246,0.3)' },
    plumbing:      { bg: 'rgba(14,165,233,0.1)',  text: '#0EA5E9', border: 'rgba(14,165,233,0.3)' },
    vendor:        { bg: 'rgba(168,85,247,0.1)', text: '#A855F7', border: 'rgba(168,85,247,0.3)' },
    soft_services: { bg: 'rgba(236,72,153,0.1)', text: '#EC4899', border: 'rgba(236,72,153,0.3)' },
  };
  return map[sg] ?? { bg: 'rgba(148,163,184,0.1)', text: '#94A3B8', border: 'rgba(148,163,184,0.3)' };
}

export function getIssueCodeDisplayName(code: string | null): string {
  if (!code) return 'Unclassified';
  return code.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/* ─── Enhanced Sync Classification ─────────────────────────────────────────── */

export function classifyTicketEnhanced(text: string): EnhancedClassificationResult {
  const ruleResult = classifyWithRules(text);
  return {
    issue_code: ruleResult.issue_code,
    skill_group: ruleResult.skill_group,
    confidence: ruleResult.confidence,
    priority: 'medium',
    risk_flag: null,
    llm_reasoning: null,
    secondary_category_code: null,
    classification_source: 'rule_engine',
  };
}

interface Match {
  issue_code: string;
  skill_group: SkillGroup;
  keyword: string;
  keyword_length: number;
}

/* ─── Floor / Location Extractors (same as web) ───────────────────────────── */

export function extractFloorNumber(description: string): number | null {
  const lower = description.toLowerCase();
  if (/ground\s*floor|grourd\s*floor|groud\s*floor|floor\s*0|level\s*0/.test(lower)) return 0;
  if (lower.includes('basement') || lower.includes('b1')) return -1;
  if (lower.includes('b2')) return -2;

  const patterns = [/(\d+)(?:st|nd|rd|th)\s*floor/i, /floor\s*(\d+)/i, /(\d+)\s*floor/i, /level\s*(\d+)/i];
  for (const p of patterns) {
    const m = description.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

export function extractLocation(description: string): string | null {
  const locations: Record<string, string[]> = {
    Cafeteria: ['cafeteria', 'canteen', 'pantry', 'kitchen', 'mess'],
    Reception: ['lobby', 'reception', 'front desk', 'entrance'],
    Parking: ['parking', 'basement', 'garage'],
    Terrace: ['terrace', 'roof', 'rooftop'],
    Washroom: ['washroom', 'restroom', 'toilet', 'bathroom', 'loo'],
    'Conference Room': ['conference', 'meeting room', 'board room'],
    Cabin: ['cabin', 'cubicle', 'desk', 'workstation'],
    'Server Room': ['server room', 'data center', 'hub room'],
    'Electrical Room': ['electrical room', 'ups room', 'dg room'],
  };
  const lower = description.toLowerCase();
  for (const [loc, kws] of Object.entries(locations)) {
    for (const kw of kws) {
      if (new RegExp(`\\b${kw}\\b`, 'i').test(lower)) return loc;
    }
  }
  return null;
}

/* ─── Rule Engine (deterministic) ─────────────────────────────────────────── */

export function classifyWithRules(text: string) {
  const lower = text.toLowerCase();
  const matches: Match[] = [];
  const skillGroups: SkillGroup[] = ['vendor', 'technical', 'plumbing', 'soft_services'];

  for (const sg of skillGroups) {
    const issues = dictionary[sg as keyof typeof dictionary];
    if (!issues || typeof issues !== 'object') continue;
    for (const [issueCode, keywords] of Object.entries(issues)) {
      if (!Array.isArray(keywords)) continue;
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          matches.push({ issue_code: issueCode, skill_group: sg, keyword: kw, keyword_length: kw.length });
        }
      }
    }
  }

  // Filter out shorter matches that are substrings of longer matches
  const filteredMatches = matches.filter(m1 => {
    return !matches.some(m2 => m1 !== m2 && m2.keyword.includes(m1.keyword) && m2.keyword_length > m1.keyword_length);
  });

  // Scores
  const scores: Record<SkillGroup, number> = { technical: 0, plumbing: 0, vendor: 0, soft_services: 0 };
  for (const m of filteredMatches) scores[m.skill_group]++;

  if (filteredMatches.length === 0) {
    return {
      issue_code: null,
      skill_group: 'technical' as SkillGroup,
      confidence: 'low' as Confidence,
      scores,
    };
  }

  // Precedence
  const precedence = dictionary.precedence_order as SkillGroup[];
  for (const sg of precedence) {
    const groupMatches = filteredMatches.filter(m => m.skill_group === sg);
    if (groupMatches.length > 0) {
      const counts: Record<string, number> = {};
      groupMatches.forEach(m => { counts[m.issue_code] = (counts[m.issue_code] || 0) + 1; });

      let bestCode = groupMatches[0].issue_code;
      let maxCount = 0;
      for (const [code, count] of Object.entries(counts)) {
        if (count > maxCount) { maxCount = count; bestCode = code; }
        else if (count === maxCount) {
          const curLen = Math.max(...groupMatches.filter(m => m.issue_code === code).map(m => m.keyword_length));
          const bestLen = Math.max(...groupMatches.filter(m => m.issue_code === bestCode).map(m => m.keyword_length));
          if (curLen > bestLen) bestCode = code;
        }
      }

      return { issue_code: bestCode, skill_group: sg, confidence: 'high' as Confidence, scores };
    }
  }

  return { issue_code: null, skill_group: 'technical' as SkillGroup, confidence: 'low' as Confidence, scores };
}

/* ─── Groq LLM Classification ────────────────────────────────────────────── */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

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

function buildUserPrompt(ticketText: string, scores: Record<string, number>, dbPriority?: string): string {
  const buckets = Object.keys(scores).filter(k => scores[k] > 0);
  if (buckets.length === 0) buckets.push('technical', 'plumbing', 'vendor', 'soft_services');

  const priorityExamples = `
Priority Examples (use these as reference):
- Urgent: "lift stuck with person inside", "fire alarm triggered", "electrical spark near server room", "flooding on floor"
- High: "urinal tap leakage", "water pipe leaking", "AC not working in server room", "exposed wiring", "broken door lock", "sewage smell", "ceiling water seepage"
- Medium: "AC not cooling properly", "light flickering", "wifi slow", "chair broken", "tap dripping slightly", "washroom cleaning needed", "dustbin not cleared"
- Low: "paint scuff on wall", "minor stain on carpet", "desk slightly misaligned", "fingerprints on glass"`;

  const hint = dbPriority ? `\nBaseline Priority: ${dbPriority} — only assign HIGHER if the text clearly warrants it.` : '';

  return `Target Categories: ${JSON.stringify(buckets)}

Ticket Description:
"${ticketText}"

Rule Engine Context:
Scores: ${JSON.stringify(scores)}
${priorityExamples}${hint}

Analyze the situation and return structured JSON with: primary_category, secondary_category (or null), priority (Low/Medium/High/Urgent), risk_flag (or null), reasoning.`;
}

export async function classifyWithGroq(
  ticketText: string,
  scores: Record<string, number>,
  dbPriority?: string,
): Promise<{ priority: string; risk_flag: string | null; reasoning: string; secondary_category_code: string | null; primary_category: string | null } | null> {

  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) {
    console.warn('[MobileGroq] GROQ_API_KEY missing, using rule fallback');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(ticketText, scores, dbPriority) },
        ],
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const pMap: Record<string, string> = { low: 'low', medium: 'medium', high: 'high', urgent: 'urgent' };
    const priority = pMap[parsed.priority?.toLowerCase()] || 'medium';

    return {
      priority,
      primary_category: parsed.primary_category?.toLowerCase() || null,
      risk_flag: parsed.risk_flag || null,
      reasoning: parsed.reasoning || null,
      secondary_category_code: parsed.secondary_category || null,
    };
  } catch (err) {
    console.warn('[MobileGroq] LLM classification failed, using rule fallback:', err);
    return null;
  }
}

/* ─── Complete Hybrid Classification ──────────────────────────────────────── */

export async function classifyTicket(text: string): Promise<ClassificationResult> {
  // Step 1: Rule engine
  const ruleResult = classifyWithRules(text);

  // Step 2: LLM enhancement
  const llmResult = await classifyWithGroq(text, ruleResult.scores);

  if (llmResult) {
    // LLM gets final say on the primary category if it returns a valid one
    const llmSkillGroup = llmResult.primary_category as SkillGroup;
    const isValidLlmGroup = ['technical', 'plumbing', 'vendor', 'soft_services'].includes(llmSkillGroup);
    const finalSkillGroup = isValidLlmGroup ? llmSkillGroup : ruleResult.skill_group;
    
    // If the LLM overrides the rule engine's category, the old issue_code may not belong to the new group
    const finalIssueCode = finalSkillGroup === ruleResult.skill_group ? ruleResult.issue_code : null;

    return {
      issue_code: finalIssueCode,
      skill_group: finalSkillGroup,
      confidence: finalSkillGroup !== ruleResult.skill_group ? 'high' : ruleResult.confidence,
      priority: llmResult.priority,
      risk_flag: llmResult.risk_flag,
      llm_reasoning: llmResult.reasoning,
      secondary_category_code: llmResult.secondary_category_code,
      classification_source: finalSkillGroup === ruleResult.skill_group && ruleResult.confidence === 'high' ? 'hybrid' : 'groq_llm',
    };
  }

  // Fallback: rule-only
  return {
    issue_code: ruleResult.issue_code,
    skill_group: ruleResult.skill_group,
    confidence: ruleResult.confidence,
    priority: 'medium',
    risk_flag: null,
    llm_reasoning: null,
    secondary_category_code: null,
    classification_source: 'rule_engine',
  };
}
