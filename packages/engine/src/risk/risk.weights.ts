import { DynamicWeightProfileV1Schema, type DynamicWeightProfileV1, type DivergenceV1, type SocialIntelV1, type StructuralMetricsV1 } from "@reducedmode/contracts";

export function selectDynamicWeightProfile(input: {
  structural: StructuralMetricsV1;
  social: SocialIntelV1;
  divergence: DivergenceV1;
}): DynamicWeightProfileV1 {
  const structuralScore = input.structural.structural_score;
  const divergenceCount = input.divergence.signal_count;

  if (divergenceCount >= 2) {
    return DynamicWeightProfileV1Schema.parse({
      profile: "fragile_expansion",
      weights: {
        structural: 0.35,
        social: 0.15,
        quality: 0.2,
        divergence: 0.3,
      },
      rationale: "divergence_signal_count>=2",
    });
  }

  if (structuralScore < 40) {
    return DynamicWeightProfileV1Schema.parse({
      profile: "risk_off",
      weights: {
        structural: 0.45,
        social: 0.1,
        quality: 0.3,
        divergence: 0.15,
      },
      rationale: "structural_score_low",
    });
  }

  if (input.social.data_status === "ok" && (input.social.weighted_narrative_score ?? 0) >= 70) {
    return DynamicWeightProfileV1Schema.parse({
      profile: "risk_on",
      weights: {
        structural: 0.3,
        social: 0.3,
        quality: 0.2,
        divergence: 0.2,
      },
      rationale: "social_signal_strong",
    });
  }

  return DynamicWeightProfileV1Schema.parse({
    profile: "balanced",
    weights: {
      structural: 0.35,
      social: 0.2,
      quality: 0.25,
      divergence: 0.2,
    },
    rationale: "default_balanced_profile",
  });
}
