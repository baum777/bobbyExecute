import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config/config-schema.js";
import { Engine } from "../../src/core/engine.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { InMemoryJournalWriter } from "../../src/journal-writer/writer.js";
import { InMemoryIncidentRepository } from "../../src/persistence/incident-repository.js";
import { InMemoryRuntimeCycleSummaryWriter } from "../../src/persistence/runtime-cycle-summary-repository.js";
import { RepositoryIncidentRecorder } from "../../src/observability/incidents.js";
import { DryRunRuntime } from "../../src/runtime/dry-run-runtime.js";
import {
  buildDecisionEnvelopeFixtureSet,
  decisionEnvelopeSemantics,
  makeEnvelopeRelayCoordinator,
} from "../fixtures/decision-envelope.fixtures.js";

function makePaperRuntimeConfig(walletAddress: string): Config {
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
    walletAddress,
    journalPath: "data/journal.jsonl",
    circuitBreakerFailureThreshold: 5,
    circuitBreakerRecoveryMs: 60_000,
    maxSlippagePercent: 5,
    reviewPolicyMode: "required",
  };
}

describe("decision envelope convergence", () => {
  it("keeps allow semantics convergent across engine, orchestrator, and runtime replay", async () => {
    const fixtures = await buildDecisionEnvelopeFixtureSet();
    const expectedSemantics = decisionEnvelopeSemantics(fixtures.allowEnvelope);

    const engineExecute = vi.fn(async () => fixtures.executionReport);
    const engineVerify = vi.fn(async () => fixtures.rpcVerificationReport);
    const engine = new Engine({
      clock: fixtures.clock,
      dryRun: true,
      decisionCoordinator: makeEnvelopeRelayCoordinator(fixtures.allowEnvelope),
      journalWriter: new InMemoryJournalWriter(),
    });

    const engineState = await engine.run(
      async () => ({ market: fixtures.market, wallet: fixtures.wallet }),
      async () => fixtures.signal,
      async () => ({ allowed: true }),
      engineExecute,
      engineVerify
    );

    expect(decisionEnvelopeSemantics(engineState.decisionEnvelope)).toEqual(expectedSemantics);
    expect(engineState.decisionEnvelope?.entrypoint).toBe("engine");
    expect(engineState.decisionEnvelope?.flow).toBe("trade");
    expect(engineState.blocked).toBe(false);
    expect(engineExecute).toHaveBeenCalledTimes(1);
    expect(engineVerify).toHaveBeenCalledTimes(1);

    const orchestrator = new Orchestrator({
      clock: fixtures.clock,
      dryRun: true,
      decisionCoordinator: makeEnvelopeRelayCoordinator(fixtures.allowEnvelope),
    });
    const orchestratorState = await orchestrator.run(
      {
        traceId: fixtures.traceId,
        timestamp: fixtures.timestamp,
        idempotencyKey: fixtures.tradeIntent.idempotencyKey,
        targetPairs: ["SOL/USDC"],
        dryRun: true,
      },
      async () => fixtures.signalPack
    );

    expect(decisionEnvelopeSemantics(orchestratorState.decisionEnvelope)).toEqual(expectedSemantics);
    expect(orchestratorState.decisionEnvelope?.entrypoint).toBe("orchestrator");
    expect(orchestratorState.decisionEnvelope?.flow).toBe("analysis");

    const runtimeCycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const runtimeIncidentRecorder = new RepositoryIncidentRecorder(new InMemoryIncidentRepository());
    const runtime = new DryRunRuntime(makePaperRuntimeConfig(fixtures.wallet.walletAddress), {
      clock: fixtures.clock,
      decisionCoordinator: makeEnvelopeRelayCoordinator(fixtures.allowEnvelope),
      fetchMarketDataFn: vi.fn().mockResolvedValue(fixtures.market),
      paperMarketAdapters: [{ id: "dexpaprika", fetch: vi.fn() }],
      fetchPaperWalletSnapshot: vi.fn().mockResolvedValue(fixtures.wallet),
      cycleSummaryWriter: runtimeCycleSummaryWriter,
      incidentRecorder: runtimeIncidentRecorder,
      journalWriter: new InMemoryJournalWriter(),
    });

    try {
      await runtime.start();
      const runtimeState = runtime.getLastState();
      const replay = await runtime.getCycleReplay(runtimeState?.traceId ?? "");

      expect(decisionEnvelopeSemantics(runtimeState?.decisionEnvelope)).toEqual(expectedSemantics);
      expect(runtimeState?.decisionEnvelope?.entrypoint).toBe("engine");
      expect(runtimeState?.decisionEnvelope?.flow).toBe("trade");
      expect(replay?.summary).toEqual(runtime.getSnapshot().lastCycleSummary);
      expect(replay?.summary.provenance?.reasonClass).toBe(runtimeState?.decisionEnvelope?.reasonClass);
      expect(replay?.summary.provenance?.evidenceRef).toEqual(runtimeState?.decisionEnvelope?.evidenceRef);
      expect(replay?.summary.blocked).toBe(false);
      expect(replay?.summary.blockedReason).toBeUndefined();
      expect(replay?.summary.decision?.allowed).toBe(true);
      expect(replay?.summary.executionOccurred).toBe(true);
      expect(replay?.summary.verificationOccurred).toBe(true);
    } finally {
      await runtime.stop();
    }
  });

  it("keeps deny semantics convergent across engine, orchestrator, and runtime replay", async () => {
    const fixtures = await buildDecisionEnvelopeFixtureSet();
    const expectedSemantics = decisionEnvelopeSemantics(fixtures.denyEnvelope);

    const engineExecute = vi.fn();
    const engineVerify = vi.fn();
    const engine = new Engine({
      clock: fixtures.clock,
      dryRun: true,
      decisionCoordinator: makeEnvelopeRelayCoordinator(fixtures.denyEnvelope),
      journalWriter: new InMemoryJournalWriter(),
    });

    const engineState = await engine.run(
      async () => ({ market: fixtures.market, wallet: fixtures.wallet }),
      async () => fixtures.signal,
      async () => ({ allowed: false, reason: fixtures.denyEnvelope.blockedReason }),
      engineExecute,
      engineVerify
    );

    expect(decisionEnvelopeSemantics(engineState.decisionEnvelope)).toEqual(expectedSemantics);
    expect(engineState.decisionEnvelope?.entrypoint).toBe("engine");
    expect(engineState.decisionEnvelope?.flow).toBe("trade");
    expect(engineState.blocked).toBe(true);
    expect(engineState.blockedReason).toBe(fixtures.denyEnvelope.blockedReason);
    expect(engineExecute).not.toHaveBeenCalled();
    expect(engineVerify).not.toHaveBeenCalled();

    const orchestrator = new Orchestrator({
      clock: fixtures.clock,
      dryRun: true,
      decisionCoordinator: makeEnvelopeRelayCoordinator(fixtures.denyEnvelope),
    });
    const orchestratorState = await orchestrator.run(
      {
        traceId: fixtures.traceId,
        timestamp: fixtures.timestamp,
        idempotencyKey: fixtures.tradeIntent.idempotencyKey,
        targetPairs: ["SOL/USDC"],
        dryRun: true,
      },
      async () => fixtures.signalPack
    );

    expect(decisionEnvelopeSemantics(orchestratorState.decisionEnvelope)).toEqual(expectedSemantics);
    expect(orchestratorState.decisionEnvelope?.entrypoint).toBe("orchestrator");
    expect(orchestratorState.decisionEnvelope?.flow).toBe("analysis");

    const runtimeCycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const runtimeIncidentRecorder = new RepositoryIncidentRecorder(new InMemoryIncidentRepository());
    const runtime = new DryRunRuntime(makePaperRuntimeConfig(fixtures.wallet.walletAddress), {
      clock: fixtures.clock,
      decisionCoordinator: makeEnvelopeRelayCoordinator(fixtures.denyEnvelope),
      fetchMarketDataFn: vi.fn().mockResolvedValue(fixtures.market),
      paperMarketAdapters: [{ id: "dexpaprika", fetch: vi.fn() }],
      fetchPaperWalletSnapshot: vi.fn().mockResolvedValue(fixtures.wallet),
      cycleSummaryWriter: runtimeCycleSummaryWriter,
      incidentRecorder: runtimeIncidentRecorder,
      journalWriter: new InMemoryJournalWriter(),
    });

    try {
      await runtime.start();
      const runtimeState = runtime.getLastState();
      const replay = await runtime.getCycleReplay(runtimeState?.traceId ?? "");

      expect(decisionEnvelopeSemantics(runtimeState?.decisionEnvelope)).toEqual(expectedSemantics);
      expect(runtimeState?.decisionEnvelope?.entrypoint).toBe("engine");
      expect(runtimeState?.decisionEnvelope?.flow).toBe("trade");
      expect(replay?.summary).toEqual(runtime.getSnapshot().lastCycleSummary);
      expect(replay?.summary.provenance?.reasonClass).toBe(runtimeState?.decisionEnvelope?.reasonClass);
      expect(replay?.summary.provenance?.evidenceRef).toEqual(runtimeState?.decisionEnvelope?.evidenceRef);
      expect(replay?.summary.blocked).toBe(true);
      expect(replay?.summary.blockedReason).toBe(fixtures.denyEnvelope.blockedReason);
      expect(replay?.summary.decision?.allowed).toBe(false);
      expect(replay?.summary.decision?.reason).toBe(fixtures.denyEnvelope.blockedReason);
      expect(replay?.summary.executionOccurred).toBe(false);
      expect(replay?.summary.verificationOccurred).toBe(false);
    } finally {
      await runtime.stop();
    }
  });
});
