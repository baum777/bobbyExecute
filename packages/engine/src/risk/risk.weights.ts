import type { DynamicWeightProfileV1, StructuralMetricsV1, SocialIntelV1 } from "@bobby/contracts";

export type RiskProfile = "thin_fragile" | "volatile_expansion" | "default";

interface ProfileWeights {
  liquidity: number;
  manipulation: number;
  exhaustion: number;
  structural: number;
}

const PROFILES: Record<RiskProfile, ProfileWeights> = {
  thin_fragile: { liquidity: 0.45, manipulation: 0.30, exhaustion: 0.15, structural: 0.10 },
  volatile_expansion: { liquidity: 0.35, exhaustion: 0.30, manipulation: 0.20, structural: 0.15 },
  default: { liquidity: 0.30, exhaustion: 0.25, manipulation: 0.20, structural: 0.25 },
};

export function selectProfile(
  structural: StructuralMetricsV1,
  social: SocialIntelV1,
  discrepancyRate: number,
): RiskProfile {
  if (structural.liquidity_regime === "Fragile" || structural.liquidity_regime === "Thin") {
    return "thin_fragile";
  }
  if (structural.volatility_regime === "High" && structural.structural_score < 50) {
    return "volatile_expansion";
  }
  void social;
  void discrepancyRate;
  return "default";
}

export function getProfileWeights(profile: RiskProfile): ProfileWeights {
  return PROFILES[profile];
}

export function selectWeightProfile(
  structural: StructuralMetricsV1,
  social: SocialIntelV1,
  discrepancyRate: number,
): DynamicWeightProfileV1 {
  const profile = selectProfile(structural, social, discrepancyRate);
  const w = PROFILES[profile];

  const profileName = profile === "thin_fragile" ? "risk_averse"
    : profile === "volatile_expansion" ? "structural_heavy"
    : "balanced";

  return {
    profile: profileName,
    structural_weight: w.structural,
    social_weight: 0,
    divergence_weight: w.manipulation,
    data_quality_weight: w.exhaustion + w.liquidity,
  };
}
