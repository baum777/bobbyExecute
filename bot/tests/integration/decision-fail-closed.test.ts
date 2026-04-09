import { describe, expect, it, vi } from "vitest";
import { FakeClock } from "../../src/core/clock.js";
import { Engine } from "../../src/core/engine.js";
import { createDecisionCoordinator } from "../../src/core/decision/index.js";
import { DryRunRuntime } from "../../src/runtime/dry-run-runtime.js";
import type { Config } from "../../src/config/config-schema.js";

const BASE_CONFIG: Config = {
  nodeEnv: "test",
  dryRun: true,
  tradingEnabled: false,
  liveTestMode: false,
  executionMode: "dry",
  rpcMode: "stub",
  rpcUrl: "https://api.mainnet-beta.solana.com",
  discoveryProvider: "dexscreener",
  marketDataProvider: "dexpaprika",
  streamingProvider: "dexpaprika",
  moralisEnabled: false,
  dexpaprikaBaseUrl: "https://api.dexpaprika.com",
  moralisBaseUrl: "https://solana-gateway.moralis.io",
  walletAddress: "11111111111111111111111111111111",
  journalPath: "data/journal.jsonl",
  circuitBreakerFailureThreshold: 5,
  circuitBreakerRecoveryMs: 60_000,
  maxSlippagePercent: 5,
  reviewPolicyMode: "required",
};

describe("decision fail-closed", () => {
  it("refuses to execute when coordinator wiring is broken", async () => {
    const clock = new FakeClock("2026-03-17T12:00:00.000Z");
    const ingest = vi.fn(async () => ({
      market: {
        schema_version: "market.v1" as const,
        traceId: "trace-1",
        timestamp: clock.now().toISOString(),
        source: "dexpaprika" as const,
        poolId: "pool-1",
        baseToken: "SOL",
        quoteToken: "USDC",
        priceUsd: 100,
        volume24h: 1_000,
        liquidity: 100_000,
        freshnessMs: 0,
        status: "ok" as const,
      },
      wallet: {
        traceId: "trace-1",
        timestamp: clock.now().toISOString(),
        source: "rpc" as const,
        walletAddress: "11111111111111111111111111111111",
        balances: [],
        totalUsd: 0,
      },
    }));
    const executeFn = vi.fn();
    const verifyFn = vi.fn();

    const engine = new Engine({
      clock,
      dryRun: true,
      decisionCoordinator: {
        run: async () => {
          throw new Error("BROKEN_COORDINATOR");
        },
      },
    });

    await expect(
      engine.run(
        ingest,
        async () => ({ direction: "buy", confidence: 0.9 }),
        async () => ({ allowed: true }),
        executeFn,
        verifyFn
      )
    ).rejects.toThrow("BROKEN_COORDINATOR");
    expect(executeFn).not.toHaveBeenCalled();
    expect(verifyFn).not.toHaveBeenCalled();
  });

  it("rejects incomplete handler bundles at the coordinator boundary", async () => {
    const coordinator = createDecisionCoordinator();
    const clock = new FakeClock("2026-03-17T12:00:00.000Z");

    await expect(
      coordinator.run({
        entrypoint: "engine",
        flow: "trade",
        clock,
        traceIdSeed: "seed-3",
        tracePrefix: "trace",
        handlers: {
          ingest: async () => ({ payload: { ingest: "ok" } }),
          signal: async () => ({ payload: { signal: "ok" } }),
          risk: async () => ({ payload: { risk: "ok" } }),
          verify: async () => ({ payload: { verify: "ok" } }),
          journal: async () => ({ payload: { journal: "ok" } }),
        },
      })
    ).rejects.toThrow("DECISION_COORDINATOR_MISSING_HANDLER:engine:trade:execute");
  });

  it("keeps the dry-run runtime fail-closed when its engine is broken", async () => {
    const runtime = new DryRunRuntime(BASE_CONFIG, {
      clock: new FakeClock("2026-03-17T12:00:00.000Z"),
      engine: new Engine({
        clock: new FakeClock("2026-03-17T12:00:00.000Z"),
        dryRun: true,
        decisionCoordinator: {
          run: async () => {
            throw new Error("BROKEN_COORDINATOR");
          },
        },
      }),
      fetchMarketDataFn: vi.fn(),
      fetchPaperWalletSnapshot: vi.fn(),
    });

    await expect(runtime.start()).rejects.toThrow("BROKEN_COORDINATOR");
    expect(runtime.getStatus()).toBe("error");
  });
});
