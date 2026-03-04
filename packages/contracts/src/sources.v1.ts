import { z } from "zod";

export const SourceEnum = z.enum(["dexscreener", "dexpaprika", "moralis", "rpc"]);
export type Source = z.infer<typeof SourceEnum>;

export const LiquidityRegimeEnum = z.enum(["Structural", "Healthy", "Thin", "Fragile"]);
export type LiquidityRegime = z.infer<typeof LiquidityRegimeEnum>;

export const VolatilityRegimeEnum = z.enum(["Low", "Medium", "High"]).nullable();
export type VolatilityRegime = z.infer<typeof VolatilityRegimeEnum>;

export const NarrativeTypeEnum = z.enum([
  "DeFi",
  "Gaming",
  "AI",
  "Meme",
  "Infrastructure",
  "RWA",
  "Social",
  "Mixed",
  "Unknown",
]);
export type NarrativeType = z.infer<typeof NarrativeTypeEnum>;

export const WeightProfileEnum = z.enum([
  "balanced",
  "structural_heavy",
  "social_heavy",
  "risk_averse",
]);
export type WeightProfile = z.infer<typeof WeightProfileEnum>;

export const DivergenceTypeEnum = z.enum([
  "price_divergence",
  "volume_divergence",
  "liquidity_divergence",
  "fdv_divergence",
]);
export type DivergenceType = z.infer<typeof DivergenceTypeEnum>;

export const MarketStructureEnum = z.enum([
  "Expanding",
  "Contracting",
  "Stable",
  "Fragile Expansion",
]);
export type MarketStructure = z.infer<typeof MarketStructureEnum>;

export const DataStatusEnum = z.enum([
  "ok",
  "disabled",
  "data_insufficient",
  "partial",
  "error",
]);
export type DataStatus = z.infer<typeof DataStatusEnum>;

export const RunModeEnum = z.enum(["live", "dry"]);
export type RunMode = z.infer<typeof RunModeEnum>;
