import type { NarrativeTypeV1, NormalizedTokenV1 } from "@reducedmode/contracts";

export interface SocialCollectorInput {
  enabled: boolean;
  token: NormalizedTokenV1;
}

export interface SocialCollection {
  enabled: boolean;
  data_status: "disabled" | "data_insufficient" | "ok";
  samples: Array<{ narrative_type: NarrativeTypeV1; score: number }>;
  notes: string[];
}

export function collectSocialSignals(input: SocialCollectorInput): SocialCollection {
  if (!input.enabled) {
    return {
      enabled: false,
      data_status: "disabled",
      samples: [],
      notes: ["social_collection_disabled_by_config"],
    };
  }

  const samples = extractSamples(input.token);
  if (samples.length < 10) {
    return {
      enabled: true,
      data_status: "data_insufficient",
      samples,
      notes: [`social_samples=${samples.length}`, "minimum_required_samples=10"],
    };
  }

  return {
    enabled: true,
    data_status: "ok",
    samples,
    notes: [`social_samples=${samples.length}`],
  };
}

function extractSamples(token: NormalizedTokenV1): Array<{ narrative_type: NarrativeTypeV1; score: number }> {
  const output: Array<{ narrative_type: NarrativeTypeV1; score: number }> = [];
  for (const snapshot of token.snapshots) {
    const raw = snapshot.raw;
    if (!raw || typeof raw !== "object") continue;
    const narrative = (raw as Record<string, unknown>).narrative_type;
    const score = (raw as Record<string, unknown>).narrative_score;
    if (typeof narrative === "string" && typeof score === "number") {
      if (narrative === "momentum" || narrative === "meme" || narrative === "utility" || narrative === "mixed" || narrative === "unknown") {
        output.push({
          narrative_type: narrative,
          score,
        });
      }
    }
  }
  return output;
}
