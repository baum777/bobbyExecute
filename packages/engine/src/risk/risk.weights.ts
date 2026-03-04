import type { DynamicWeightProfileV1, WeightProfile, SocialIntelV1 } from "@bobby/contracts";

const PROFILES: Record<WeightProfile, Omit<DynamicWeightProfileV1, "profile">> = {
  balanced: {
    structural_weight: 0.35,
    social_weight: 0.20,
    divergence_weight: 0.25,
    data_quality_weight: 0.20,
  },
  structural_heavy: {
    structural_weight: 0.50,
    social_weight: 0.10,
    divergence_weight: 0.20,
    data_quality_weight: 0.20,
  },
  social_heavy: {
    structural_weight: 0.20,
    social_weight: 0.40,
    divergence_weight: 0.20,
    data_quality_weight: 0.20,
  },
  risk_averse: {
    structural_weight: 0.25,
    social_weight: 0.10,
    divergence_weight: 0.35,
    data_quality_weight: 0.30,
  },
};

export function selectWeightProfile(
  social: SocialIntelV1,
  discrepancyRate: number,
): DynamicWeightProfileV1 {
  let profile: WeightProfile;

  if (discrepancyRate > 0.3) {
    profile = "risk_averse";
  } else if (social.data_status === "ok" && social.mention_count_24h !== null && social.mention_count_24h > 50) {
    profile = "social_heavy";
  } else if (social.data_status === "disabled" || social.data_status === "data_insufficient") {
    profile = "structural_heavy";
  } else {
    profile = "balanced";
  }

  const weights = PROFILES[profile];

  if (social.data_status === "disabled" || social.data_status === "data_insufficient") {
    const redistribute = weights.social_weight;
    return {
      profile,
      structural_weight: round(weights.structural_weight + redistribute * 0.5, 4),
      social_weight: 0,
      divergence_weight: round(weights.divergence_weight + redistribute * 0.3, 4),
      data_quality_weight: round(weights.data_quality_weight + redistribute * 0.2, 4),
    };
  }

  return { profile, ...weights };
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}
