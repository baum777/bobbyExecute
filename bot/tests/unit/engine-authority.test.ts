import { describe, expect, it, vi } from "vitest";
import { Engine } from "../../src/core/engine.js";
import { FakeClock } from "../../src/core/clock.js";
import { InMemoryJournalWriter, type JournalWriter } from "../../src/journal-writer/writer.js";
import { EventBus } from "../../src/eventbus/eventBus.js";
import type { JournalEntry } from "../../src/core/contracts/journal.js";
import type { DecisionCoordinator } from "../../src/core/contracts/decision-envelope.js";
import type { TradeIntent } from "../../src/core/contracts/trade.js";

function makeHandlers() {
  const now = "2026-03-17T12:00:00.000Z";

  const ingest = async () => ({
    market: {
      traceId: "trace-1",
      timestamp: now,
      source: "dexpaprika",
      poolId: "pool-1",
      baseToken: "SOL",
      quoteToken: "USDC",
      priceUsd: 100,
      volume24h: 1000,
      liquidity: 100000,
      freshnessMs: 0,
    },
    wallet: {
      traceId: "trace-1",
      timestamp: now,
      source: "moralis",
      walletAddress: "wallet-1",
      balances: [],
      totalUsd: 100,
    },
  });

  const signalFn = async () => ({ direction: "buy", confidence: 0.9 });
  const riskFn = async () => ({ allowed: true });
  const executeFn = vi.fn(async (intent: TradeIntent) => ({
    traceId: intent.traceId,
    timestamp: intent.timestamp,
    tradeIntentId: intent.idempotencyKey,
    success: true,
    dryRun: true,
    actualAmountOut: intent.minAmountOut,
  }));
  const verifyFn = vi.fn(async (intent: TradeIntent) => ({
    traceId: intent.traceId,
    timestamp: intent.timestamp,
    passed: true,
    checks: { tokenMint: true },
  }));

  return { ingest, signalFn, riskFn, executeFn, verifyFn };
}

class StageFailingJournalWriter implements JournalWriter {
  private readonly entries: JournalEntry[] = [];

  constructor(private readonly failStage: string) {}

  async append(entry: JournalEntry): Promise<void> {
    if (entry.stage === this.failStage) {
      throw new Error(`forced journal failure at ${entry.stage}`);
    }
    this.entries.push(entry);
  }

  async getByTraceId(traceId: string): Promise<JournalEntry[]> {
    return this.entries.filter((entry) => entry.traceId === traceId);
  }

  async getRange(_from: string, _to: string, _limit?: number): Promise<JournalEntry[]> {
    return this.entries;
  }
}

function makeMalformedDecisionCoordinator(): DecisionCoordinator {
  return {
    run: vi.fn(async () => ({
      schemaVersion: "decision.envelope.v2",
      entrypoint: "engine",
      flow: "trade",
      executionMode: "dry",
      traceId: "trace-1",
      stage: "monitor",
      blocked: false,
      decisionHash: "decision-hash-1",
      // resultHash is intentionally missing to prove runtime validation blocks it.
    })) as DecisionCoordinator["run"],
  };
}

describe("Engine authority closure", () => {
  it("blocks execute when chaos denies", async () => {
    const clock = new FakeClock("2026-03-17T12:00:00.000Z");
    const { ingest, signalFn, riskFn, executeFn, verifyFn } = makeHandlers();

    const engine = new Engine({
      clock,
      dryRun: true,
      chaosFn: async () => ({ allowed: false, reason: "CHAOS_CAT5_DENY" }),
    });

    const state = await engine.run(ingest, signalFn, riskFn, executeFn, verifyFn);

    expect(state.blocked).toBe(true);
    expect(state.blockedReason).toBe("CHAOS_CAT5_DENY");
    expect(state.stage).toBe("chaos");
    expect(executeFn).not.toHaveBeenCalled();
    expect(verifyFn).not.toHaveBeenCalled();
  });

  it("runs full authority sequence when chaos approves", async () => {
    const clock = new FakeClock("2026-03-17T12:00:00.000Z");
    const { ingest, signalFn, riskFn, executeFn, verifyFn } = makeHandlers();
    const transitions: Array<string> = [];
    const eventBus = new EventBus();
    eventBus.on("StageTransition", async (event) => {
      transitions.push(`${event.fromStage}->${event.toStage}`);
    });

    const engine = new Engine({
      clock,
      dryRun: true,
      eventBus,
      chaosFn: async () => ({ allowed: true, reportHash: "chaos-report-1" }),
    });

    const state = await engine.run(ingest, signalFn, riskFn, executeFn, verifyFn);

    expect(state.blocked).toBe(false);
    expect(state.chaosAllowed).toBe(true);
    expect(state.chaosReportHash).toBe("chaos-report-1");
    expect(state.stage).toBe("monitor");
    expect(transitions).toContain("risk->chaos");
    expect(transitions).toContain("chaos->execute");
    expect(transitions).toContain("execute->verify");
    expect(transitions).toContain("verify->journal");
    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(verifyFn).toHaveBeenCalledTimes(1);
  });

  it("fails closed when mandatory critical journal write fails", async () => {
    const clock = new FakeClock("2026-03-17T12:00:00.000Z");
    const { ingest, signalFn, riskFn, executeFn, verifyFn } = makeHandlers();

    const engine = new Engine({
      clock,
      dryRun: true,
      journalPolicy: "mandatory",
      journalWriter: new StageFailingJournalWriter("chaos_decision"),
      chaosFn: async () => ({ allowed: true, reportHash: "chaos-report-2" }),
    });

    await expect(engine.run(ingest, signalFn, riskFn, executeFn, verifyFn)).rejects.toThrow(
      "forced journal failure at chaos_decision"
    );
    expect(executeFn).not.toHaveBeenCalled();
  });

  it("records critical authority journal stages on success", async () => {
    const clock = new FakeClock("2026-03-17T12:00:00.000Z");
    const { ingest, signalFn, riskFn, executeFn, verifyFn } = makeHandlers();
    const journalWriter = new InMemoryJournalWriter();

    const engine = new Engine({
      clock,
      dryRun: true,
      journalPolicy: "mandatory",
      journalWriter,
      chaosFn: async () => ({ allowed: true, reportHash: "chaos-report-3" }),
    });

    const state = await engine.run(ingest, signalFn, riskFn, executeFn, verifyFn);
    const entries = await journalWriter.getByTraceId(state.traceId);
    const stages = entries.map((entry) => entry.stage);

    expect(stages).toContain("decision_outcome");
    expect(stages).toContain("risk_decision");
    expect(stages).toContain("chaos_decision");
    expect(stages).toContain("execution_result");
    expect(stages).toContain("verification_result");
    expect(stages).toContain("canonical_trade_complete");
  });

  it("rejects malformed decision envelopes from the coordinator", async () => {
    const clock = new FakeClock("2026-03-17T12:00:00.000Z");
    const { ingest, signalFn, riskFn, executeFn, verifyFn } = makeHandlers();

    const engine = new Engine({
      clock,
      dryRun: true,
      decisionCoordinator: makeMalformedDecisionCoordinator(),
    });

    await expect(engine.run(ingest, signalFn, riskFn, executeFn, verifyFn)).rejects.toThrow(
      /INVALID_DECISION_ENVELOPE:engine/
    );
    expect(executeFn).not.toHaveBeenCalled();
    expect(verifyFn).not.toHaveBeenCalled();
  });
});
