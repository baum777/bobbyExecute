/**
 * Token Universe Contracts - Normalized token identity across multiple sources
 * @deprecated migration target: `intelligence/universe/contracts/universe-build-result.ts`.
 * Legacy non-surviving lineage; not canonical future path.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: core/contracts | Last Updated: 2026-03-05
 */
import { z } from "zod";

export const SourceMappingV1Schema = z.object({
  paprika: z.object({ tokenId: z.string(), poolId: z.string().optional() }).optional(),
  dexscreener: z.object({ tokenId: z.string(), pairId: z.string().optional() }).optional(),
  moralis: z.object({ tokenAddress: z.string() }).optional(),
});

export const NormalizedTokenV1Schema = z.object({
  schema_version: z.literal("normalized_token.v1"),
  canonical_id: z.string(),
  symbol: z.string(),
  mint: z.string(),
  chain: z.enum(["solana", "ethereum", "base"]),
  sources: z.array(z.enum(["paprika", "dexscreener", "moralis"])),
  confidence_score: z.number().min(0).max(1),
  mappings: SourceMappingV1Schema,
  metadata: z.object({
    name: z.string().optional(),
    decimals: z.number().optional(),
    logoUrl: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
  discovered_at: z.string().datetime(),
  last_updated: z.string().datetime(),
});

export const TokenUniverseV1Schema = z.object({
  schema_version: z.literal("token_universe.v1"),
  timestamp: z.string().datetime(),
  mode: z.enum(["reduced", "full"]),
  tokens: z.array(NormalizedTokenV1Schema),
  stats: z.object({
    total_count: z.number(),
    by_source: z.record(z.number()),
    avg_confidence: z.number(),
  }),
});

export type SourceMappingV1 = z.infer<typeof SourceMappingV1Schema>;
export type NormalizedTokenV1 = z.infer<typeof NormalizedTokenV1Schema>;
export type TokenUniverseV1 = z.infer<typeof TokenUniverseV1Schema>;

/**
 * Generate canonical ID from chain and mint address (both lowercased)
 */
export function generateCanonicalId(chain: string, mint: string): string {
  return `${chain.toLowerCase()}:${mint.toLowerCase()}`;
}

/**
 * Calculate confidence score based on source count and quality
 */
export function calculateTokenConfidence(
  sources: string[],
  sourceQualities: Record<string, number>
): number {
  if (!Array.isArray(sources) || sources.length === 0) return 0;
  
  // More sources = higher confidence (up to 3)
  const sourceCountScore = Math.min(1, sources.length / 3);
  
  // Average source quality
  const avgQuality = sources.reduce((sum, s) => sum + (sourceQualities[s] || 0.5), 0) / sources.length;
  
  // Weight: 40% source count, 60% quality
  return sourceCountScore * 0.4 + avgQuality * 0.6;
}
