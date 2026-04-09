import { describe, expect, it } from "vitest";
import { createIngestHandler } from "@bot/agents/ingest.agent.js";

const canonicalTokenAddress = "So11111111111111111111111111111111111111112";
const quoteTokenAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function makeDexScreenerPair() {
  return {
    chainId: "solana",
    dexId: "orca",
    url: "https://dexscreener.com/solana/pool1",
    pairAddress: "pool1",
    baseToken: { address: canonicalTokenAddress, name: "Wrapped SOL", symbol: "SOL" },
    quoteToken: { address: quoteTokenAddress, name: "USD Coin", symbol: "USDC" },
    priceNative: "1.0",
    priceUsd: "82.5",
    txns: { m5: { buys: 1, sells: 0 }, h1: { buys: 1, sells: 0 }, h6: { buys: 1, sells: 0 }, h24: { buys: 1, sells: 0 } },
    volume: { m5: 1, h1: 2, h6: 3, h24: 4 },
    priceChange: { m5: 0, h1: 0, h6: 0, h24: 0 },
    liquidity: { usd: 1000, base: 0, quote: 0 },
  };
}

function makeDexPaprikaPool() {
  return {
    id: "pool1",
    dex_id: "orca",
    dex_name: "Orca",
    chain: "solana",
    volume_usd: 1234.56,
    price_usd: 82.5,
    created_at: "2026-04-09T00:00:00Z",
    tokens: [
      { id: canonicalTokenAddress, name: "Wrapped SOL", symbol: "SOL", chain: "solana" },
      { id: quoteTokenAddress, name: "USD Coin", symbol: "USDC", chain: "solana" },
    ],
  };
}

describe("createIngestHandler", () => {
  it("resolves a canonical DexPaprika pool from the live pools payload shape", async () => {
    const discovery = {
      searchWithHash: async () => ({
        raw: { schemaVersion: "1.0", pairs: [makeDexScreenerPair()] },
        rawPayloadHash: "search-hash",
      }),
      getTokenPairsV1WithHash: async () => ({
        raw: { schemaVersion: "1.0", pairs: [makeDexScreenerPair()] },
        rawPayloadHash: "token-pairs-hash",
      }),
    } as const;

    const marketData = {
      getTokenWithHash: async () => ({
        raw: {
          id: canonicalTokenAddress,
          name: "Wrapped SOL",
          symbol: "SOL",
          chain: "solana",
          decimals: 9,
          summary: {
            price_usd: 82.5,
            "24h": { volume_usd: 1234.56 },
            liquidity_usd: 9876.54,
          },
          last_updated: "2026-04-09T00:00:00Z",
        },
        rawPayloadHash: "token-hash",
      }),
      getTokenPoolsWithHash: async () => ({
        raw: {
          pools: [makeDexPaprikaPool()],
          page_info: { next_page: null },
        },
        rawPayloadHash: "pools-hash",
      }),
      getPoolWithHash: async () => ({
        raw: {
          id: "pool1",
          token_reserves: [
            { token_id: canonicalTokenAddress, reserve_usd: 12_345.67 },
            { token_id: quoteTokenAddress, reserve_usd: 98_765.43 },
          ],
        },
        rawPayloadHash: "pool-detail-hash",
      }),
      getPoolOhlcvWithHash: async () => {
        throw new Error("not expected");
      },
      getPoolTransactionsWithHash: async () => {
        throw new Error("not expected");
      },
    } as const;

    const handler = await createIngestHandler({
      discovery,
      marketData,
      rpcClient: {
        getBalance: async () => ({ balance: "1000000000", decimals: 9 }),
      },
      walletAddress: "11111111111111111111111111111111",
      clock: { now: () => new Date("2026-04-09T00:00:00.000Z") },
    });

    const result = await handler();

    expect(result.market.poolId).toBe("pool1");
    expect(result.market.baseToken).toBe("SOL");
    expect(result.market.quoteToken).toBe("USDC");
    expect(result.market.priceUsd).toBe(82.5);
    expect(result.wallet.balances[0]?.mint).toBe(canonicalTokenAddress);
  });
});
