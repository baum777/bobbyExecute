/**
 * DexScreener Adapter Tests
 * Mapper and client behavior with mock data; no live API calls.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  mapPairToMarketSnapshot,
  mapPairsToTokenUniverse,
  extractTrendingTokens,
} from "@bot/adapters/dexscreener/mapper.js";
import { DexScreenerClient } from "@bot/adapters/dexscreener/client.js";
import type { DexScreenerPairInfo, DexScreenerTokenResponse } from "@bot/adapters/dexscreener/types.js";

const mockPair: DexScreenerPairInfo = {
  chainId: "solana",
  dexId: "raydium",
  url: "https://dexscreener.com/solana/abc",
  pairAddress: "pair123",
  baseToken: { address: "mintA", name: "Token A", symbol: "TKA" },
  quoteToken: { address: "mintB", name: "Token B", symbol: "USDC" },
  priceNative: "1.5",
  priceUsd: "0.15",
  txns: { m5: { buys: 1, sells: 0 }, h1: { buys: 2, sells: 1 }, h6: { buys: 5, sells: 3 }, h24: { buys: 10, sells: 8 } },
  volume: { m5: 100, h1: 500, h6: 2000, h24: 10000 },
  priceChange: { m5: 0, h1: 1, h6: 2, h24: 5 },
  liquidity: { usd: 50000, base: 0, quote: 0 },
};

const mockResponse: DexScreenerTokenResponse = {
  schemaVersion: "1.0",
  pairs: [
    { ...mockPair, volume: { ...mockPair.volume, h24: 20000 }, liquidity: { usd: 100000, base: 0, quote: 0 } },
    { ...mockPair, pairAddress: "pair456", baseToken: { ...mockPair.baseToken, address: "mintA" } },
  ],
};

describe("DexScreener Mapper", () => {
  const traceId = "trace-1";
  const timestamp = "2026-03-05T12:00:00.000Z";

  describe("mapPairToMarketSnapshot", () => {
    it("maps a pair to MarketSnapshot shape with source dexscreener", () => {
      const out = mapPairToMarketSnapshot(mockPair, traceId, timestamp, "hash123");
      expect(out.traceId).toBe(traceId);
      expect(out.timestamp).toBe(timestamp);
      expect(out.source).toBe("dexscreener");
      expect(out.poolId).toBe("pair123");
      expect(out.baseToken).toBe("TKA");
      expect(out.quoteToken).toBe("USDC");
      expect(out.priceUsd).toBe(0.15);
      expect(out.volume24h).toBe(10000);
      expect(out.liquidity).toBe(50000);
      expect(out.rawPayloadHash).toBe("hash123");
    });

    it("handles missing liquidity and volume", () => {
      const pairNoLiq = { ...mockPair, liquidity: undefined, volume: { m5: 0, h1: 0, h6: 0, h24: 0 } };
      const out = mapPairToMarketSnapshot(pairNoLiq, traceId, timestamp);
      expect(out.volume24h).toBe(0);
      expect(out.liquidity).toBe(0);
      expect(out.rawPayloadHash).toBeUndefined();
    });

    it("parses priceUsd string to number", () => {
      const out = mapPairToMarketSnapshot(mockPair, traceId, timestamp);
      expect(out.priceUsd).toBe(0.15);
    });
  });

  describe("mapPairsToTokenUniverse", () => {
    it("returns empty array for null/empty pairs", () => {
      expect(mapPairsToTokenUniverse({ schemaVersion: "1.0", pairs: null }, "solana", traceId, timestamp)).toEqual([]);
      expect(mapPairsToTokenUniverse({ schemaVersion: "1.0", pairs: [] }, "solana", traceId, timestamp)).toEqual([]);
    });

    it("groups pairs by base token and produces NormalizedTokenV1 entries", () => {
      const tokens = mapPairsToTokenUniverse(mockResponse, "solana", traceId, timestamp, "payloadHash");
      expect(tokens.length).toBe(1);
      const t = tokens[0];
      expect(t.schema_version).toBe("normalized_token.v1");
      expect(t.canonical_id).toBe("dexscreener:solana:mintA");
      expect(t.symbol).toBe("TKA");
      expect(t.mint).toBe("mintA");
      expect(t.chain).toBe("solana");
      expect(t.sources).toEqual(["dexscreener"]);
      expect(t.confidence_score).toBeGreaterThanOrEqual(0.5);
      expect(t.confidence_score).toBeLessThanOrEqual(1);
      expect(t.mappings.dexscreener).toEqual({ tokenId: "mintA", pairId: "pair123" });
      expect(t.metadata?.tags).toContain("raydium");
    });

    it("uses correct chain in canonical_id", () => {
      const tokens = mapPairsToTokenUniverse(mockResponse, "ethereum", traceId, timestamp);
      expect(tokens[0].canonical_id).toBe("dexscreener:ethereum:mintA");
    });
  });

  describe("extractTrendingTokens", () => {
    it("returns empty array for null/empty pairs", () => {
      expect(extractTrendingTokens({ schemaVersion: "1.0", pairs: null })).toEqual([]);
      expect(extractTrendingTokens({ schemaVersion: "1.0", pairs: [] })).toEqual([]);
    });

    it("aggregates by token and sorts by volume24h descending", () => {
      const trending = extractTrendingTokens(mockResponse, 10);
      expect(trending.length).toBe(1);
      expect(trending[0].symbol).toBe("TKA");
      expect(trending[0].address).toBe("mintA");
      expect(trending[0].volume24h).toBe(20000 + 10000);
      expect(trending[0].liquidity).toBeGreaterThan(0);
    });

    it("respects limit parameter", () => {
      const manyPairs = Array.from({ length: 30 }, (_, i) => ({
        ...mockPair,
        baseToken: { ...mockPair.baseToken, address: `mint${i}`, symbol: `TK${i}` },
      }));
      const response: DexScreenerTokenResponse = { schemaVersion: "1.0", pairs: manyPairs };
      const trending = extractTrendingTokens(response, 5);
      expect(trending).toHaveLength(5);
    });
  });
});

describe("DexScreener Client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getTokenPairs builds correct URL and returns JSON", async () => {
    const mockJson = [];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockJson),
    });
    const client = new DexScreenerClient();
    const result = await client.getTokenPairs("mint123");
    expect(result).toEqual({ schemaVersion: "1.0", pairs: [] });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.dexscreener.com/token-pairs/v1/solana/mint123",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("getTokenPairs throws on non-ok response", async () => {
    const fivexx = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: { get: () => null },
    } as unknown as Response;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fivexx);
    const client = new DexScreenerClient({ resilience: { maxRetries: 0 } });
    await expect(client.getTokenPairs("mint")).rejects.toThrow("DexScreener error: 500");
  });

  it("getTokenPairsWithHash returns raw and rawPayloadHash", async () => {
    const mockJson = [mockPair];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockJson),
    });
    const client = new DexScreenerClient();
    const { raw, rawPayloadHash } = await client.getTokenPairsWithHash("mintA");
    expect(raw).toEqual({ schemaVersion: "1.0", pairs: [mockPair] });
    expect(rawPayloadHash).toBeDefined();
    expect(typeof rawPayloadHash).toBe("string");
    expect(rawPayloadHash.length).toBe(64);
  });

  it("uses custom baseUrl when provided", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ schemaVersion: "1.0", pairs: null }) });
    const client = new DexScreenerClient({ baseUrl: "https://custom.api/v1" });
    await client.getTokenPairs("mint");
    expect(fetch).toHaveBeenCalledWith(
      "https://custom.api/v1/token-pairs/v1/solana/mint",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});
