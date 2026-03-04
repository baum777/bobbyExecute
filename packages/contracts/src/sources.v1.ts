import { z } from "zod";

export const SOURCE_VALUES = ["dexscreener", "dexpaprika", "moralis", "rpc"] as const;
export const LIQUIDITY_REGIME_VALUES = ["structural", "healthy", "thin", "fragile", "unknown"] as const;
export const VOLATILITY_REGIME_VALUES = ["low", "medium", "high", "unknown"] as const;
export const NARRATIVE_TYPE_VALUES = ["momentum", "meme", "utility", "mixed", "unknown"] as const;
export const PROFILE_VALUES = ["risk_off", "balanced", "risk_on", "fragile_expansion"] as const;
export const DIVERGENCE_SIGNAL_VALUES = [
  "cross_source_price_delta",
  "volume_liquidity_mismatch",
  "structural_vs_narrative_gap",
  "confidence_drop",
] as const;
export const MARKET_STRUCTURE_VALUES = ["expanding", "stable", "contracting", "uncertain"] as const;
export const RUN_STATUS_VALUES = ["ok", "low_confidence", "failed"] as const;
export const RUN_MODE_VALUES = ["live", "dry"] as const;

export const SourceV1Schema = z.enum(SOURCE_VALUES);
export const LiquidityRegimeV1Schema = z.enum(LIQUIDITY_REGIME_VALUES);
export const VolatilityRegimeV1Schema = z.enum(VOLATILITY_REGIME_VALUES);
export const NarrativeTypeV1Schema = z.enum(NARRATIVE_TYPE_VALUES);
export const ProfileV1Schema = z.enum(PROFILE_VALUES);
export const DivergenceSignalV1Schema = z.enum(DIVERGENCE_SIGNAL_VALUES);
export const MarketStructureV1Schema = z.enum(MARKET_STRUCTURE_VALUES);
export const RunStatusV1Schema = z.enum(RUN_STATUS_VALUES);
export const RunModeV1Schema = z.enum(RUN_MODE_VALUES);

export const AdapterPairV1Schema = z.object({
  source: SourceV1Schema,
  pair_id: z.string(),
  contract_address: z.string().nullable(),
  base_symbol: z.string(),
  quote_symbol: z.string().default("USDC"),
  price_usd: z.number().nonnegative().nullable(),
  liquidity_usd: z.number().nonnegative().nullable(),
  volume_24h_usd: z.number().nonnegative().nullable(),
  txns_24h: z.number().int().nonnegative().nullable().optional(),
  fetched_at: z.string().datetime(),
  raw: z.record(z.unknown()).optional(),
});

export type SourceV1 = z.infer<typeof SourceV1Schema>;
export type LiquidityRegimeV1 = z.infer<typeof LiquidityRegimeV1Schema>;
export type VolatilityRegimeV1 = z.infer<typeof VolatilityRegimeV1Schema>;
export type NarrativeTypeV1 = z.infer<typeof NarrativeTypeV1Schema>;
export type ProfileV1 = z.infer<typeof ProfileV1Schema>;
export type DivergenceSignalV1 = z.infer<typeof DivergenceSignalV1Schema>;
export type MarketStructureV1 = z.infer<typeof MarketStructureV1Schema>;
export type RunStatusV1 = z.infer<typeof RunStatusV1Schema>;
export type RunModeV1 = z.infer<typeof RunModeV1Schema>;
export type AdapterPairV1 = z.infer<typeof AdapterPairV1Schema>;
