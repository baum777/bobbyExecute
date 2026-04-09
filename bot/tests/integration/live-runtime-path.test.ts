import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRuntime } from "../../src/runtime/create-runtime.js";
import { parseConfig } from "../../src/config/config-schema.js";
import { resetConfigCache } from "../../src/config/load-config.js";
import { resetKillSwitch, configureKillSwitchRepository } from "../../src/governance/kill-switch.js";
import { resetDailyLossState, configureDailyLossRepository } from "../../src/governance/daily-loss-tracker.js";
import {
  resetMicroLiveControlForTests,
  configureLiveControlRepository,
} from "../../src/runtime/live-control.js";
import {
  FileSystemKillSwitchRepository,
  InMemoryKillSwitchRepository,
} from "../../src/persistence/kill-switch-repository.js";
import {
  FileSystemLiveControlRepository,
  InMemoryLiveControlRepository,
} from "../../src/persistence/live-control-repository.js";
import {
  FileSystemDailyLossRepository,
  InMemoryDailyLossRepository,
} from "../../src/persistence/daily-loss-repository.js";
import {
  FileSystemIdempotencyRepository,
  InMemoryIdempotencyRepository,
} from "../../src/persistence/idempotency-repository.js";
import { InMemoryRuntimeCycleSummaryWriter } from "../../src/persistence/runtime-cycle-summary-repository.js";
import type { PersistedLiveControlState } from "../../src/persistence/live-control-repository.js";
import type { TradeIntent, ExecutionReport } from "../../src/core/contracts/trade.js";

function liveConfigEnv(): Record<string, string | undefined> {
  return {
    NODE_ENV: "test",
    LIVE_TRADING: "true",
    DRY_RUN: "false",
    RPC_MODE: "real",
    TRADING_ENABLED: "true",
    LIVE_TEST_MODE: "true",
    DISCOVERY_PROVIDER: "dexscreener",
    MARKET_DATA_PROVIDER: "dexpaprika",
    STREAMING_PROVIDER: "dexpaprika",
    MORALIS_ENABLED: "false",
    WALLET_ADDRESS: "11111111111111111111111111111111",
    CONTROL_TOKEN: "phase10-live-control-token",
    OPERATOR_READ_TOKEN: "phase10-live-operator-token",
    JUPITER_API_KEY: "phase10-jupiter-api-key",
    SIGNER_MODE: "remote",
    SIGNER_URL: "https://signer.example.com/sign",
    SIGNER_AUTH_TOKEN: "phase10-signer-auth-token",
    JOURNAL_PATH: "data/journal.jsonl",
    RUNTIME_POLICY_AUTHORITY: "ts-env",
    RPC_URL: "https://api.mainnet-beta.solana.com",
  };
}

function makeLiveControlState(): PersistedLiveControlState {
  return {
    armed: false,
    blocked: false,
    degraded: false,
    manualRearmRequired: false,
    roundStatus: "idle",
    inFlight: 0,
    recentTradeAtMs: [],
    recentFailureAtMs: [],
    dailyNotional: 0,
    dailyKey: new Date().toISOString().slice(0, 10),
  };
}

async function removeDirectoryWithRetry(path: string, attempts = 5): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      const retryable = code === "ENOTEMPTY" || code === "EBUSY" || code === "EPERM";
      if (!retryable || attempt === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

describe("live runtime path", () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let killSwitchRepo: FileSystemKillSwitchRepository;
  let liveControlRepo: FileSystemLiveControlRepository;
  let dailyLossRepo: FileSystemDailyLossRepository;
  let idempotencyRepo: FileSystemIdempotencyRepository;

  beforeEach(async () => {
    originalEnv = process.env;
    process.env = { ...originalEnv, ...liveConfigEnv() };
    resetConfigCache();
    tempDir = await mkdtemp(join(tmpdir(), "live-runtime-path-"));

    killSwitchRepo = new FileSystemKillSwitchRepository(join(tempDir, "kill-switch.json"));
    liveControlRepo = new FileSystemLiveControlRepository(join(tempDir, "live-control.json"));
    dailyLossRepo = new FileSystemDailyLossRepository(join(tempDir, "daily-loss.json"));
    idempotencyRepo = new FileSystemIdempotencyRepository(join(tempDir, "idempotency.json"));

    killSwitchRepo.saveSync({ halted: false });
    liveControlRepo.saveSync(makeLiveControlState());
    dailyLossRepo.saveSync({ dateKey: new Date().toISOString().slice(0, 10), tradesCount: 0, lossUsd: 0 });
    idempotencyRepo.saveSync([]);
  });

  afterEach(async () => {
    resetKillSwitch();
    resetDailyLossState();
    resetMicroLiveControlForTests();
    configureKillSwitchRepository(undefined);
    configureDailyLossRepository(undefined);
    configureLiveControlRepository(undefined);
    resetConfigCache();
    process.env = originalEnv;
    await removeDirectoryWithRetry(tempDir);
  });

  it("selects live runtime and invokes the execution handler", async () => {
    const executionCalls: TradeIntent[] = [];
    const cycleSummaryWriter = new InMemoryRuntimeCycleSummaryWriter();
    const executionHandlerFactory = vi.fn(async () => async (intent: TradeIntent): Promise<ExecutionReport> => {
      executionCalls.push({ ...intent });
      return {
        traceId: intent.traceId,
        timestamp: intent.timestamp,
        tradeIntentId: intent.idempotencyKey,
        success: true,
        txSignature: "sig-live-runtime",
        actualAmountOut: "0.5",
        dryRun: false,
        executionMode: "live",
        paperExecution: false,
        failClosed: false,
        artifacts: {
          mode: "live",
          verification: { confirmed: true },
        },
      };
    });

    const runtime = await createRuntime(parseConfig(process.env as Record<string, string | undefined>), {
      executionHandlerFactory,
      ingestHandler: async () => ({
        market: {
          schema_version: "market.v1",
          traceId: "live-trace",
          timestamp: new Date().toISOString(),
          source: "dexpaprika",
          poolId: "pool-1",
          baseToken: "SOL",
          quoteToken: "USDC",
          priceUsd: 150,
          volume24h: 1000,
          liquidity: 1_000_000,
          freshnessMs: 0,
          status: "ok",
        },
        wallet: {
          traceId: "live-trace",
          timestamp: new Date().toISOString(),
          source: "rpc",
          walletAddress: "11111111111111111111111111111111",
          balances: [
            {
              mint: "So11111111111111111111111111111111111111112",
              symbol: "SOL",
              decimals: 9,
              amount: "1",
              amountUsd: 150,
            },
          ],
          totalUsd: 100,
        },
      }),
      killSwitchRepository: killSwitchRepo,
      liveControlRepository: liveControlRepo,
      dailyLossRepository: dailyLossRepo,
      idempotencyRepository: idempotencyRepo,
      cycleSummaryWriter,
      paperMarketAdapters: [
        {
          id: "bad-paper-adapter",
          fetch: async () => {
            throw new Error("paper runtime should not be selected");
          },
        },
      ] as never,
      loopIntervalMs: 20,
    });

    await runtime.start();
    await runtime.armLive("test-arm");
    await new Promise((resolve) => setTimeout(resolve, 300));
    await runtime.stop();

    expect(executionHandlerFactory).toHaveBeenCalledTimes(1);
    expect(executionCalls.length).toBeGreaterThan(0);
    expect(runtime.getSnapshot().mode).toBe("live");
    expect(runtime.getSnapshot().paperModeActive).toBe(false);
    expect(runtime.getSnapshot().counters.executionCount).toBeGreaterThan(0);

    const summaries = await cycleSummaryWriter.list(10);
    expect(summaries.length).toBeGreaterThan(0);
    const summary = summaries[summaries.length - 1];
    expect(summary.mode).toBe("live");
    expect(summary.decisionOccurred).toBe(true);
    expect(summary.shadowArtifactChain).toBeDefined();
    expect(summary.shadowArtifactChain?.artifactMode).toBe("shadow");
    expect(summary.shadowArtifactChain?.derivedOnly).toBe(true);
    expect(summary.shadowArtifactChain?.nonAuthoritative).toBe(true);
    expect(summary.shadowArtifactChain?.authorityInfluence).toBe(false);
    expect(summary.shadowArtifactChain?.parity.oldAuthority.tradeIntentId).toBe(summary.tradeIntentId);
    expect(summary.authorityArtifactChain).toBeDefined();
    expect(summary.authorityArtifactChain?.artifactMode).toBe("authority");
    expect(summary.authorityArtifactChain?.derivedOnly).toBe(false);
    expect(summary.authorityArtifactChain?.authorityInfluence).toBe(true);
    expect(summary.authorityArtifactChain?.decision.blocked).toBe(false);
    expect(summary.provenance?.reasonClass).toBe(summary.decisionEnvelope?.reasonClass);
    expect(summary.provenance?.evidenceRef).toEqual(summary.decisionEnvelope?.evidenceRef);
  });
});
