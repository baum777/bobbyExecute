import { SocialIntelV1Schema, type SocialIntelV1 } from "@reducedmode/contracts";
import type { SocialCollection } from "./social.collector.js";

export function scoreSocialIntel(collection: SocialCollection): SocialIntelV1 {
  if (collection.data_status === "disabled") {
    return SocialIntelV1Schema.parse({
      enabled: false,
      data_status: "disabled",
      sample_size: 0,
      weighted_narrative_score: null,
      narrative_type: "mixed",
      notes: collection.notes,
    });
  }

  if (collection.data_status === "data_insufficient") {
    return SocialIntelV1Schema.parse({
      enabled: true,
      data_status: "data_insufficient",
      sample_size: collection.samples.length,
      weighted_narrative_score: null,
      narrative_type: "unknown",
      notes: collection.notes,
    });
  }

  const sampleSize = collection.samples.length;
  const weighted = collection.samples.reduce((sum, sample) => sum + sample.score, 0) / sampleSize;
  const narrative = dominantNarrative(collection.samples.map((x) => x.narrative_type));

  return SocialIntelV1Schema.parse({
    enabled: true,
    data_status: "ok",
    sample_size: sampleSize,
    weighted_narrative_score: clamp(weighted, 0, 100),
    narrative_type: narrative,
    notes: collection.notes,
  });
}

function dominantNarrative(values: string[]): "momentum" | "meme" | "utility" | "mixed" | "unknown" {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let winner: string = "unknown";
  let winnerCount = -1;
  for (const [key, count] of counts.entries()) {
    if (count > winnerCount) {
      winner = key;
      winnerCount = count;
    }
  }
  if (winner === "momentum" || winner === "meme" || winner === "utility" || winner === "mixed" || winner === "unknown") {
    return winner;
  }
  return "unknown";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
