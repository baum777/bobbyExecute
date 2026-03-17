import { afterEach, describe, expect, it, vi } from "vitest";
import { DryRunRuntime } from "../../src/runtime/dry-run-runtime.js";
import { resetKillSwitch, triggerKillSwitch } from "../../src/governance/kill-switch.js";
import type { Config } from "../../src/config/config-schema.js";

const TEST_CONFIG: Config = {
  nodeEnv: "test",
  dryRun: true,
  tradingEnabled: false,
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

describe("DryRunRuntime (phase-2)", () => {
  afterEach(() => {
    resetKillSwitch();
  });

  it("fails closed when kill switch is active", async () => {
    const run = vi
      .fn()
      .mockResolvedValue({ stage: "monitor", traceId: "x", timestamp: new Date().toISOString() });
    const runtime = new DryRunRuntime(TEST_CONFIG, {
      engine: { run } as never,
      loopIntervalMs: 10,
    });

    triggerKillSwitch("test");
    await runtime.start();

    expect(run).not.toHaveBeenCalled();
    expect(runtime.getLastState()?.blocked).toBe(true);
    expect(runtime.getLastState()?.blockedReason).toBe("RUNTIME_PHASE2_KILL_SWITCH_HALTED");

    await runtime.stop();
  });

  it("prevents overlapping cycles when engine run is still in-flight", async () => {
    let releaseSecondRun: (() => void) | null = null;
    let calls = 0;

    const run = vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return { stage: "monitor", traceId: "first", timestamp: new Date().toISOString() };
      }
      if (calls === 2) {
        await new Promise<void>((resolve) => {
          releaseSecondRun = resolve;
        });
      }
      return { stage: "monitor", traceId: `call-${calls}`, timestamp: new Date().toISOString() };
    });

    const runtime = new DryRunRuntime(TEST_CONFIG, {
      engine: { run } as never,
      loopIntervalMs: 5,
    });

    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(run).toHaveBeenCalledTimes(2);

    releaseSecondRun?.();
    await new Promise((resolve) => setTimeout(resolve, 10));

    await runtime.stop();
  });

  it("fails closed and throws when initial cycle errors", async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const runtime = new DryRunRuntime(TEST_CONFIG, {
      engine: { run: vi.fn().mockRejectedValue(new Error("runtime-ingest-failed")) } as never,
      loopIntervalMs: 10,
      logger,
    });

    await expect(runtime.start()).rejects.toThrow("runtime-ingest-failed");
    expect(runtime.getStatus()).toBe("error");
    expect(logger.error).toHaveBeenCalled();

    await runtime.stop();
  });

  it("transitions to error if a scheduled cycle fails", async () => {
    let calls = 0;
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const runtime = new DryRunRuntime(TEST_CONFIG, {
      engine: {
        run: vi.fn().mockImplementation(async () => {
          calls += 1;
          if (calls > 1) throw new Error("scheduled-cycle-failed");
          return { stage: "monitor", traceId: "ok", timestamp: new Date().toISOString() };
        }),
      } as never,
      loopIntervalMs: 5,
      logger,
    });

    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(runtime.getStatus()).toBe("error");
    expect(logger.error).toHaveBeenCalled();

    await runtime.stop();
  });

});
