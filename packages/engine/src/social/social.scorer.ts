import type { SocialIntelV1 } from "@bobby/contracts";
import type { SocialRawData } from "./social.collector.js";

export function scoreSocial(
  contractAddress: string,
  raw: SocialRawData | null,
  enabled: boolean,
): SocialIntelV1 {
  if (!enabled) {
    return {
      contract_address: contractAddress,
      data_status: "disabled",
      narrative: "Unknown",
      sentiment_score: null,
      mention_count_24h: null,
      weighted_narrative_score: null,
      notes: "Social intelligence collection is disabled in V1 configuration.",
    };
  }

  if (!raw || (raw.mentions < 10)) {
    return {
      contract_address: contractAddress,
      data_status: "data_insufficient",
      narrative: "Unknown",
      sentiment_score: null,
      mention_count_24h: raw?.mentions ?? null,
      weighted_narrative_score: null,
      notes: "Insufficient social data sample (< 10 mentions).",
    };
  }

  return {
    contract_address: contractAddress,
    data_status: "ok",
    narrative: mapNarrative(raw.narrative),
    sentiment_score: clamp(raw.sentiment, -1, 1),
    mention_count_24h: raw.mentions,
    weighted_narrative_score: raw.sentiment * (raw.mentions / 100),
    notes: undefined,
  };
}

function mapNarrative(raw: string): SocialIntelV1["narrative"] {
  const mapping: Record<string, SocialIntelV1["narrative"]> = {
    defi: "DeFi",
    gaming: "Gaming",
    ai: "AI",
    meme: "Meme",
    infrastructure: "Infrastructure",
    rwa: "RWA",
    social: "Social",
  };
  return mapping[raw.toLowerCase()] ?? "Mixed";
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
