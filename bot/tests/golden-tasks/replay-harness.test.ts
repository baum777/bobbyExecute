/**
 * Golden task replay harness.
 * MAPPED from OrchestrAI_Labs apps/api/test/golden-tasks/golden-tasks.e2e.spec.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "@bot/core/engine.js";
import { FakeClock } from "@bot/core/clock.js";
import { InMemoryActionLogger } from "@bot/observability/action-log.js";
import type { MarketSnapshot } from "@bot/core/contracts/market.js";
import type { WalletSnapshot } from "@bot/core/contracts/wallet.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "GT-001");

function loadFixture() {
  const path = join(FIXTURES_DIR, "fixture.json");
  if (!existsSync(path)) throw new Error(`Fixture not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8")) as {
    market: MarketSnapshot;
    wallet: WalletSnapshot;
  };
}

function loadExpected() {
  const path = join(FIXTURES_DIR, "expected.json");
  if (!existsSync(path)) throw new Error(`Expected not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8")) as {
    expect: {
      stageReached: string;
      blocked: boolean;
      hasDecisionHash: boolean;
      hasResultHash: boolean;
      executionSuccess: boolean;
    };
  };
}

describe("Golden Task GT-001", () => {
  it("runs full pipeline: MarketSnapshot -> Signal -> Risk -> Paper Execute -> Verify -> Journal", async () => {
    const clock = new FakeClock("2025-03-01T12:00:00.000Z");
    const actionLogger = new InMemoryActionLogger();
    const { market, wallet } = loadFixture();
    const expected = loadExpected();

    const engine = new Engine({
      clock,
      actionLogger,
      dryRun: true,
    });

    const ingest = async () => ({ market, wallet });
    const signalFn = async () => ({ direction: "hold", confidence: 0.5 });
    const riskFn = async () => ({ allowed: true });
    const executeFn = async (intent: { traceId: string; timestamp: string; idempotencyKey: string; minAmountOut: string }) => ({
      traceId: intent.traceId,
      timestamp: intent.timestamp,
      tradeIntentId: intent.idempotencyKey,
      success: true,
      actualAmountOut: intent.minAmountOut,
    });
    const verifyFn = async () => ({
      traceId: "gt-001-trace",
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

    const logs = actionLogger.list();
    expect(logs.length).toBeGreaterThan(0);
  });
});
