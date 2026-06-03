/**
 * Deterministic Ticket Classification Engine (Enhanced for Hybrid System)
 * 
 * Rules:
 * 1. Convert input text to lowercase
 * 2. Perform keyword matching using dictionary only
 * 3. Longer keyword wins within same skill group (specificity)
 * 4. Resolve across skill groups using precedence: vendor > technical > plumbing > soft_service
 * 5. Location words are ignored for classification
 * 6. If no match: skill_group = technical, issue_code = null, confidence = low
 * 
 * Enhanced: Now returns scores for all candidates to enable confidence analysis
 */

import dictionary from './issueDictionary.json';

export type SkillGroup = 'technical' | 'plumbing' | 'vendor' | 'soft_services';
export type Confidence = 'high' | 'low';

export interface ClassificationResult {
    issue_code: string | null;
    skill_group: SkillGroup;
    confidence: Confidence;
}

/**
 * Enhanced classification result with scoring details for hybrid system
 */
export interface EnhancedClassificationResult extends ClassificationResult {
    /** Scores per skill group (count of keyword matches) */
    scores: Record<SkillGroup, number>;
    /** Top N candidates ordered by score */
    candidates: Array<{ skill_group: SkillGroup; score: number; issue_code: string | null }>;
    /** Score difference between top two candidates */
    margin: number;
}

interface Match {
    issue_code: string;
    skill_group: SkillGroup;
    keyword: string;
    keyword_length: number;
}

/**
 * Classify a ticket and return enhanced results with scores
 * @param text - The ticket title or description
 * @returns Enhanced classification result with scores and candidates
 */
export function classifyTicketEnhanced(text: string): EnhancedClassificationResult {
    // Rule 1: Convert to lowercase
    const lowerText = text.toLowerCase();

    // Collect all matches
    const matches: Match[] = [];

    // Iterate through skill groups
    const skillGroups: SkillGroup[] = ['vendor', 'technical', 'plumbing', 'soft_services'];

    for (const skillGroup of skillGroups) {
        const issues = dictionary[skillGroup as keyof typeof dictionary];

        if (!issues || typeof issues !== 'object') continue;

        for (const [issueCode, keywords] of Object.entries(issues)) {
            if (!Array.isArray(keywords)) continue;

            for (const keyword of keywords) {
                if (lowerText.includes(keyword)) {
                    matches.push({
                        issue_code: issueCode,
                        skill_group: skillGroup,
                        keyword: keyword,
                        keyword_length: keyword.length,
                    });
                }
            }
        }
    }

    // Calculate scores per skill group (count of unique matches)
    const scores: Record<SkillGroup, number> = {
        technical: 0,
        plumbing: 0,
        vendor: 0,
        soft_services: 0,
    };

    // Count unique issue_code matches per skill group
    const skillGroupIssueCounts: Record<SkillGroup, Set<string>> = {
        technical: new Set(),
        plumbing: new Set(),
        vendor: new Set(),
        soft_services: new Set(),
    };

    for (const match of matches) {
        skillGroupIssueCounts[match.skill_group].add(match.issue_code);
    }

    for (const sg of skillGroups) {
        // Score = total keyword matches for this skill group
        scores[sg] = matches.filter(m => m.skill_group === sg).length;
    }

    // Build candidates sorted by score
    const candidates = skillGroups
        .map(sg => {
            const groupMatches = matches.filter(m => m.skill_group === sg);
            let bestIssueCode: string | null = null;

            if (groupMatches.length > 0) {
                // Find best issue_code within group
                const counts: Record<string, number> = {};
                groupMatches.forEach(m => {
                    counts[m.issue_code] = (counts[m.issue_code] || 0) + 1;
                });

                let maxCount = 0;
                for (const [code, count] of Object.entries(counts)) {
                    if (count > maxCount) {
                        maxCount = count;
                        bestIssueCode = code;
                    } else if (count === maxCount && bestIssueCode) {
                        // Tie-breaker: longest keyword
                        const currentMaxLen = Math.max(...groupMatches.filter(m => m.issue_code === code).map(m => m.keyword_length));
                        const bestMaxLen = Math.max(...groupMatches.filter(m => m.issue_code === bestIssueCode).map(m => m.keyword_length));
                        if (currentMaxLen > bestMaxLen) {
                            bestIssueCode = code;
                        }
                    }
                }
            }

            return {
                skill_group: sg,
                score: scores[sg],
                issue_code: bestIssueCode,
            };
        })
        .sort((a, b) => b.score - a.score);

    // Calculate margin (difference between top two scores)
    const topScore = candidates[0]?.score || 0;
    const secondScore = candidates[1]?.score || 0;
    const margin = topScore - secondScore;

    // Rule 6: No matches = fallback
    if (matches.length === 0) {
        return {
            issue_code: null,
            skill_group: dictionary.defaults.fallback_skill_group as SkillGroup,
            confidence: dictionary.defaults.confidence_on_fallback as Confidence,
            scores,
            candidates,
            margin: 0,
        };
    }

    // Rule 4: Group matches by skill group and apply precedence
    const precedence = dictionary.precedence_order as SkillGroup[];

    for (const skillGroup of precedence) {
        const groupMatches = matches.filter(m => m.skill_group === skillGroup);

        if (groupMatches.length > 0) {
            // Rule 3: Within the group, pick issue_code with MOST keyword matches
            const counts: Record<string, number> = {};
            groupMatches.forEach(m => {
                counts[m.issue_code] = (counts[m.issue_code] || 0) + 1;
            });

            let bestIssueCode = groupMatches[0].issue_code;
            let maxCount = 0;

            for (const [code, count] of Object.entries(counts)) {
                if (count > maxCount) {
                    maxCount = count;
                    bestIssueCode = code;
                } else if (count === maxCount) {
                    const currentMaxLen = Math.max(...groupMatches.filter(m => m.issue_code === code).map(m => m.keyword_length));
                    const bestMaxLen = Math.max(...groupMatches.filter(m => m.issue_code === bestIssueCode).map(m => m.keyword_length));
                    if (currentMaxLen > bestMaxLen) {
                        bestIssueCode = code;
                    }
                }
            }

            return {
                issue_code: bestIssueCode,
                skill_group: skillGroup,
                confidence: 'high',
                scores,
                candidates,
                margin,
            };
        }
    }

    // Fallback (should not reach here)
    return {
        issue_code: null,
        skill_group: 'technical',
        confidence: 'low',
        scores,
        candidates,
        margin: 0,
    };
}

/**
 * Original classify function for backward compatibility
 * @param text - The ticket title or description
 * @returns Classification result with issue_code, skill_group, and confidence
 */
export function classifyTicket(text: string): ClassificationResult {
    const enhanced = classifyTicketEnhanced(text);
    return {
        issue_code: enhanced.issue_code,
        skill_group: enhanced.skill_group,
        confidence: enhanced.confidence,
    };
}

/**
 * Get display name for a skill group
 */
export function getSkillGroupDisplayName(skillGroup: SkillGroup): string {
    const names: Record<SkillGroup, string> = {
        technical: 'Technical',
        plumbing: 'Plumbing',
        vendor: 'Vendor',
        soft_services: 'Soft Services',
    };
    return names[skillGroup];
}

/**
 * Get icon name for a skill group (for use with Lucide icons)
 */
export function getSkillGroupIcon(skillGroup: SkillGroup): string {
    const icons: Record<SkillGroup, string> = {
        technical: 'Wrench',
        plumbing: 'Droplet',
        vendor: 'Building2',
        soft_services: 'Sparkles',
    };
    return icons[skillGroup];
}

/**
 * Get color classes for a skill group
 */
export function getSkillGroupColor(skillGroup: SkillGroup): {
    bg: string;
    text: string;
    border: string;
} {
    const colors: Record<SkillGroup, { bg: string; text: string; border: string }> = {
        technical: {
            bg: 'bg-blue-500/10',
            text: 'text-blue-500',
            border: 'border-blue-500/20',
        },
        plumbing: {
            bg: 'bg-cyan-500/10',
            text: 'text-cyan-500',
            border: 'border-cyan-500/20',
        },
        vendor: {
            bg: 'bg-amber-500/10',
            text: 'text-amber-500',
            border: 'border-amber-500/20',
        },
        soft_services: {
            bg: 'bg-purple-500/10',
            text: 'text-purple-500',
            border: 'border-purple-500/20',
        },
    };
    return colors[skillGroup];
}

export default classifyTicket;
