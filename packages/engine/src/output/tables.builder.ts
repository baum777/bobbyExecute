import type { TokenAnalysisV1, ReducedModeRunV1 } from "@bobby/contracts";

export function buildRankings(tokens: TokenAnalysisV1[]): ReducedModeRunV1["rankings"] {
  const topStructural = [...tokens]
    .sort((a, b) => b.structural.structural_score - a.structural.structural_score)
    .slice(0, 10)
    .map((t) => ({
      contract_address: t.normalized.contract_address,
      symbol: t.normalized.symbol,
      structural_score: t.structural.structural_score,
    }));

  const topFragile = [...tokens]
    .sort((a, b) => {
      const riskDiff = b.risk.overall_risk_score - a.risk.overall_risk_score;
      if (riskDiff !== 0) return riskDiff;
      return b.divergence.divergence_count - a.divergence.divergence_count;
    })
    .slice(0, 10)
    .map((t) => ({
      contract_address: t.normalized.contract_address,
      symbol: t.normalized.symbol,
      overall_risk_score: t.risk.overall_risk_score,
      divergence_count: t.divergence.divergence_count,
    }));

  return { top_structural: topStructural, top_fragile: topFragile };
}

export function buildTransparency(
  tokens: TokenAnalysisV1[],
  minCompleteness: number,
): ReducedModeRunV1["transparency"] {
  if (tokens.length === 0) {
    return {
      avg_completeness: 0,
      avg_cross_source_confidence: 0,
      avg_discrepancy_rate: 0,
      tokens_below_min_completeness: 0,
    };
  }

  const avgCompleteness =
    tokens.reduce((s, t) => s + t.normalized.data_quality.completeness, 0) / tokens.length;
  const avgConfidence =
    tokens.reduce((s, t) => s + t.normalized.data_quality.cross_source_confidence, 0) / tokens.length;
  const avgDiscrepancy =
    tokens.reduce((s, t) => s + t.normalized.data_quality.discrepancy_rate, 0) / tokens.length;
  const belowMin = tokens.filter(
    (t) => t.normalized.data_quality.completeness < minCompleteness,
  ).length;

  return {
    avg_completeness: round(avgCompleteness, 2),
    avg_cross_source_confidence: round(avgConfidence, 4),
    avg_discrepancy_rate: round(avgDiscrepancy, 4),
    tokens_below_min_completeness: belowMin,
  };
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}
