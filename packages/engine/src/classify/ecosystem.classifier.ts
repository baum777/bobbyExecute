import { EcosystemClassV1Schema, type DivergenceV1, type EcosystemClassV1, type SocialIntelV1, type StructuralMetricsV1 } from "@reducedmode/contracts";

export function classifyEcosystem(input: {
  structural: StructuralMetricsV1;
  social: SocialIntelV1;
  divergence: DivergenceV1;
}): EcosystemClassV1 {
  const marketStructure = inferMarketStructure(input.structural.structural_score);
  const narrativeDominance =
    input.social.data_status === "ok"
      ? input.social.narrative_type
      : input.social.data_status === "disabled"
        ? "mixed"
        : "unknown";
  const liquidityRegime = input.structural.liquidity_regime;

  const classification = input.divergence.has_override
    ? "Fragile Expansion"
    : `${marketStructure}:${liquidityRegime}:${narrativeDominance}`;

  return EcosystemClassV1Schema.parse({
    market_structure: marketStructure,
    narrative_dominance: narrativeDominance,
    liquidity_regime: liquidityRegime,
    classification,
  });
}

function inferMarketStructure(score: number): "expanding" | "stable" | "contracting" | "uncertain" {
  if (score >= 70) return "expanding";
  if (score >= 50) return "stable";
  if (score >= 35) return "contracting";
  return "uncertain";
}
