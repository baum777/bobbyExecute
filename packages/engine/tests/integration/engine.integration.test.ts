import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { DexPaprikaAdapterImpl, DexScreenerAdapterImpl, HttpClient } from "@reducedmode/adapters";
import { InMemoryRunStore, ReducedModeEngine } from "../../src/index.js";

describe("ReducedMode V1 Integration (HTTP mocked)", () => {
  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it("excludes tokens with missing contract address", async () => {
    nock.disableNetConnect();
    mockDexScreener({
      pairs: [
        makeDexScreenerPair("PAIR-1", null, "MISS"),
        makeDexScreenerPair("PAIR-2", "ValidAddressAAAA1111111111111111111111", "VALA"),
      ],
    });
    mockDexPaprika({
      trending: [makeDexPaprikaRow("DP-1", "ValidAddressBBBB2222222222222222222222", "VALB")],
      topVolume: [makeDexPaprikaRow("DP-2", "ValidAddressCCCC3333333333333333333333", "VALC")],
    });

    const engine = buildEngine({
      MIN_UNIQUE_TOKENS: 2,
      MAX_UNIQUE_TOKENS: 5,
      MAX_RECOVERY_ATTEMPTS: 1,
      UNIVERSE_SOURCE_TARGET: 2,
      PRE_DEDUPE_POOL_TARGET: 6,
    });
    const run = await engine.run({ mode: "dry", maxTokens: 5 });

    expect(run.tokens.every((token) => token.token.contract_address.trim().length > 0)).toBe(true);
    expect(run.tokens.some((token) => token.token.symbol === "MISS")).toBe(false);
  });

  it("recovers when one source is down and falls back to cache", async () => {
    nock.disableNetConnect();
    nock("https://api.dexscreener.com").get("/latest/dex/search").query(true).reply(500, {});
    nock("https://api.dexscreener.com").get("/token-profiles/latest/v1").query(true).reply(500, {});
    mockDexPaprika({
      trending: [
        makeDexPaprikaRow("DP-1", "ONLYDP1", "DP1"),
        makeDexPaprikaRow("DP-2", "ONLYDP2", "DP2"),
      ],
      topVolume: [
        makeDexPaprikaRow("DP-3", "ONLYDP3", "DP3"),
        makeDexPaprikaRow("DP-4", "ONLYDP4", "DP4"),
      ],
    });

    const engine = buildEngine({
      MIN_UNIQUE_TOKENS: 3,
      MAX_UNIQUE_TOKENS: 6,
      MAX_RECOVERY_ATTEMPTS: 2,
      UNIVERSE_SOURCE_TARGET: 3,
      PRE_DEDUPE_POOL_TARGET: 10,
    });
    const run = await engine.run({ mode: "dry", maxTokens: 6 });

    expect(run.tokens.length).toBeGreaterThanOrEqual(3);
    expect(run.sections.A_universe.source_balance.dexscreener ?? 0).toBeGreaterThan(0);
  });

  it("returns low confidence artifact when completeness is below threshold", async () => {
    nock.disableNetConnect();
    mockDexScreener({
      pairs: [
        makeDexScreenerPair("PAIR-1", "LowAddressAAAA11111111111111111111111", "LA", true),
        makeDexScreenerPair("PAIR-2", "LowAddressBBBB22222222222222222222222", "LB", true),
      ],
    });
    mockDexPaprika({
      trending: [
        makeDexPaprikaRow("DP-1", "LowAddressAAAA11111111111111111111111", "LA", true),
        makeDexPaprikaRow("DP-2", "LowAddressBBBB22222222222222222222222", "LB", true),
      ],
      topVolume: [makeDexPaprikaRow("DP-3", "LowAddressCCCC33333333333333333333333", "LC", true)],
    });

    const engine = buildEngine({
      MIN_UNIQUE_TOKENS: 2,
      MAX_UNIQUE_TOKENS: 5,
      MIN_DATA_COMPLETENESS: 95,
      MAX_RECOVERY_ATTEMPTS: 1,
      UNIVERSE_SOURCE_TARGET: 2,
      PRE_DEDUPE_POOL_TARGET: 6,
    });
    const run = await engine.run({ mode: "dry", maxTokens: 5 });

    expect(run.status).toBe("low_confidence");
    expect(run.top_structural).toHaveLength(0);
    expect(run.top_fragile).toHaveLength(0);
  });
});

function buildEngine(overrides: Partial<import("../../src/config.js").ReducedModeConfig>) {
  const httpClient = new HttpClient({
    retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, jitterMs: 0 },
    defaultTimeoutMs: 1000,
  });
  return new ReducedModeEngine({
    config: overrides,
    store: new InMemoryRunStore(),
    dexscreener: new DexScreenerAdapterImpl(httpClient),
    dexpaprika: new DexPaprikaAdapterImpl(httpClient),
  });
}

function mockDexScreener(input: {
  pairs: Array<Record<string, unknown>>;
}): void {
  nock("https://api.dexscreener.com")
    .get("/latest/dex/search")
    .query(true)
    .reply(200, { pairs: input.pairs });
}

function mockDexPaprika(input: {
  trending: Array<Record<string, unknown>>;
  topVolume: Array<Record<string, unknown>>;
}): void {
  nock("https://api.dexpaprika.com")
    .get("/v1/solana/trending")
    .query(true)
    .reply(200, { data: input.trending });
  nock("https://api.dexpaprika.com")
    .get("/v1/solana/top-volume")
    .query(true)
    .reply(200, { data: input.topVolume });
}

function makeDexScreenerPair(
  pairAddress: string,
  contractAddress: string | null,
  symbol: string,
  lowCompleteness = false,
): Record<string, unknown> {
  return {
    pairAddress,
    baseToken: {
      address: contractAddress,
      symbol,
    },
    quoteToken: { symbol: "USDC" },
    priceUsd: lowCompleteness ? null : 1.2,
    liquidity: { usd: lowCompleteness ? null : 50_000 },
    volume: { h24: lowCompleteness ? null : 30_000 },
    txns: { h24: { buys: 10, sells: 11 } },
  };
}

function makeDexPaprikaRow(
  pairId: string,
  contractAddress: string,
  symbol: string,
  lowCompleteness = false,
): Record<string, unknown> {
  return {
    pairId,
    contractAddress,
    symbol,
    quoteSymbol: "USDC",
    priceUsd: lowCompleteness ? null : 1.1,
    liquidityUsd: lowCompleteness ? null : 40_000,
    volume24hUsd: lowCompleteness ? null : 20_000,
    txns24h: 15,
  };
}
