/**
 * Map DexPaprika responses to MarketSnapshot.
 * PROPOSED - normalizes DEX data.
 */
import type { MarketSnapshot } from "../../core/contracts/market.js";
import type { DexPaprikaTokenResponse } from "./types.js";

export function mapTokenToMarketSnapshot(
  raw: DexPaprikaTokenResponse,
  traceId: string,
  timestamp: string,
  rawPayloadHash?: string
): MarketSnapshot {
  const priceUsd = raw.summary?.price_usd ?? 0;
  const volume24h = raw.summary?.["24h"]?.volume_usd ?? raw.summary?.["24h"]?.volume ?? 0;

  return {
    schema_version: "market.v1",
    traceId,
    timestamp,
    source: "dexpaprika",
    poolId: raw.id,
    baseToken: raw.symbol,
    quoteToken: "USD",
    priceUsd,
    volume24h: Number(volume24h),
    liquidity: (raw.summary as { liquidity_usd?: number })?.liquidity_usd ?? 0,
    freshnessMs: 0,
    rawPayloadHash,
  };
}
