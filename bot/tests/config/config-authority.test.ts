import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRuntime } from "../../src/runtime/create-runtime.js";
import { parseConfig } from "../../src/config/config-schema.js";
import { loadConfig, resetConfigCache } from "../../src/config/load-config.js";
import { FileSystemKillSwitchRepository } from "../../src/persistence/kill-switch-repository.js";
import { FileSystemLiveControlRepository } from "../../src/persistence/live-control-repository.js";
import { FileSystemDailyLossRepository } from "../../src/persistence/daily-loss-repository.js";
import { FileSystemIdempotencyRepository } from "../../src/persistence/idempotency-repository.js";
import { FileSystemJournalWriter } from "../../src/journal-writer/writer.js";
import type { PersistedLiveControlState } from "../../src/persistence/live-control-repository.js";
import type { ExecutionReport, TradeIntent } from "../../src/core/contracts/trade.js";

function baseEnv(): Record<string, string | undefined> {
  return {
    NODE_ENV: "test",
    LIVE_TRADING: "true",
    DRY_RUN: "false",
    RPC_MODE: "real",
    TRADING_ENABLED: "true",
    LIVE_TEST_MODE: "true",
    WALLET_ADDRESS: "11111111111111111111111111111111",
    CONTROL_TOKEN: "phase10-live-control-token",
    OPERATOR_READ_TOKEN: "phase10-live-operator-token",
    MORALIS_API_KEY: "phase10-moralis-api-key",
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

function writeDurableSafetyState(baseDir: string): void {
  new FileSystemKillSwitchRepository(join(baseDir, "kill-switch.json")).saveSync({ halted: false });
  new FileSystemLiveControlRepository(join(baseDir, "live-control.json")).saveSync(makeLiveControlState());
  new FileSystemDailyLossRepository(join(baseDir, "daily-loss.json")).saveSync({
    dateKey: new Date().toISOString().slice(0, 10),
    tradesCount: 0,
    lossUsd: 0,
  });
  new FileSystemIdempotencyRepository(join(baseDir, "idempotency.json")).saveSync([]);
}

function createExecutionHandlerFactory() {
  return async () => async (intent: TradeIntent): Promise<ExecutionReport> => ({
    traceId: intent.traceId,
    timestamp: intent.timestamp,
    tradeIntentId: intent.idempotencyKey,
    success: true,
    txSignature: "sig-config-authority",
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

describe("config authority", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let tempDir: string;

  beforeEach(async () => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    resetConfigCache();
    tempDir = await mkdtemp(join(tmpdir(), "config-authority-"));
  });

  afterEach(async () => {
    resetConfigCache();
    process.env = originalEnv;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("ts-env authority changes runtime behavior", async () => {
    process.env = { ...originalEnv, ...baseEnv(), RUNTIME_POLICY_AUTHORITY: "ts-env" };
    writeDurableSafetyState(tempDir);

    const config = loadConfig(process.env as Record<string, string | undefined>);
    expect(config.runtimePolicyAuthority).toBe("ts-env");
    expect(config.executionMode).toBe("live");

    const runtime = await createRuntime(config, {
      executionHandlerFactory: createExecutionHandlerFactory() as never,
      journalWriter: new FileSystemJournalWriter(join(tempDir, "journal.jsonl"), { autoStartPeriodicFlush: false }),
      killSwitchRepository: new FileSystemKillSwitchRepository(join(tempDir, "kill-switch.json")),
      liveControlRepository: new FileSystemLiveControlRepository(join(tempDir, "live-control.json")),
      dailyLossRepository: new FileSystemDailyLossRepository(join(tempDir, "daily-loss.json")),
      idempotencyRepository: new FileSystemIdempotencyRepository(join(tempDir, "idempotency.json")),
    });

    expect(runtime.getSnapshot().mode).toBe("live");
    expect(runtime.getSnapshot().paperModeActive).toBe(false);
  });

  it("yaml authority is rejected", async () => {
    process.env = { ...originalEnv, ...baseEnv(), RUNTIME_POLICY_AUTHORITY: "yaml" };
    const config = parseConfig(process.env as Record<string, string | undefined>);

    await expect(
      createRuntime(config, {
        executionHandlerFactory: createExecutionHandlerFactory() as never,
      })
    ).rejects.toThrow(/LIVE_BOOT_ABORTED_RUNTIME_POLICY_AMBIGUOUS/);
  });

  it("yaml reads do not affect boot when ts-env is authoritative", async () => {
    process.env = { ...originalEnv, ...baseEnv(), RUNTIME_POLICY_AUTHORITY: "ts-env" };
    writeDurableSafetyState(tempDir);

    const yamlPath = join(process.cwd(), "src", "config", "guardrails.yaml");
    const originalYaml = readFileSync(yamlPath, "utf8");
    writeFileSync(yamlPath, "this: is: intentionally: invalid: yaml\n", "utf8");

    try {
      const config = loadConfig(process.env as Record<string, string | undefined>);
      const runtime = await createRuntime(config, {
        executionHandlerFactory: createExecutionHandlerFactory() as never,
        journalWriter: new FileSystemJournalWriter(join(tempDir, "journal.jsonl"), { autoStartPeriodicFlush: false }),
        killSwitchRepository: new FileSystemKillSwitchRepository(join(tempDir, "kill-switch.json")),
        liveControlRepository: new FileSystemLiveControlRepository(join(tempDir, "live-control.json")),
        dailyLossRepository: new FileSystemDailyLossRepository(join(tempDir, "daily-loss.json")),
        idempotencyRepository: new FileSystemIdempotencyRepository(join(tempDir, "idempotency.json")),
      });

      expect(runtime.getSnapshot().mode).toBe("live");
    } finally {
      writeFileSync(yamlPath, originalYaml, "utf8");
    }
  });
});
