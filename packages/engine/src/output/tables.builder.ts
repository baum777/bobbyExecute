import type { TokenAnalysisV1 } from "@reducedmode/contracts";

export interface RankedTables {
  top_structural: TokenAnalysisV1[];
  top_fragile: TokenAnalysisV1[];
}

export function buildRankedTables(tokens: TokenAnalysisV1[], max = 10): RankedTables {
  const orderedByStructural = [...tokens].sort((a, b) => {
    const diff = b.structural.structural_score - a.structural.structural_score;
    if (diff !== 0) return diff;
    return a.token.contract_address.localeCompare(b.token.contract_address);
  });

  const orderedByFragile = [...tokens].sort((a, b) => {
    const riskDiff = b.risk.overall_risk_score - a.risk.overall_risk_score;
    if (riskDiff !== 0) return riskDiff;
    const divDiff = b.divergence.signal_count - a.divergence.signal_count;
    if (divDiff !== 0) return divDiff;
    return a.token.contract_address.localeCompare(b.token.contract_address);
  });

  return {
    top_structural: orderedByStructural.slice(0, max),
    top_fragile: orderedByFragile.slice(0, max),
  };
}
