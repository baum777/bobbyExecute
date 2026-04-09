/**
 * PR-C1: canonical decision.envelope.v3 provenance + deterministic data-quality blocks.
 */
import { describe, expect, it } from "vitest";
import { Engine } from "../../src/core/engine.js";
import { FakeClock } from "../../src/core/clock.js";
import { InMemoryJournalWriter } from "../../src/journal-writer/writer.js";
import type { MarketSnapshot } from "../../src/core/contracts/market.js";
import type { WalletSnapshot } from "../../src/core/contracts/wallet.js";

function baseMarket(clock: FakeClock, overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    schema_version: "market.v1",
    traceId: "prov-market",
    timestamp: clock.now().toISOString(),
    source: "dexpaprika",
    poolId: "pool-x",
    baseToken: "SOL",
    quoteToken: "USDC",
    priceUsd: 100,
    volume24h: 1e6,
    liquidity: 1e6,
    freshnessMs: 0,
    status: "ok",
    ...overrides,
  };
}

function baseWallet(clock: FakeClock, overrides: Partial<WalletSnapshot> = {}): WalletSnapshot {
  return {
    traceId: "prov-wallet",
    timestamp: clock.now().toISOString(),
    source: "rpc",
    walletAddress: "11111111111111111111111111111111",
    balances: [],
    totalUsd: 1,
    ...overrides,
  };
}

describe("decision provenance (PR-C1)", () => {
  it("successful path emits v3 with full provenance fields", async () => {
    const clock = new FakeClock("2026-03-31T12:00:00.000Z");
    const market = baseMarket(clock);
    const wallet = baseWallet(clock);
    const engine = new Engine({
      clock,
      dryRun: true,
      executionMode: "dry",
      journalWriter: new InMemoryJournalWriter(),
      journalPolicy: "mandatory",
    });

    const state = await engine.run(
      async () => ({ market, wallet }),
      async () => ({
        direction: "buy",
        confidence: 0.9,
        intent: {
          traceId: "x",
          timestamp: clock.now().toISOString(),
          idempotencyKey: "k1",
          tokenIn: "SOL",
          tokenOut: "USDC",
          amountIn: "1",
          minAmountOut: "95",
          slippagePercent: 1,
          dryRun: true,
          executionMode: "dry",
        },
      }),
      async () => ({ allowed: true }),
      async (intent) => ({
        traceId: intent.traceId,
        timestamp: intent.timestamp,
        tradeIntentId: intent.idempotencyKey,
        success: true,
        dryRun: true,
        executionMode: "dry",
        actualAmountOut: intent.minAmountOut,
      }),
      async (intent) => ({
        traceId: intent.traceId,
        timestamp: intent.timestamp,
        passed: true,
        checks: {},
        verificationMode: "rpc",
      })
    );

    const env = state.decisionEnvelope;
    expect(env?.schemaVersion).toBe("decision.envelope.v3");
    expect(env?.reasonClass).toBe("SUCCESS");
    expect(env?.sources?.length).toBeGreaterThan(0);
    expect(env?.freshness.marketAgeMs).toBe(0);
    expect(env?.freshness.walletAgeMs).toBe(0);
    expect(env?.evidenceRef.marketRawHash).toBeUndefined();
    expect(env?.traceId).toBe(state.traceId);
  });

  it("blocks stale market with DATA_STALE and explicit reasonClass", async () => {
    const clock = new FakeClock("2026-03-31T12:00:00.000Z");
    const market = baseMarket(clock, { freshnessMs: 120_000, status: "stale" });
    const wallet = baseWallet(clock);
    const engine = new Engine({ clock, dryRun: true, executionMode: "dry" });

    const state = await engine.run(
      async () => ({ market, wallet }),
      async () => ({ direction: "buy", confidence: 1 }),
      async () => ({ allowed: true }),
      async () => {
        throw new Error("should not execute");
      },
      async () => {
        throw new Error("should not verify");
      }
    );

    expect(state.blocked).toBe(true);
    expect(state.decisionEnvelope?.reasonClass).toBe("DATA_STALE");
    expect(state.decisionEnvelope?.stage).toBe("ingest");
  });

  it("blocks missing critical market fields with DATA_MISSING", async () => {
    const clock = new FakeClock("2026-03-31T12:00:00.000Z");
    const market = baseMarket(clock, { poolId: "" });
    const wallet = baseWallet(clock);
    const engine = new Engine({ clock, dryRun: true, executionMode: "dry" });

    const state = await engine.run(
      async () => ({ market, wallet }),
      async () => ({ direction: "buy", confidence: 1 }),
      async () => ({ allowed: true }),
      async () => {
        throw new Error("should not execute");
      },
      async () => {
        throw new Error("should not verify");
      }
    );

    expect(state.blocked).toBe(true);
    expect(state.decisionEnvelope?.reasonClass).toBe("DATA_MISSING");
  });
});
