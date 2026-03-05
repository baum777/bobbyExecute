import type { NormalizedTokenV1, StructuralMetricsV1, SocialIntelV1, RiskBreakdownV1, DivergenceV1, TokenAnalysisV1, EcosystemClassV1 } from "@bobby/contracts";
import { buildReasoningBullets } from "./reasoning.bullets.js";

export function buildTokenAnalysis(
  normalized: NormalizedTokenV1,
  structural: StructuralMetricsV1,
  social: SocialIntelV1,
  risk: RiskBreakdownV1,
  divergence: DivergenceV1,
  ecosystem: EcosystemClassV1 | null,
): TokenAnalysisV1 {
  return {
    normalized,
    structural,
    social,
    risk,
    divergence,
    reasoning: buildReasoningBullets(normalized, structural, risk, divergence, ecosystem),
  };
}
