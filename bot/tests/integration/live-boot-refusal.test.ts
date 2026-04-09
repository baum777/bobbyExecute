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
import { InMemoryKillSwitchRepository } from "../../src/persistence/kill-switch-repository.js";
import { InMemoryLiveControlRepository } from "../../src/persistence/live-control-repository.js";
import { InMemoryDailyLossRepository } from "../../src/persistence/daily-loss-repository.js";
import { InMemoryIdempotencyRepository, FileSystemIdempotencyRepository } from "../../src/persistence/idempotency-repository.js";
import { FileSystemKillSwitchRepository } from "../../src/persistence/kill-switch-repository.js";
import { FileSystemLiveControlRepository } from "../../src/persistence/live-control-repository.js";
import { FileSystemDailyLossRepository } from "../../src/persistence/daily-loss-repository.js";
import type { PersistedLiveControlState } from "../../src/persistence/live-control-repository.js";
import type { ExecutionReport, TradeIntent } from "../../src/core/contracts/trade.js";

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
    SIGNER_KEY_ID: "remote-key-1",
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

function dummyExecutionHandlerFactory() {
  return async () => async (intent: TradeIntent): Promise<ExecutionReport> => ({
    traceId: intent.traceId,
    timestamp: intent.timestamp,
    tradeIntentId: intent.idempotencyKey,
    success: true,
    txSignature: "sig-live-boot-refusal",
    actualAmountOut: "0.5",
    dryRun: false,
    executionMode: "live",
    paperExecution: false,
    failClosed: false,
    artifacts: {
      mode: "live",
      verification: { confirmed: true },
    },
  });
}

describe("live boot refusal", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let tempDir: string;

  beforeEach(async () => {
    originalEnv = process.env;
    process.env = { ...originalEnv, ...liveEnv() };
    resetConfigCache();
    tempDir = await mkdtemp(join(tmpdir(), "live-boot-refusal-"));
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
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("fails closed when live boot is wired to in-memory safety repositories", async () => {
    const config = parseConfig(process.env as Record<string, string | undefined>);

    await expect(
      createRuntime(config, {
        executionHandlerFactory: dummyExecutionHandlerFactory() as never,
        killSwitchRepository: new InMemoryKillSwitchRepository(),
        liveControlRepository: new InMemoryLiveControlRepository(),
        dailyLossRepository: new InMemoryDailyLossRepository(),
        idempotencyRepository: new InMemoryIdempotencyRepository(),
      })
    ).rejects.toThrow(/LIVE_BOOT_ABORTED_IN_MEMORY_SAFETY_REPOSITORY:kill-switch/);
  });

  it("fails closed when durable safety state is unavailable", async () => {
    const config = parseConfig(process.env as Record<string, string | undefined>);
    const killSwitchRepository = new FileSystemKillSwitchRepository(join(tempDir, "kill-switch.json"));
    const liveControlRepository = new FileSystemLiveControlRepository(join(tempDir, "live-control.json"));
    const dailyLossRepository = new FileSystemDailyLossRepository(join(tempDir, "daily-loss.json"));
    const idempotencyRepository = new FileSystemIdempotencyRepository(join(tempDir, "idempotency.json"));

    await expect(
      createRuntime(config, {
        executionHandlerFactory: dummyExecutionHandlerFactory() as never,
        killSwitchRepository,
        liveControlRepository,
        dailyLossRepository,
        idempotencyRepository,
      })
    ).rejects.toThrow(/LIVE_BOOT_ABORTED_DURABLE_STATE_UNAVAILABLE:kill-switch/);
  });

  it("fails closed when runtime policy authority is ambiguous", async () => {
    process.env.RUNTIME_POLICY_AUTHORITY = "yaml";
    const config = parseConfig(process.env as Record<string, string | undefined>);

    await expect(
      createRuntime(config, {
        executionHandlerFactory: dummyExecutionHandlerFactory() as never,
      })
    ).rejects.toThrow(/LIVE_BOOT_ABORTED_RUNTIME_POLICY_AMBIGUOUS/);
  });
});
