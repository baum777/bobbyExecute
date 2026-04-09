import { describe, expect, it } from "vitest";
import { buildRuntimeShadowArtifactChain } from "../../src/runtime/shadow-artifact-chain.js";

function createRuntimeInput() {
  return {
    mode: "paper" as const,
    traceId: "runtime-trace-1",
    cycleTimestamp: "2026-03-20T00:00:00.000Z",
    market: {
      schema_version: "market.v1" as const,
      traceId: "market-trace-1",
      timestamp: "2026-03-20T00:00:00.000Z",
      source: "dexpaprika" as const,
      poolId: "pool-1",
      baseToken: "SOL",
      quoteToken: "USD",
      priceUsd: 140,
      volume24h: 2_000_000,
      liquidity: 3_500_000,
      freshnessMs: 0,
      status: "ok" as const,
    },
    wallet: {
      traceId: "wallet-trace-1",
      timestamp: "2026-03-20T00:00:00.000Z",
      source: "rpc" as const,
      walletAddress: "11111111111111111111111111111111",
      balances: [
        {
          mint: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          decimals: 9,
          amount: "12",
          amountUsd: 1_680,
        },
      ],
      totalUsd: 1_680,
    },
    oldAuthority: {
      blocked: false,
      signalDirection: "buy",
      signalConfidence: 0.61,
      tradeIntentId: "intent-runtime-1",
    },
  };
}

describe("runtime shadow artifact chain", () => {
  it("produces deterministic shadow-only parity output for stable runtime intake", () => {
    const input = createRuntimeInput();

    const first = buildRuntimeShadowArtifactChain(input);
    const second = buildRuntimeShadowArtifactChain(input);

    expect(second).toEqual(first);
    expect(first.artifactMode).toBe("shadow");
    expect(first.derivedOnly).toBe(true);
    expect(first.nonAuthoritative).toBe(true);
    expect(first.authorityInfluence).toBe(false);
    expect(first.canonicalDecisionHistory).toBe(false);
    expect(first.chainVersion).toBe("shadow_artifact_chain.v1");
    expect(first.inputRefs).toContain(`runtime_trace:${input.traceId}`);
    expect(first.inputRefs).toContain(`market:${input.market.traceId}`);
    expect(first.inputRefs).toContain(`wallet:${input.wallet.traceId}`);
    expect(first.parity.oldAuthority).toMatchObject(input.oldAuthority);
    expect(first.parity.shadowDerived).toHaveProperty("blocked");
    expect(first.parity.deltas).toHaveProperty("blockedMismatch");
    expect(first.artifacts.sourceObservationCount).toBeGreaterThanOrEqual(2);
    expect(first.artifacts.discoveryEvidenceHash).toBeDefined();
    expect(first.artifacts.qualityStatus).toBeDefined();
  });

  it("fails closed to explicit skipped status when runtime intake is unavailable", () => {
    const summary = buildRuntimeShadowArtifactChain({
      mode: "dry",
      traceId: "runtime-trace-missing-intake",
      cycleTimestamp: "2026-03-20T00:00:00.000Z",
      oldAuthority: {
        blocked: true,
        blockedReason: "PAPER_INGEST_BLOCKED:stale",
      },
    });

    expect(summary.status).toBe("skipped");
    expect(summary.failureStage).toBe("input_intake");
    expect(summary.failureReason).toContain("SHADOW_CHAIN_SKIPPED");
    expect(summary.parity.oldAuthority.blocked).toBe(true);
    expect(summary.parity.oldAuthority.blockedReason).toContain("PAPER_INGEST_BLOCKED");
    expect(summary.parity.shadowDerived.blocked).toBe(false);
  });
});
