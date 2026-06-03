/**
 * Confidence Analyzer for Hybrid Classification
 * 
 * Determines classification zones based on margin and entropy:
 * - Zone A: High confidence, rule-only (margin >= 9 AND low entropy)
 * - Zone B: Ambiguous, LLM assist needed (margin 4-8 OR high entropy)
 * - Zone C: Very low confidence, human review required (margin <= 3 AND high entropy)
 */

import { EnhancedClassificationResult, SkillGroup } from './classifyTicket';

export type ClassificationZone = 'A' | 'B' | 'C';

export interface ConfidenceAnalysis {
    zone: ClassificationZone;
    margin: number;
    entropy: number;
    needsLlm: boolean;
    needsHumanReview: boolean;
    reason: string;
}

// Thresholds from PRD
const MARGIN_LLM_THRESHOLD = 8;  // Force LLM if margin < 8
const SCORE_LLM_THRESHOLD = 40;   // Force LLM if top score < 40
const ENTROPY_HIGH = 0.7;         // High entropy threshold

/**
 * Detect semantic signals that require LLM reasoning
 * (Negation, Temporal, Safety/Risk, Multi-domain)
 */
function detectSemanticSignals(text: string): {
    hasNegation: boolean;
    hasTemporal: boolean;
    hasSafetyRisk: boolean;
    signalReason: string | null;
} {
    const lower = text.toLowerCase();

    const negations = ['no ', 'not', 'without', 'none', 'never', "don't", "didn't", "wasn't"];
    const temporals = ['after', 'before', 'only when', 'sometimes', 'yesterday', 'morning', 'every', 'when '];
    const safetyRisks = ['burnt', 'spark', 'smoke', 'overheat', 'fire', 'electric shock', 'burning', 'blast'];

    const hasNegation = negations.some(n => lower.includes(n));
    const hasTemporal = temporals.some(t => lower.includes(t));
    const hasSafetyRisk = safetyRisks.some(s => lower.includes(s));

    let signalReason = null;
    if (hasSafetyRisk) signalReason = 'Safety/Risk signal detected';
    else if (hasNegation) signalReason = 'Negation detected (potential context flip)';
    else if (hasTemporal) signalReason = 'Temporal/Conditional context detected';

    return { hasNegation, hasTemporal, hasSafetyRisk, signalReason };
}

/**
 * Calculate Shannon entropy for score distribution
 * Higher entropy = more uncertainty/disagreement
 */
function calculateEntropy(scores: Record<string, number>): number {
    const values = Object.values(scores);
    const total = values.reduce((sum, v) => sum + v, 0);

    if (total === 0) return 0;

    let entropy = 0;
    for (const score of values) {
        if (score > 0) {
            const p = score / total;
            entropy -= p * Math.log2(p);
        }
    }

    // Normalize to 0-1 (max entropy for 4 categories is log2(4) = 2)
    return entropy / 2;
}

/**
 * Analyze classification confidence and determine zone
 */
export function analyzeConfidence(result: EnhancedClassificationResult, text: string = ''): ConfidenceAnalysis {
    const { margin, scores, candidates } = result;
    const entropy = calculateEntropy(scores);

    // Normalize top score to a 0-100 scale for comparison with threshold
    // Raw scores are keyword counts. 1 match = 20 pts (capped at 100)
    const topScoreRaw = candidates[0]?.score || 0;
    const topScoreNormalized = Math.min(topScoreRaw * 20, 100);

    // Check for semantic signals
    const signals = detectSemanticSignals(text || '');

    // No matches at all - definitely needs LLM/Review
    if (topScoreRaw === 0) {
        return {
            zone: 'C',
            margin: 0,
            entropy: 0,
            needsLlm: true,
            needsHumanReview: true,
            reason: 'No keyword matches found',
        };
    }

    // Force LLM if safety risk or negation detected
    if (signals.hasSafetyRisk || signals.hasNegation || signals.hasTemporal) {
        return {
            zone: 'B',
            margin,
            entropy,
            needsLlm: true,
            needsHumanReview: false,
            reason: signals.signalReason || 'Semantic override',
        };
    }

    // Zone B: Ambiguous - LLM assist
    // Force LLM if margin < 8 OR top score < 40 OR high entropy
    if (margin < MARGIN_LLM_THRESHOLD || topScoreNormalized < SCORE_LLM_THRESHOLD || entropy >= ENTROPY_HIGH) {
        let reason = '';
        if (margin < MARGIN_LLM_THRESHOLD) reason = `Low margin: ${margin}`;
        else if (topScoreNormalized < SCORE_LLM_THRESHOLD) reason = `Weak match: ${topScoreNormalized} pts`;
        else reason = `High uncertainty (entropy: ${entropy.toFixed(2)})`;

        return {
            zone: 'B',
            margin,
            entropy,
            needsLlm: true,
            needsHumanReview: false,
            reason,
        };
    }

    // Zone A: High confidence - rule only
    return {
        zone: 'A',
        margin,
        entropy,
        needsLlm: false,
        needsHumanReview: false,
        reason: `Clear winner: margin ${margin}, score ${topScoreNormalized} pts`,
    };
}

/**
 * Get top N candidates for LLM context
 */
export function getTopCandidates(
    result: EnhancedClassificationResult,
    n: number = 2
): Array<{ skill_group: SkillGroup; score: number; issue_code: string | null }> {
    return result.candidates
        .filter(c => c.score > 0)
        .slice(0, n);
}
