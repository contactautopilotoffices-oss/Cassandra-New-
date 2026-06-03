import { createAdminClient } from "@/lib/supabase/admin";
import { classifyTicketEnhanced, type EnhancedClassificationResult, type SkillGroup } from "./classifyTicket";
import { analyzeConfidence, getTopCandidates, type ConfidenceAnalysis, type ClassificationZone } from "./confidence";
import { classifyWithGroq, type LLMInput } from "@/lib/llm/groq";

export type DecisionSource = "rule" | "llm" | "human";

export interface ResolvedClassification {
  issue_code: string | null;
  skill_group: SkillGroup;
  confidence: "high" | "low";
  zone: ClassificationZone;
  decisionSource: DecisionSource;
  llmUsed: boolean;
  llmEnhanced: boolean;
  enhancedClassification: boolean;
  secondary_category_code?: string | null;
  risk_flag?: string | null;
  llm_reasoning?: string | null;
  priority?: string | null;
  ruleResult: EnhancedClassificationResult;
  confidenceAnalysis: ConfidenceAnalysis;
  llmResult?: {
    selectedBucket: string;
    secondaryBucket?: string | null;
    priority?: string;
    riskFlag?: string | null;
    reason: string;
    latencyMs: number;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };
}

export interface ClassificationLogEntry {
  ticket_id: string;
  rule_top_bucket: string;
  rule_scores: Record<string, number>;
  rule_margin: number;
  entropy: number;
  llm_used: boolean;
  llm_bucket?: string;
  llm_secondary_bucket?: string | null;
  llm_risk_flag?: string | null;
  llm_reason?: string;
  llm_latency_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  final_bucket: string;
  decision_source: DecisionSource;
  zone: ClassificationZone;
}

export async function resolveClassification(ticketText: string, dbPriority?: string): Promise<ResolvedClassification> {
  const ruleResult = classifyTicketEnhanced(ticketText);
  const confidenceAnalysis = analyzeConfidence(ruleResult, ticketText);

  const finalResult: ResolvedClassification = {
    issue_code: ruleResult.issue_code,
    skill_group: ruleResult.skill_group,
    confidence: ruleResult.confidence,
    zone: confidenceAnalysis.zone,
    decisionSource: "rule",
    llmUsed: false,
    llmEnhanced: false,
    enhancedClassification: false,
    ruleResult,
    confidenceAnalysis
  };

  const topCandidates = getTopCandidates(ruleResult, 3);
  const shouldUseLlm = true;

  if (shouldUseLlm) {
    const llmInput: LLMInput = {
      ticket_text: ticketText,
      candidate_buckets: ["technical", "plumbing", "vendor", "soft_services"],
      rule_scores: ruleResult.scores,
      db_priority: dbPriority
    };

    const llmResponse = await classifyWithGroq(llmInput);
    if (llmResponse.success && llmResponse.result) {
      const llmResult = llmResponse.result;
      const matchedCandidate = topCandidates.find((candidate) => candidate.skill_group === llmResult.primary_category);

      finalResult.skill_group = llmResult.primary_category as SkillGroup;
      finalResult.issue_code = matchedCandidate?.issue_code ?? finalResult.issue_code;
      finalResult.confidence = "high";
      finalResult.decisionSource = "llm";
      finalResult.llmUsed = true;
      finalResult.llmEnhanced = true;
      finalResult.enhancedClassification = true;
      finalResult.secondary_category_code = llmResult.secondary_category;
      finalResult.risk_flag = llmResult.risk_flag;
      finalResult.llm_reasoning = llmResult.reasoning;
      finalResult.priority = llmResult.priority;
      finalResult.llmResult = {
        selectedBucket: llmResult.primary_category,
        secondaryBucket: llmResult.secondary_category,
        priority: llmResult.priority,
        riskFlag: llmResult.risk_flag,
        reason: llmResult.reasoning,
        latencyMs: llmResponse.latencyMs,
        usage: llmResponse.usage
      };
    }
  }

  return finalResult;
}

export async function logClassification(ticketId: string, resolution: ResolvedClassification): Promise<void> {
  try {
    const admin = createAdminClient();
    const entry: ClassificationLogEntry = {
      ticket_id: ticketId,
      rule_top_bucket: resolution.ruleResult.skill_group,
      rule_scores: resolution.ruleResult.scores,
      rule_margin: resolution.ruleResult.margin,
      entropy: resolution.confidenceAnalysis.entropy,
      llm_used: resolution.llmUsed,
      llm_bucket: resolution.llmResult?.selectedBucket,
      llm_secondary_bucket: resolution.llmResult?.secondaryBucket,
      llm_risk_flag: resolution.llmResult?.riskFlag,
      llm_reason: resolution.llmResult?.reason,
      llm_latency_ms: resolution.llmResult?.latencyMs,
      prompt_tokens: resolution.llmResult?.usage?.prompt_tokens,
      completion_tokens: resolution.llmResult?.usage?.completion_tokens,
      total_tokens: resolution.llmResult?.usage?.total_tokens,
      final_bucket: resolution.skill_group,
      decision_source: resolution.decisionSource,
      zone: resolution.zone
    };

    const { error } = await admin.from("ticket_classification_logs").insert(entry);
    if (error) {
      console.error("[saas-mobile-server] classification log insert failed:", error);
    }
  } catch (error) {
    console.error("[saas-mobile-server] classification log error:", error);
  }
}
