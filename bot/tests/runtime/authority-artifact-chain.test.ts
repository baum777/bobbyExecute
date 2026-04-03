import { describe, expect, it } from "vitest";
import { buildRuntimeAuthorityArtifactChain } from "../../src/runtime/authority-artifact-chain.js";
import type { MarketSnapshot } from "../../src/core/contracts/market.js";
import type { WalletSnapshot } from "../../src/core/contracts/wallet.js";

const CYCLE_TIMESTAMP = "2026-03-31T12:00:00.000Z";

function buildMarket(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    schema_version: "market.v1",
    traceId: "authority-market",
    timestamp: CYCLE_TIMESTAMP,
    source: "dexpaprika",
    poolId: "authority-pool",
    baseToken: "SOL",
    quoteToken: "USD",
    priceUsd: 100,
    volume24h: 1_000,
    liquidity: 1_000_000,
    freshnessMs: 0,
    status: "ok",
    ...overrides,
  };
}

function buildWallet(overrides: Partial<WalletSnapshot> = {}): WalletSnapshot {
  return {
    traceId: "authority-wallet",
    timestamp: CYCLE_TIMESTAMP,
    source: "moralis",
    walletAddress: "11111111111111111111111111111111",
    balances: [
      {
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        decimals: 9,
        amount: "1",
        amountUsd: 100,
      },
    ],
    totalUsd: 100,
    ...overrides,
  };
}

describe("authority artifact chain", () => {
  it("builds the surviving deterministic authority chain and returns canonical provenance", () => {
    const resolution = buildRuntimeAuthorityArtifactChain({
      mode: "dry",
      traceId: "authority-trace",
      cycleTimestamp: CYCLE_TIMESTAMP,
      market: buildMarket(),
      wallet: buildWallet(),
    });

    expect(resolution.blocked).toBe(false);
    expect(resolution.intent).toBeDefined();
    expect(resolution.signal).toBeDefined();
    expect(resolution.summary.artifactMode).toBe("authority");
    expect(resolution.summary.derivedOnly).toBe(false);
    expect(resolution.summary.nonAuthoritative).toBe(false);
    expect(resolution.summary.authorityInfluence).toBe(true);
    expect(resolution.summary.chainVersion).toBe("authority_artifact_chain.v1");
    expect(resolution.summary.status).toBe("built");
    expect(resolution.summary.decision.blocked).toBe(false);
    expect(resolution.summary.decision.direction).toBe("buy");
    expect(resolution.summary.decision.tradeIntentId).toBe("authority-trace-intent");
    expect(resolution.summary.inputRefs).toEqual(
      expect.arrayContaining([
        "runtime_trace:authority-trace",
        "runtime_mode:dry",
        "market:authority-market",
        "wallet:authority-wallet",
      ])
    );
    expect(resolution.summary.artifacts.sourceObservationCount).toBe(2);
    expect(resolution.summary.artifacts.discoveryEvidenceRef).toContain("discovery_evidence:");
    expect(resolution.summary.artifacts.cqdHash).toMatch(/^[a-f0-9]{64}$/);
    expect(resolution.summary.artifacts.constructedSignalSetPayloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(resolution.summary.artifacts.scoreCardPayloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when the universe is excluded by stale upstream truth", () => {
    const resolution = buildRuntimeAuthorityArtifactChain({
      mode: "paper",
      traceId: "authority-stale",
      cycleTimestamp: CYCLE_TIMESTAMP,
      market: buildMarket({ freshnessMs: 1 }),
      wallet: buildWallet(),
    });

    expect(resolution.blocked).toBe(true);
    expect(resolution.intent).toBeUndefined();
    expect(resolution.signal).toBeUndefined();
    expect(resolution.summary.status).toBe("blocked");
    expect(resolution.summary.failureStage).toBe("data_quality");
    expect(resolution.summary.failureReason).toContain("AUTHORITY_DATA_QUALITY_BLOCKED");
    expect(resolution.summary.artifacts.dataQualityStatus).toBe("fail");
    expect(resolution.summary.artifacts.dataQualityReasonCodes).toEqual(
      expect.arrayContaining(["DQ_UNIVERSE_EXCLUDED", "DQ_ROUTE_NOT_VIABLE", "DQ_LIQUIDITY_INELIGIBLE"])
    );
  });

  it("fails closed when upstream liquidity is not eligible", () => {
    const resolution = buildRuntimeAuthorityArtifactChain({
      mode: "live",
      traceId: "authority-low-liquidity",
      cycleTimestamp: CYCLE_TIMESTAMP,
      market: buildMarket({ liquidity: 0 }),
      wallet: buildWallet(),
    });

    expect(resolution.blocked).toBe(true);
    expect(resolution.intent).toBeUndefined();
    expect(resolution.signal).toBeUndefined();
    expect(resolution.summary.status).toBe("blocked");
    expect(resolution.summary.failureStage).toBe("data_quality");
    expect(resolution.summary.failureReason).toContain("AUTHORITY_DATA_QUALITY_BLOCKED");
    expect(resolution.summary.artifacts.dataQualityStatus).toBe("fail");
    expect(resolution.summary.artifacts.dataQualityReasonCodes).toContain("DQ_LIQUIDITY_INELIGIBLE");
  });
});
