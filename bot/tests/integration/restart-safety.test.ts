import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
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
import { FileSystemKillSwitchRepository } from "../../src/persistence/kill-switch-repository.js";
import { FileSystemLiveControlRepository } from "../../src/persistence/live-control-repository.js";
import { FileSystemDailyLossRepository } from "../../src/persistence/daily-loss-repository.js";
import { FileSystemIdempotencyRepository } from "../../src/persistence/idempotency-repository.js";
import type { PersistedLiveControlState } from "../../src/persistence/live-control-repository.js";
import type { TradeIntent, ExecutionReport } from "../../src/core/contracts/trade.js";

function liveEnv(): Record<string, string | undefined> {
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

function initialLiveControlState(): PersistedLiveControlState {
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

describe("restart safety", () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let killSwitchRepo: FileSystemKillSwitchRepository;
  let liveControlRepo: FileSystemLiveControlRepository;
  let dailyLossRepo: FileSystemDailyLossRepository;
  let idempotencyRepo: FileSystemIdempotencyRepository;
  let executionIntent: TradeIntent | undefined;

  beforeEach(async () => {
    originalEnv = process.env;
    process.env = { ...originalEnv, ...liveEnv() };
    resetConfigCache();
    tempDir = await mkdtemp(join(tmpdir(), "restart-safety-"));

    killSwitchRepo = new FileSystemKillSwitchRepository(join(tempDir, "kill-switch.json"));
    liveControlRepo = new FileSystemLiveControlRepository(join(tempDir, "live-control.json"));
    dailyLossRepo = new FileSystemDailyLossRepository(join(tempDir, "daily-loss.json"));
    idempotencyRepo = new FileSystemIdempotencyRepository(join(tempDir, "idempotency.json"));

    killSwitchRepo.saveSync({ halted: false });
    liveControlRepo.saveSync(initialLiveControlState());
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

  it("restores halted, disarmed, manual rearm, daily loss, and idempotency state after restart", async () => {
    const executionHandlerFactory = vi.fn(async () => async (intent: TradeIntent): Promise<ExecutionReport> => {
      executionIntent = { ...intent };
      return {
        traceId: intent.traceId,
        timestamp: intent.timestamp,
        tradeIntentId: intent.idempotencyKey,
        success: true,
        txSignature: "sig-restart-safety",
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

    const runtime1 = await createRuntime(parseConfig(process.env as Record<string, string | undefined>), {
      executionHandlerFactory,
      ingestHandler: async () => ({
        market: {
          schema_version: "market.v1",
          traceId: "restart-trace",
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
          traceId: "restart-trace",
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
      loopIntervalMs: 20,
    });

    await runtime1.start();
    await runtime1.armLive("arm-for-restart");
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(executionHandlerFactory).toHaveBeenCalledTimes(1);
    expect(executionIntent).toBeDefined();
    expect(idempotencyRepo.hasSync(executionIntent!.idempotencyKey)).toBe(true);

    await runtime1.emergencyStop("halt-for-restart");

    const runtime2 = await createRuntime(parseConfig(process.env as Record<string, string | undefined>), {
      executionHandlerFactory,
      ingestHandler: async () => ({
        market: {
          schema_version: "market.v1",
          traceId: "restart-trace-2",
          timestamp: new Date().toISOString(),
          source: "dexpaprika",
          poolId: "pool-2",
          baseToken: "SOL",
          quoteToken: "USDC",
          priceUsd: 151,
          volume24h: 1000,
          liquidity: 1_000_000,
          freshnessMs: 0,
          status: "ok",
        },
        wallet: {
          traceId: "restart-trace-2",
          timestamp: new Date().toISOString(),
          source: "rpc",
          walletAddress: "11111111111111111111111111111111",
          balances: [
            {
              mint: "So11111111111111111111111111111111111111112",
              symbol: "SOL",
              decimals: 9,
              amount: "1",
              amountUsd: 151,
            },
          ],
          totalUsd: 100,
        },
      }),
      killSwitchRepository: killSwitchRepo,
      liveControlRepository: liveControlRepo,
      dailyLossRepository: dailyLossRepo,
      idempotencyRepository: idempotencyRepo,
      loopIntervalMs: 20,
    });

    const snapshot = runtime2.getSnapshot();
    expect(snapshot.liveControl?.killSwitchActive).toBe(true);
    expect(snapshot.liveControl?.stopped).toBe(true);
    expect(snapshot.liveControl?.disarmed).toBe(true);
    expect(snapshot.liveControl?.manualRearmRequired).toBe(true);
    expect(snapshot.liveControl?.counters.dailyLossUsd).toBeGreaterThan(0);
    expect(killSwitchRepo.loadSync()?.halted).toBe(true);
    expect(dailyLossRepo.loadSync()?.lossUsd).toBeGreaterThan(0);
    expect(idempotencyRepo.hasSync(executionIntent!.idempotencyKey)).toBe(true);

    await runtime1.stop();
    await runtime2.stop();
  });
});
