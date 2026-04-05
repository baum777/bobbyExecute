/**
 * M5: Token Universe Builder tests.
 */
import { describe, expect, it } from "vitest";
import { buildTokenUniverse } from "@bot/core/universe/token-universe-builder.js";
import type { NormalizedTokenV1 } from "@bot/core/contracts/normalized-token.js";

const now = new Date().toISOString();

function makeToken(i: number, vol = 0, liq = 0): NormalizedTokenV1 {
  return {
    schema_version: "normalized_token.v1",
    canonical_id: `test:solana:mint${i}`,
    symbol: `TK${i}`,
    mint: `mint${i}`,
    chain: "solana",
    sources: ["dexscreener"],
    confidence_score: 0.8,
    mappings: { dexscreener: { tokenId: `mint${i}` } },
    metadata: {},
    discovered_at: now,
    last_updated: now,
  };
}

describe("buildTokenUniverse", () => {
  it("enforces ReducedMode MAX=30", () => {
    const raw = Array.from({ length: 50 }, (_, i) => ({
      token: makeToken(i),
      volume24h: 1000 - i,
      liquidity: 5000,
    }));
    const universe = buildTokenUniverse(raw, { mode: "reduced" }, now);
    expect(universe.tokens.length).toBe(30);
    expect(universe.mode).toBe("reduced");
  });

  it("enforces ReducedMode MIN when enough input", () => {
    const raw = Array.from({ length: 25 }, (_, i) => ({
      token: makeToken(i),
      volume24h: 1000 - i,
      liquidity: 5000,
    }));
    const universe = buildTokenUniverse(raw, { mode: "reduced" }, now);
    expect(universe.tokens.length).toBe(25);
  });

  it("FullMode allows up to 100", () => {
    const raw = Array.from({ length: 150 }, (_, i) => ({
      token: makeToken(i),
      volume24h: 1000 - i,
      liquidity: 5000,
    }));
    const universe = buildTokenUniverse(raw, { mode: "full" }, now);
    expect(universe.tokens.length).toBe(100);
  });
});
