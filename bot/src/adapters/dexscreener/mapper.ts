/**
 * DexScreener response mappers.
 *
 * Legacy helpers remain for existing MarketSnapshot consumers.
 * New helpers normalize discovery output into provider-agnostic contracts
 * without promoting raw API payloads to canonical truth.
 */
import type { NormalizedTokenV1 } from "../../core/contracts/normalized-token.js";
import type {
  CandidatePairSearchResultV1,
  NormalizedPairCandidateV1,
} from "../../core/contracts/provider-market-data.js";
import type { MarketSnapshot } from "../../core/contracts/market.js";
import type { DexScreenerPairInfo, DexScreenerTokenResponse } from "./types.js";

export function mapPairToMarketSnapshot(
  pair: DexScreenerPairInfo,
  traceId: string,
  timestamp: string,
  rawPayloadHash?: string
): MarketSnapshot {
  return {
    schema_version: "market.v1",
    traceId,
    timestamp,
    source: "dexscreener",
    poolId: pair.pairAddress,
    baseToken: pair.baseToken.symbol,
    quoteToken: pair.quoteToken.symbol,
    priceUsd: parseFloat(pair.priceUsd) || 0,
    volume24h: pair.volume?.h24 || 0,
    liquidity: pair.liquidity?.usd || 0,
    freshnessMs: 0,
    rawPayloadHash,
  };
}

export function mapPairToNormalizedPairCandidate(
  pair: DexScreenerPairInfo,
  tokenId: string,
  observedAt: string,
  rawPayloadHash?: string
): NormalizedPairCandidateV1 {
  const priceUsd = parseFloat(pair.priceUsd);
  const liquidityUsd = pair.liquidity?.usd;
  const volume24hUsd = pair.volume?.h24;
  const hasPrice = Number.isFinite(priceUsd) && priceUsd > 0;
  const hasLiquidity = typeof liquidityUsd === "number" && Number.isFinite(liquidityUsd) && liquidityUsd >= 0;
  const hasVolume = typeof volume24hUsd === "number" && Number.isFinite(volume24hUsd) && volume24hUsd >= 0;

  return {
    schema_version: "normalized_pair_candidate.v1",
    provider: "dexscreener",
    kind: "discovery",
    chain: "solana",
    tokenId,
    pairId: pair.pairAddress,
    dexId: pair.dexId,
    baseTokenAddress: pair.baseToken.address,
    baseTokenSymbol: pair.baseToken.symbol,
    quoteTokenAddress: pair.quoteToken.address,
    quoteTokenSymbol: pair.quoteToken.symbol,
    ...(hasPrice ? { priceUsd } : {}),
    ...(hasLiquidity ? { liquidityUsd } : {}),
    ...(hasVolume ? { volume24hUsd } : {}),
    freshnessMs: 0,
    observedAt,
    ...(rawPayloadHash ? { rawPayloadHash } : {}),
    status: hasPrice && hasLiquidity ? "ok" : "partial",
    metadata: {
      url: pair.url,
      chainId: pair.chainId,
      pairCreatedAt: pair.pairCreatedAt,
      priceNative: pair.priceNative,
    },
  };
}

export function mapTokenPairsToCandidatePairSearchResult(
  response: DexScreenerTokenResponse,
  query: string,
  tokenId: string,
  fetchedAt: string,
  rawPayloadHash?: string
): CandidatePairSearchResultV1 {
  const candidates = (response.pairs ?? []).map((pair) =>
    mapPairToNormalizedPairCandidate(pair, tokenId, fetchedAt, rawPayloadHash)
  );
  const selected = selectCanonicalPairCandidate(candidates, tokenId);

  return {
    schema_version: "candidate_pair_search_result.v1",
    provider: "dexscreener",
    kind: "discovery",
    query,
    chain: "solana",
    tokenId,
    observedAt: fetchedAt,
    fetchedAt,
    ...(selected ? { selectedPairId: selected.pairId, canonicalTokenId: selected.baseTokenAddress } : {}),
    candidates,
    ...(rawPayloadHash ? { rawPayloadHash } : {}),
    status: candidates.length > 0 ? "ok" : "partial",
  };
}

export function selectCanonicalPairCandidate(
  candidates: readonly NormalizedPairCandidateV1[],
  tokenId: string
): NormalizedPairCandidateV1 | undefined {
  const ranked = candidates
    .filter((candidate) => candidate.chain === "solana")
    .filter((candidate) => candidate.baseTokenAddress === tokenId)
    .sort((left, right) => {
      const leftLiquidity = left.liquidityUsd ?? 0;
      const rightLiquidity = right.liquidityUsd ?? 0;
      if (rightLiquidity !== leftLiquidity) {
        return rightLiquidity - leftLiquidity;
      }

      const leftVolume = left.volume24hUsd ?? 0;
      const rightVolume = right.volume24hUsd ?? 0;
      if (rightVolume !== leftVolume) {
        return rightVolume - leftVolume;
      }

      return (right.priceUsd ?? 0) - (left.priceUsd ?? 0);
    });

  return ranked[0];
}

/**
 * Map DexScreener response to array of NormalizedTokenV1
 *
 * Groups pairs by base token and creates canonical token entries.
 * Used for TokenUniverse building.
 */
export function mapPairsToTokenUniverse(
  response: DexScreenerTokenResponse,
  chain: "solana" | "ethereum" | "base" = "solana",
  traceId: string,
  timestamp: string,
  rawPayloadHash?: string
): NormalizedTokenV1[] {
  if (!response.pairs || response.pairs.length === 0) {
    return [];
  }

  // Group pairs by base token address
  const byToken = new Map<string, DexScreenerPairInfo[]>();
  for (const pair of response.pairs) {
    const key = pair.baseToken.address;
    if (!byToken.has(key)) {
      byToken.set(key, []);
    }
    byToken.get(key)!.push(pair);
  }

  return Array.from(byToken.entries()).map(([address, pairs]) => {
    const primaryPair = pairs[0];
    void traceId;
    void rawPayloadHash;

    return {
      schema_version: "normalized_token.v1",
      canonical_id: `dexscreener:${chain}:${address}`,
      symbol: primaryPair.baseToken.symbol,
      mint: address,
      chain,
      sources: ["dexscreener"],
      confidence_score: calculateConfidence(pairs),
      mappings: {
        dexscreener: {
          tokenId: address,
          pairId: primaryPair.pairAddress,
        },
      },
      metadata: {
        name: primaryPair.baseToken.name,
        decimals: undefined, // Not provided by DexScreener API
        logoUrl: undefined,
        tags: [...new Set(pairs.map((p) => p.dexId))], // Unique DEX IDs
      },
      discovered_at: timestamp,
      last_updated: timestamp,
    };
  });
}

/**
 * Calculate confidence score based on available data
 *
 * Factors:
 * - Number of pairs (more = better, up to 5)
 * - Total liquidity (higher = better, up to $1M)
 * - 24h volume (higher = better)
 */
function calculateConfidence(pairs: DexScreenerPairInfo[]): number {
  if (pairs.length === 0) return 0;

  const totalLiquidity = pairs.reduce((sum, p) => sum + (p.liquidity?.usd || 0), 0);
  const totalVolume = pairs.reduce((sum, p) => sum + (p.volume?.h24 || 0), 0);

  // Liquidity score: logarithmic scale, capped at $1M
  const liquidityScore = totalLiquidity > 0
    ? Math.min(1, Math.log10(totalLiquidity) / 6) // log10(1M) = 6
    : 0;

  // Pair count score: more pairs = higher confidence (up to 5)
  const pairCountScore = Math.min(1, pairs.length / 5);

  // Volume score: logarithmic scale, capped at $100K
  const volumeScore = totalVolume > 0
    ? Math.min(1, Math.log10(totalVolume) / 5) // log10(100K) = 5
    : 0;

  // Weighted combination
  // 50% liquidity, 30% pair count, 20% volume
  const rawScore = (liquidityScore * 0.5) + (pairCountScore * 0.3) + (volumeScore * 0.2);

  // Scale to 0.5-1.0 range (minimum 0.5 for any valid data)
  return 0.5 + (rawScore * 0.5);
}

/**
 * Extract trending tokens from DexScreener response
 *
 * Sorts by volume and returns top N tokens
 */
export function extractTrendingTokens(
  response: DexScreenerTokenResponse,
  limit: number = 20
): Array<{ symbol: string; address: string; volume24h: number; liquidity: number }> {
  if (!response.pairs || response.pairs.length === 0) {
    return [];
  }

  // Group by token and aggregate metrics
  const byToken = new Map<string, { symbol: string; address: string; volume24h: number; liquidity: number }>();

  for (const pair of response.pairs) {
    const addr = pair.baseToken.address;
    const existing = byToken.get(addr);

    if (existing) {
      existing.volume24h += pair.volume?.h24 || 0;
      existing.liquidity += pair.liquidity?.usd || 0;
    } else {
      byToken.set(addr, {
        symbol: pair.baseToken.symbol,
        address: addr,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
      });
    }
  }

  // Sort by volume and return top N
  return Array.from(byToken.values())
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, limit);
}
