/**
 * M5: Token Universe Builder - MAX/MIN limits, trending/volume split.
 * @deprecated migration target: deterministic pre-authority `intelligence/universe` lineage.
 * Zero-authority residue only. Compatibility-only legacy bridge; not part of the
 * canonical BobbyExecute v2 authority path.
 * Legacy non-surviving lineage; not canonical future path.
 */
import type { NormalizedTokenV1, TokenUniverseV1 } from "../contracts/tokenuniverse.js";

export type UniverseMode = "reduced" | "full";

const REDUCED_LIMITS = { max: 30, min: 20 };
const FULL_LIMITS = { max: 100, min: 30 };

export interface UniverseBuilderConfig {
  mode: UniverseMode;
}

export interface RawTokenInput {
  token: NormalizedTokenV1;
  volume24h?: number;
  liquidity?: number;
}

/**
 * Build TokenUniverseV1 from raw tokens with MIN/MAX enforcement.
 * Reduced: MAX=30 MIN=20, Full: MAX=100 MIN=30.
 * Trending/volume split 50/50.
 * @deprecated migration target: `intelligence/universe/build-universe-result.ts`.
 * Transitional zero-authority compatibility surface only; do not add new callers.
 */
export function buildTokenUniverse(
  rawTokens: RawTokenInput[],
  config: UniverseBuilderConfig,
  timestamp: string
): TokenUniverseV1 {
  const limits = config.mode === "reduced" ? REDUCED_LIMITS : FULL_LIMITS;

  const sorted = [...rawTokens].sort((a, b) => {
    const volA = a.volume24h ?? 0;
    const volB = b.volume24h ?? 0;
    const liqA = a.liquidity ?? 0;
    const liqB = b.liquidity ?? 0;
    const scoreA = volA * 0.5 + liqA * 0.5;
    const scoreB = volB * 0.5 + liqB * 0.5;
    return scoreB - scoreA;
  });

  let selected = sorted.slice(0, limits.max);
  if (selected.length < limits.min && rawTokens.length >= limits.min) {
    selected = sorted.slice(0, limits.min);
  } else if (selected.length < limits.min) {
    selected = sorted;
  }

  const tokens = selected.map((r) => r.token);
  const bySource: Record<string, number> = {};
  let avgConfidence = 0;

  for (const t of tokens) {
    for (const s of t.sources) {
      bySource[s] = (bySource[s] ?? 0) + 1;
    }
    avgConfidence += t.confidence_score;
  }
  avgConfidence = tokens.length > 0 ? avgConfidence / tokens.length : 0;

  return {
    schema_version: "token_universe.v1",
    timestamp,
    mode: config.mode,
    tokens,
    stats: {
      total_count: tokens.length,
      by_source: bySource,
      avg_confidence: avgConfidence,
    },
  };
}
