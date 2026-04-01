import { describe, expect, it, vi } from "vitest";
import { FakeClock } from "../../src/core/clock.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
import type { DecisionCoordinator } from "../../src/core/contracts/decision-envelope.js";
import type { IntentSpec } from "../../src/core/contracts/intent.js";
import type { SignalPack } from "../../src/core/contracts/signalpack.js";

function makeIntentSpec(): IntentSpec {
  return {
    traceId: "trace-1",
    timestamp: "2026-03-17T12:00:00.000Z",
    idempotencyKey: "idem-1",
    targetPairs: ["SOL/USDC"],
    dryRun: true,
  };
}

function makeSignalPack(): SignalPack {
  return {
    traceId: "trace-1",
    timestamp: "2026-03-17T12:00:00.000Z",
    signals: [
      {
        source: "paprika",
        timestamp: "2026-03-17T12:00:00.000Z",
        baseToken: "SOL",
        quoteToken: "USDC",
        priceUsd: 100,
        volume24h: 1000,
        liquidity: 100000,
      },
    ],
    dataQuality: {
      completeness: 1,
      freshness: 1,
      sourceReliability: 1,
    },
    sources: ["paprika"],
  };
}

function makeMalformedDecisionCoordinator(): DecisionCoordinator {
  return {
    run: vi.fn(async () => ({
      schemaVersion: "decision.envelope.v2",
      entrypoint: "orchestrator",
      flow: "analysis",
      executionMode: "dry",
      traceId: "orch-1",
      stage: "journal",
      blocked: false,
      resultHash: "result-hash-1",
      // decisionHash is intentionally missing to prove runtime validation blocks it.
    })) as DecisionCoordinator["run"],
  };
}

describe("Orchestrator authority closure", () => {
  it("rejects malformed decision envelopes from the coordinator", async () => {
    const clock = new FakeClock("2026-03-17T12:00:00.000Z");
    const orchestrator = new Orchestrator({
      clock,
      dryRun: true,
      decisionCoordinator: makeMalformedDecisionCoordinator(),
    });

    const intentSpec = makeIntentSpec();
    const research = vi.fn(async () => makeSignalPack());

    await expect(orchestrator.run(intentSpec, research)).rejects.toThrow(
      /INVALID_DECISION_ENVELOPE:orchestrator/
    );
  });
});
