/**
 * Signal agent - generates trading signals from market data.
 * PROPOSED - simplified rule-based for golden tasks.
 */
import type { MarketSnapshot } from "../core/contracts/market.js";

export async function createSignalHandler(): Promise<
  (market: MarketSnapshot) => Promise<{ direction: string; confidence: number }>
> {
  return async (market) => {
    if (market.priceUsd > 0 && market.volume24h > 0) {
      return { direction: "hold", confidence: 0.5 };
    }
    return { direction: "hold", confidence: 0 };
  };
}
