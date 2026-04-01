/**
 * PR-B1: live / paper / dry all use Engine + decision.envelope.v2 with executionMode.
 */
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config/config-schema.js";
import { Engine } from "../../src/core/engine.js";
import { FakeClock } from "../../src/core/clock.js";
import { InMemoryJournalWriter } from "../../src/journal-writer/writer.js";
import { InMemoryRuntimeCycleSummaryWriter } from "../../src/persistence/runtime-cycle-summary-repository.js";
import { InMemoryIncidentRepository } from "../../src/persistence/incident-repository.js";
import { RepositoryIncidentRecorder } from "../../src/observability/incidents.js";
import { DryRunRuntime } from "../../src/runtime/dry-run-runtime.js";
import type { MarketSnapshot } from "../../src/core/contracts/market.js";
import type { WalletSnapshot } from "../../src/core/contracts/wallet.js";
import type { SignalPack } from "../../src/core/contracts/signalpack.js";
import { runSignalEngine } from "../../src/signals/signal-engine.js";
import { runScoringEngine } from "../../src/scoring/scoring-engine.js";
import { recognizePatterns } from "../../src/patterns/pattern-engine.js";

function buildSignalPack(market: MarketSnapshot, traceId: string, timestamp: string): SignalPack {
  return {
    traceId,
    timestamp,
    signals: [
      {
        source: "paprika",
        timestamp,
        poolId: market.poolId,
        baseToken: market.baseToken,
        quoteToken: market.quoteToken,
        priceUsd: market.priceUsd,
        volume24h: market.volume24h,
        liquidity: market.liquidity,
      },
    ],
    dataQuality: {
      completeness: 1,
      freshness:
        market.freshnessMs == null ? 1 : Math.max(0, 1 - Math.min(market.freshnessMs, 10_000) / 10_000),
      sourceReliability: 1,
      crossSourceConfidence: 1,
    },
    sources: ["paprika"],
  };
}

function paperConfig(wallet: string): Config {
  return {
    nodeEnv: "test",
    dryRun: false,
    tradingEnabled: false,
    liveTestMode: false,
    executionMode: "paper",
    rpcMode: "stub",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    dexpaprikaBaseUrl: "https://api.dexpaprika.com",
    moralisBaseUrl: "https://solana-gateway.moralis.io",
    walletAddress: wallet,
    journalPath: "data/journal.jsonl",
    circuitBreakerFailureThreshold: 5,
    circuitBreakerRecoveryMs: 60_000,
    maxSlippagePercent: 5,
    reviewPolicyMode: "required",
  };
}

function dryConfig(wallet: string): Config {
  return { ...paperConfig(wallet), executionMode: "dry" };
}

describe("decision path convergence (PR-B1)", () => {
  it("Engine emits decision.envelope.v2 with executionMode for dry and paper", async () => {
    const clock = new FakeClock("2026-03-31T12:00:00.000Z");
    const market: MarketSnapshot = {
      schema_version: "market.v1",
      traceId: "conv-market",
      timestamp: clock.now().toISOString(),
      source: "dexpaprika",
      poolId: "p1",
      baseToken: "SOL",
      quoteToken: "USDC",
      priceUsd: 100,
      volume24h: 1e6,
      liquidity: 1e6,
      freshnessMs: 0,
      status: "ok",
    };
    const wallet: WalletSnapshot = {
      traceId: "conv-wallet",
      timestamp: clock.now().toISOString(),
      source: "moralis",
      walletAddress: "11111111111111111111111111111111",
      balances: [],
      totalUsd: 1,
    };

    for (const mode of ["dry", "paper"] as const) {
      const dryRun = mode === "dry";
      const engine = new Engine({
        clock,
        dryRun,
        executionMode: mode,
        journalWriter: new InMemoryJournalWriter(),
        journalPolicy: "mandatory",
      });

      const state = await engine.run(
        async () => ({ market, wallet }),
        async () => {
          const sp = buildSignalPack(market, market.traceId, market.timestamp);
          const sc = runScoringEngine({ signalPack: sp, traceId: market.traceId, timestamp: market.timestamp });
          const pr = recognizePatterns(market.traceId, market.timestamp, sc, sp);
          const out = runSignalEngine({
            market,
            scoreCard: sc,
            patternResult: pr,
            dataQuality: sp.dataQuality,
            traceId: market.traceId,
            timestamp: market.timestamp,
            dryRun,
            executionMode: mode,
          });
          if (out.blocked) {
            return { blocked: true, blockedReason: out.reason };
          }
          return {
            direction: "buy",
            confidence: sc.hybrid,
            intent: out.intent,
          };
        },
        async () => ({ allowed: true }),
        async (intent) => ({
          traceId: intent.traceId,
          timestamp: intent.timestamp,
          tradeIntentId: intent.idempotencyKey,
          success: true,
          dryRun,
          executionMode: mode,
          paperExecution: mode === "paper",
          actualAmountOut: intent.minAmountOut,
        }),
        async (intent) => ({
          traceId: intent.traceId,
          timestamp: intent.timestamp,
          passed: true,
          checks: {},
          verificationMode: mode === "paper" ? "paper-simulated" : "rpc",
        })
      );

      expect(state.decisionEnvelope?.schemaVersion).toBe("decision.envelope.v2");
      expect(state.decisionEnvelope?.executionMode).toBe(mode);
      expect(state.decisionEnvelope?.entrypoint).toBe("engine");
      expect(state.decisionEnvelope?.flow).toBe("trade");
    }
  });

  it("DryRunRuntime paper cycle summary carries canonical decisionEnvelope", async () => {
    const clock = new FakeClock("2026-03-31T12:00:00.000Z");
    const market: MarketSnapshot = {
      schema_version: "market.v1",
      traceId: "rt-paper",
      timestamp: clock.now().toISOString(),
      source: "dexpaprika",
      poolId: "p2",
      baseToken: "SOL",
      quoteToken: "USDC",
      priceUsd: 50,
      volume24h: 1e5,
      liquidity: 1e5,
      freshnessMs: 0,
      status: "ok",
    };
    const wallet: WalletSnapshot = {
      traceId: "rt-wallet",
      timestamp: clock.now().toISOString(),
      source: "moralis",
      walletAddress: "11111111111111111111111111111111",
      balances: [],
      totalUsd: 1,
    };

    const fetchMarketDataFn = vi.fn().mockResolvedValue(market);
    const cycleWriter = new InMemoryRuntimeCycleSummaryWriter();
    const runtime = new DryRunRuntime(paperConfig(wallet.walletAddress), {
      clock,
      loopIntervalMs: 50,
      fetchMarketDataFn,
      paperMarketAdapters: [{ id: "dexpaprika", fetch: vi.fn() }],
      fetchPaperWalletSnapshot: async () => wallet,
      cycleSummaryWriter: cycleWriter,
      incidentRecorder: new RepositoryIncidentRecorder(new InMemoryIncidentRepository()),
      journalWriter: new InMemoryJournalWriter(),
    });

    await runtime.start();
    await runtime.stop();

    const summaries = await cycleWriter.list(5);
    expect(summaries.length).toBeGreaterThanOrEqual(1);
    expect(summaries[0].decisionEnvelope?.schemaVersion).toBe("decision.envelope.v2");
    expect(summaries[0].decisionEnvelope?.executionMode).toBe("paper");
  });

  it("DryRunRuntime dry mode still uses envelope v2 with executionMode dry", async () => {
    const clock = new FakeClock("2026-03-31T12:00:00.000Z");
    const runtime = new DryRunRuntime(dryConfig("11111111111111111111111111111111"), {
      clock,
      loopIntervalMs: 50,
      cycleSummaryWriter: new InMemoryRuntimeCycleSummaryWriter(),
      incidentRecorder: new RepositoryIncidentRecorder(new InMemoryIncidentRepository()),
      journalWriter: new InMemoryJournalWriter(),
    });
    await runtime.start();
    await runtime.stop();
    const s = runtime.getSnapshot().lastCycleSummary;
    expect(s?.decisionEnvelope?.schemaVersion).toBe("decision.envelope.v2");
    expect(s?.decisionEnvelope?.executionMode).toBe("dry");
  });
});
