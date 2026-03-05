/**
 * DexScreener Response Mapper
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: adapters/dexscreener | Last Updated: 2026-03-05
 * 
 * Maps DexScreener API responses to canonical contracts:
 * - MarketSnapshot (for individual pairs)
 * - NormalizedTokenV1[] (for TokenUniverse)
 */
import type { NormalizedTokenV1 } from "../../core/contracts/tokenuniverse.js";
import type { MarketSnapshot } from "../../core/contracts/market.js";
import type { DexScreenerPairInfo, DexScreenerTokenResponse } from "./types.js";

/**
 * Map a single DexScreener pair to MarketSnapshot
 */
export function mapPairToMarketSnapshot(
  pair: DexScreenerPairInfo,
  traceId: string,
  timestamp: string,
  rawPayloadHash?: string
): MarketSnapshot {
  return {
    traceId,
    timestamp,
    source: "dexscreener",
    poolId: pair.pairAddress,
    baseToken: pair.baseToken.symbol,
    quoteToken: pair.quoteToken.symbol,
    priceUsd: parseFloat(pair.priceUsd) || 0,
    volume24h: pair.volume?.h24 || 0,
    liquidity: pair.liquidity?.usd || 0,
    rawPayloadHash,
  };
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
    const allLiquidity = pairs.reduce((sum, p) => sum + (p.liquidity?.usd || 0), 0);
    const allVolume = pairs.reduce((sum, p) => sum + (p.volume?.h24 || 0), 0);

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
        tags: [...new Set(pairs.map(p => p.dexId))], // Unique DEX IDs
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
