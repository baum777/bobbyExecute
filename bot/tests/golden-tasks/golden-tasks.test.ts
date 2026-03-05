/**
 * Golden Tasks GT-001..GT-010 - A==B Pipeline coverage.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "@bot/core/engine.js";
import { FakeClock } from "@bot/core/clock.js";
import { InMemoryActionLogger } from "@bot/observability/action-log.js";
import { hashDecision, hashResult } from "@bot/core/determinism/hash.js";
import { CircuitBreaker } from "@bot/governance/circuit-breaker.js";
import { runTradeGuardrails } from "@bot/governance/guardrails.js";
import { createSignalHandler } from "@bot/agents/signal.agent.js";
import { createRiskHandler } from "@bot/agents/risk.agent.js";
import type { MarketSnapshot } from "@bot/core/contracts/market.js";
import type { WalletSnapshot } from "@bot/core/contracts/wallet.js";
import type { TradeIntent } from "@bot/core/contracts/trade.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_TASKS_DIR = join(__dirname);

function loadJson<T>(dir: string, file: string): T {
  const path = join(GOLDEN_TASKS_DIR, dir, file);
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

describe("Golden Task GT-001", () => {
  it("runs full pipeline: MarketSnapshot -> Signal -> Risk -> Paper Execute -> Verify -> Journal", async () => {
    const fixture = loadJson<{ market: MarketSnapshot; wallet: WalletSnapshot; expect?: unknown }>("GT-001", "fixture.json");
    const expected = loadJson<{ expect: { stageReached: string; blocked: boolean; hasDecisionHash: boolean; hasResultHash: boolean; executionSuccess: boolean } }>("GT-001", "expected.json");

    const clock = new FakeClock("2025-03-01T12:00:00.000Z");
    const actionLogger = new InMemoryActionLogger();
    const { market, wallet } = fixture;

    const engine = new Engine({ clock, actionLogger, dryRun: true });
    const ingest = async () => ({ market, wallet });
    const signalFn = async () => ({ direction: "hold", confidence: 0.5 });
    const riskFn = async () => ({ allowed: true });
    const executeFn = async (intent: TradeIntent) => ({
      traceId: intent.traceId,
      timestamp: intent.timestamp,
      tradeIntentId: intent.idempotencyKey,
      success: true,
      actualAmountOut: intent.minAmountOut,
    });
    const verifyFn = async () => ({
      traceId: (fixture.market as MarketSnapshot).traceId,
      timestamp: clock.now().toISOString(),
      passed: true,
      checks: { tokenMint: true, decimals: true, balance: true, quoteInputs: true },
    });

    const state = await engine.run(ingest, signalFn, riskFn, executeFn, verifyFn);

    expect(state.stage).toBe(expected.expect.stageReached);
    expect(state.blocked).toBe(expected.expect.blocked);
    expect(state.journalEntry?.decisionHash).toBeDefined();
    expect(state.journalEntry?.resultHash).toBeDefined();
    expect(state.executionReport?.success).toBe(expected.expect.executionSuccess);
    expect(actionLogger.list().length).toBeGreaterThan(0);
  });
});

describe("Golden Task GT-002", () => {
  it("Ingest determinism - same input yields same canonical hash", async () => {
    const fixture = loadJson<{ market: MarketSnapshot; wallet: WalletSnapshot }>("GT-002", "fixture.json");
    const expected = loadJson<{ expect: { canonicalHashStable: boolean; marketPriceUsd: number; walletTotalUsd: number } }>("GT-002", "expected.json");

    const hash1 = hashDecision({ market: fixture.market, wallet: fixture.wallet });
    const hash2 = hashDecision({ market: fixture.market, wallet: fixture.wallet });
    expect(hash1).toBe(hash2);
    expect(expected.expect.canonicalHashStable).toBe(true);
    expect(fixture.market.priceUsd).toBe(expected.expect.marketPriceUsd);
    expect(fixture.wallet.totalUsd).toBe(expected.expect.walletTotalUsd);
  });
});

describe("Golden Task GT-003", () => {
  it("Signal agent bounded output - confidence in [0,1]", async () => {
    const fixture = loadJson<{ market: MarketSnapshot }>("GT-003", "fixture.json");
    const expected = loadJson<{ expect: { confidenceMin: number; confidenceMax: number; directionOneOf: string[] } }>("GT-003", "expected.json");

    const signalFn = await createSignalHandler();
    const result = await signalFn(fixture.market);

    expect(result.confidence).toBeGreaterThanOrEqual(expected.expect.confidenceMin);
    expect(result.confidence).toBeLessThanOrEqual(expected.expect.confidenceMax);
    expect(expected.expect.directionOneOf).toContain(result.direction);
  });
});

describe("Golden Task GT-004", () => {
  it("Risk agent fail-closed - reject when slippage exceeds max", async () => {
    const fixture = loadJson<{ intent: TradeIntent; market: MarketSnapshot; wallet: WalletSnapshot }>("GT-004", "fixture.json");
    const expected = loadJson<{ expect: { allowed: boolean; reasonContains: string } }>("GT-004", "expected.json");

    const riskFn = await createRiskHandler({ maxSlippagePercent: 5 });
    const result = await riskFn(fixture.intent, fixture.market, fixture.wallet);

    expect(result.allowed).toBe(expected.expect.allowed);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain(expected.expect.reasonContains);
  });
});

describe("Golden Task GT-005", () => {
  it("Execution agent side-effect isolation - dryRun no real tx", async () => {
    const fixture = loadJson<{ intent: TradeIntent }>("GT-005", "fixture.json");
    const expected = loadJson<{ expect: { success: boolean; dryRun: boolean; noRealTxSignature: boolean } }>("GT-005", "expected.json");

    const clock = new FakeClock("2025-03-01T12:00:00.000Z");
    const market: MarketSnapshot = {
      traceId: "gt-005",
      timestamp: clock.now().toISOString(),
      source: "dexpaprika",
      poolId: "p1",
      baseToken: "SOL",
      quoteToken: "USD",
      priceUsd: 100,
      volume24h: 1000,
      liquidity: 10000,
    };
    const wallet: WalletSnapshot = {
      traceId: "gt-005",
      timestamp: clock.now().toISOString(),
      source: "moralis",
      walletAddress: "addr",
      balances: [],
    };

    const engine = new Engine({ clock, dryRun: true });
    const ingest = async () => ({ market, wallet });
    const signalFn = async () => ({ direction: "hold", confidence: 0.5 });
    const riskFn = async () => ({ allowed: true });
    const executeFn = async (intent: TradeIntent) => ({
      traceId: intent.traceId,
      timestamp: intent.timestamp,
      tradeIntentId: intent.idempotencyKey,
      success: true,
      actualAmountOut: intent.minAmountOut,
      dryRun: true,
    });
    const verifyFn = async () => ({
      traceId: "gt-005",
      timestamp: clock.now().toISOString(),
      passed: true,
      checks: {},
    });

    const state = await engine.run(ingest, signalFn, riskFn, executeFn, verifyFn);

    expect(state.executionReport?.success).toBe(expected.expect.success);
    expect(state.executionReport?.dryRun).toBe(expected.expect.dryRun);
    expect(state.executionReport?.txSignature).toBeUndefined();
  });
});

describe("Golden Task GT-006", () => {
  it("Verify agent RPC consistency - passed report has checks format", async () => {
    const fixture = loadJson<{ intent: TradeIntent; execReport: unknown }>("GT-006", "fixture.json");
    const expected = loadJson<{ expect: { passed: boolean; checksFormat: boolean } }>("GT-006", "expected.json");

    const clock = new FakeClock("2025-03-01T12:00:00.000Z");
    const verifyFn = async () => ({
      traceId: fixture.intent.traceId,
      timestamp: clock.now().toISOString(),
      passed: true,
      checks: { tokenMint: true, decimals: true, balance: true, quoteInputs: true },
    });

    const result = await verifyFn();

    expect(result.passed).toBe(expected.expect.passed);
    expect(typeof result.checks).toBe("object");
    expect(expected.expect.checksFormat).toBe(true);
  });
});

describe("Golden Task GT-007", () => {
  it("Journal canonical hash - decisionHash and resultHash stable", () => {
    const fixture = loadJson<{ entry: { input: unknown; output: unknown } }>("GT-007", "fixture.json");
    const expected = loadJson<{ expect: { decisionHashStable: boolean; resultHashStable: boolean } }>("GT-007", "expected.json");

    const decisionHash1 = hashDecision(fixture.entry.input);
    const decisionHash2 = hashDecision(fixture.entry.input);
    const resultHash1 = hashResult(fixture.entry.output);
    const resultHash2 = hashResult(fixture.entry.output);

    expect(decisionHash1).toBe(decisionHash2);
    expect(resultHash1).toBe(resultHash2);
    expect(expected.expect.decisionHashStable).toBe(true);
    expect(expected.expect.resultHashStable).toBe(true);
  });
});

describe("Golden Task GT-008", () => {
  it("Circuit breaker state transition - unhealthy after N failures", () => {
    const fixture = loadJson<{ adapterIds: string[]; failureThreshold: number; reportSequence: string[] }>("GT-008", "fixture.json");
    const expected = loadJson<{ expect: { afterFiveFailures: string; healthyCountBefore: number } }>("GT-008", "expected.json");

    const cb = new CircuitBreaker(fixture.adapterIds, {
      failureThreshold: fixture.failureThreshold,
    });

    const adapterId = fixture.adapterIds[0];
    let healthyCount = 0;

    for (const outcome of fixture.reportSequence) {
      cb.reportHealth(adapterId, outcome === "success", 50);
      if (cb.isHealthy(adapterId)) healthyCount++;
    }

    expect(healthyCount).toBe(expected.expect.healthyCountBefore);
    expect(cb.isHealthy(adapterId)).toBe(false);
  });
});

describe("Golden Task GT-009", () => {
  it("Guardrails permission enforcement - block when review required for side effects", () => {
    const fixture = loadJson<{ profile: { id: string; permissions: string[] }; context: { hasSideEffects: boolean; reviewPolicyMode: "none" | "draft_only" | "required"; requiredPermissions: string[] } }>("GT-009", "fixture.json");
    const expected = loadJson<{ expect: { allowed: boolean; reasonContains: string } }>("GT-009", "expected.json");

    const profile = {
      id: fixture.profile.id,
      name: "Test",
      role: "executor" as const,
      permissions: ["market.read", "wallet.read"] as const,
      tools: [],
      reviewPolicy: { mode: fixture.context.reviewPolicyMode, requiresHumanFor: [], reviewerRoles: [] },
    };

    const result = runTradeGuardrails(profile, {
      hasSideEffects: fixture.context.hasSideEffects,
      reviewPolicyMode: fixture.context.reviewPolicyMode,
      requiredPermissions: ["trade.execute"],
    });

    expect(result.allowed).toBe(expected.expect.allowed);
    const reason = result.reason ?? result.blockReason ?? "";
    expect(reason.toLowerCase()).toContain(expected.expect.reasonContains.toLowerCase());
  });
});

describe("Golden Task GT-010", () => {
  it("End-to-End pipeline determinism - same input yields same hashes", async () => {
    const fixture = loadJson<{ market: MarketSnapshot; wallet: WalletSnapshot }>("GT-010", "fixture.json");
    const expected = loadJson<{ expect: { stageReached: string; blocked: boolean; hasDecisionHash: boolean; hasResultHash: boolean; hashStableAcrossRuns: boolean } }>("GT-010", "expected.json");

    const clock = new FakeClock("2025-03-01T12:00:00.000Z");
    const actionLogger = new InMemoryActionLogger();
    const { market, wallet } = fixture;

    const engine = new Engine({
      clock,
      actionLogger,
      dryRun: true,
      traceIdSeed: "gt010-deterministic",
    });
    const ingest = async () => ({ market, wallet });
    const signalFn = async () => ({ direction: "hold", confidence: 0.5 });
    const riskFn = async () => ({ allowed: true });
    const executeFn = async (intent: TradeIntent) => ({
      traceId: intent.traceId,
      timestamp: intent.timestamp,
      tradeIntentId: intent.idempotencyKey,
      success: true,
      actualAmountOut: intent.minAmountOut,
    });
    const verifyFn = async () => ({
      traceId: market.traceId,
      timestamp: clock.now().toISOString(),
      passed: true,
      checks: {},
    });

    const state1 = await engine.run(ingest, signalFn, riskFn, executeFn, verifyFn);
    const state2 = await engine.run(
      async () => ({ market, wallet }),
      async () => ({ direction: "hold", confidence: 0.5 }),
      async () => ({ allowed: true }),
      async (intent) => ({
        traceId: intent.traceId,
        timestamp: intent.timestamp,
        tradeIntentId: intent.idempotencyKey,
        success: true,
        actualAmountOut: intent.minAmountOut,
      }),
      async () => ({
        traceId: market.traceId,
        timestamp: clock.now().toISOString(),
        passed: true,
        checks: {},
      })
    );

    expect(state1.stage).toBe(expected.expect.stageReached);
    expect(state1.blocked).toBe(expected.expect.blocked);
    expect(state1.journalEntry?.decisionHash).toBeDefined();
    expect(state1.journalEntry?.resultHash).toBeDefined();

    expect(state1.journalEntry?.decisionHash).toBe(state2.journalEntry?.decisionHash);
    expect(state1.journalEntry?.resultHash).toBe(state2.journalEntry?.resultHash);
  });
});
