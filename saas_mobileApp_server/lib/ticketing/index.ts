export {
  classifyTicket,
  classifyTicketEnhanced,
  getSkillGroupDisplayName,
  getSkillGroupIcon,
  getSkillGroupColor,
  type SkillGroup,
  type Confidence,
  type ClassificationResult,
  type EnhancedClassificationResult
} from "./classifyTicket";

export {
  analyzeConfidence,
  getTopCandidates,
  type ConfidenceAnalysis,
  type ClassificationZone
} from "./confidence";

export {
  resolveClassification,
  logClassification,
  type ResolvedClassification,
  type DecisionSource
} from "./resolver";
