import { afterEach, describe, expect, it } from "vitest";
import { DryRunRuntime } from "../../src/runtime/dry-run-runtime.js";
import { InMemoryRuntimeCycleSummaryWriter } from "../../src/persistence/runtime-cycle-summary-repository.js";
import { resetKillSwitch } from "../../src/governance/kill-switch.js";
import type { Config } from "../../src/config/config-schema.js";

const TEST_CONFIG: Config = {
  nodeEnv: "test",
  dryRun: true,
  tradingEnabled: false,
  liveTestMode: false,
  executionMode: "dry",
  rpcMode: "stub",
  rpcUrl: "https://api.mainnet-beta.solana.com",
  dexpaprikaBaseUrl: "https://api.dexpaprika.com",
  moralisBaseUrl: "https://solana-gateway.moralis.io",
  walletAddress: "11111111111111111111111111111111",
  journalPath: "data/journal.jsonl",
  circuitBreakerFailureThreshold: 5,
  circuitBreakerRecoveryMs: 60_000,
  maxSlippagePercent: 5,
  reviewPolicyMode: "required",
};

describe("runtime shadow parity scaffold", () => {
  afterEach(() => {
    resetKillSwitch();
  });

  it("captures old authority outputs and new shadow artifacts on the same runtime cycle", async () => {
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const runtime = new DryRunRuntime(TEST_CONFIG, {
      loopIntervalMs: 20,
      cycleSummaryWriter,
    });

    await runtime.start();

    const summaries = await cycleSummaryWriter.list();
    expect(summaries).toHaveLength(1);

    const summary = summaries[0];
    expect(summary.mode).toBe("dry");
    expect(summary.decisionOccurred).toBe(true);
    expect(summary.decision).toBeDefined();
    expect(summary.shadowArtifactChain).toBeDefined();
    expect(summary.authorityArtifactChain).toBeDefined();

    const shadow = summary.shadowArtifactChain!;
    const authority = summary.authorityArtifactChain!;
    expect(shadow.artifactMode).toBe("shadow");
    expect(shadow.derivedOnly).toBe(true);
    expect(shadow.nonAuthoritative).toBe(true);
    expect(shadow.authorityInfluence).toBe(false);
    expect(shadow.canonicalDecisionHistory).toBe(false);
    expect(shadow.parity.oldAuthority.blocked).toBe(summary.blocked);
    expect(shadow.parity.oldAuthority.signalDirection).toBe(summary.decision?.direction);
    expect(shadow.parity.oldAuthority.signalConfidence).toBe(summary.decision?.confidence);
    expect(shadow.parity.oldAuthority.tradeIntentId).toBe(summary.tradeIntentId);
    expect(shadow.parity.shadowDerived).toHaveProperty("blocked");
    expect(shadow.parity.deltas).toHaveProperty("blockedMismatch");
    expect(authority.artifactMode).toBe("authority");
    expect(authority.derivedOnly).toBe(false);
    expect(authority.nonAuthoritative).toBe(false);
    expect(authority.authorityInfluence).toBe(true);
    expect(authority.canonicalDecisionHistory).toBe(false);
    expect(authority.decision.blocked).toBe(false);
    expect(authority.decision.direction).toBe("buy");
    expect(authority.artifacts.cqdHash).toMatch(/^[a-f0-9]{64}$/);

    await runtime.stop();
  });
});
