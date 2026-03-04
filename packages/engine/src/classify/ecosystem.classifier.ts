import type {
  EcosystemClassV1,
  StructuralMetricsV1,
  SocialIntelV1,
  DivergenceV1,
  MarketStructure,
  NarrativeType,
  LiquidityRegime,
} from "@bobby/contracts";

export function classifyEcosystem(
  structuralMetrics: StructuralMetricsV1[],
  socialIntels: SocialIntelV1[],
  divergences: DivergenceV1[],
): EcosystemClassV1 {
  return {
    market_structure: inferMarketStructure(structuralMetrics, divergences),
    narrative_dominance: inferNarrativeDominance(socialIntels),
    liquidity_regime: inferAggLiquidityRegime(structuralMetrics),
  };
}

function inferMarketStructure(
  metrics: StructuralMetricsV1[],
  divergences: DivergenceV1[],
): MarketStructure {
  const avgScore =
    metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.structural_score, 0) / metrics.length
      : 0;

  const totalDivergences = divergences.reduce((sum, d) => sum + d.divergence_count, 0);
  const hasFragileOverride = divergences.some((d) => d.classification_override === "Fragile Expansion");

  if (hasFragileOverride || totalDivergences > metrics.length * 1.5) {
    return "Fragile Expansion";
  }

  if (avgScore >= 60) return "Expanding";
  if (avgScore >= 35) return "Stable";
  return "Contracting";
}

function inferNarrativeDominance(socials: SocialIntelV1[]): NarrativeType {
  const enabled = socials.filter((s) => s.data_status === "ok");
  if (enabled.length === 0) return "Mixed";

  const counts = new Map<NarrativeType, number>();
  for (const s of enabled) {
    const n = s.narrative;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }

  let maxNarrative: NarrativeType = "Mixed";
  let maxCount = 0;
  for (const [narrative, count] of counts) {
    if (count > maxCount) {
      maxNarrative = narrative;
      maxCount = count;
    }
  }

  if (maxCount < enabled.length * 0.3) return "Mixed";
  return maxNarrative;
}

function inferAggLiquidityRegime(metrics: StructuralMetricsV1[]): LiquidityRegime {
  if (metrics.length === 0) return "Fragile";

  const counts: Record<LiquidityRegime, number> = {
    Structural: 0,
    Healthy: 0,
    Thin: 0,
    Fragile: 0,
  };

  for (const m of metrics) {
    counts[m.liquidity_regime]++;
  }

  let maxRegime: LiquidityRegime = "Fragile";
  let maxCount = 0;
  for (const [regime, count] of Object.entries(counts) as [LiquidityRegime, number][]) {
    if (count > maxCount) {
      maxRegime = regime;
      maxCount = count;
    }
  }

  return maxRegime;
}
