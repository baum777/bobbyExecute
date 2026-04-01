/**
 * M7: Idempotency Store tests.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { InMemoryIdempotencyStore } from "@bot/storage/inmemory-kv.js";
import { Orchestrator } from "@bot/core/orchestrator.js";
import { FakeClock } from "@bot/core/clock.js";
import { IDEMPOTENCY_REPLAY_BLOCK } from "@bot/storage/idempotency-store.js";

describe("InMemoryIdempotencyStore", () => {
  it("has returns false for unknown key", async () => {
    const store = new InMemoryIdempotencyStore();
    expect(await store.has("key1")).toBe(false);
  });

  it("has returns true after put", async () => {
    const store = new InMemoryIdempotencyStore();
    await store.put("key1", { x: 1 });
    expect(await store.has("key1")).toBe(true);
  });

  it("has returns false after TTL expiry", async () => {
    const store = new InMemoryIdempotencyStore();
    await store.put("key1", {}, 10);
    await new Promise((r) => setTimeout(r, 20));
    expect(await store.has("key1")).toBe(false);
  });
});

describe("Orchestrator idempotency gate", () => {
  const ts = "2026-03-05T12:00:00.000Z";
  const fixedIdemKey = "idem-test-001";
  const intentSpec = {
    traceId: "t1",
    timestamp: ts,
    idempotencyKey: fixedIdemKey,
    targetPairs: ["SOL/USDC"],
    dryRun: false,
  };

  const signalPack = () => ({
    traceId: "orch-trace",
    timestamp: ts,
    signals: [
      { source: "dexscreener", timestamp: ts, baseToken: "SOL", quoteToken: "USDC", priceUsd: 100 },
      { source: "paprika", timestamp: ts, baseToken: "SOL", quoteToken: "USDC", priceUsd: 100 },
    ],
    dataQuality: {
      completeness: 0.95,
      freshness: 0.95,
      sourceReliability: 1,
      crossSourceConfidence: 0.9,
    },
    sources: ["dexscreener", "paprika"],
  });

  beforeEach(() => {
    process.env.REPLAY_MODE = "true";
  });
  afterEach(() => {
    delete process.env.REPLAY_MODE;
  });

  it("blocks duplicate execution when key exists in store", async () => {
    const store = new InMemoryIdempotencyStore();
    await store.put(fixedIdemKey, { ran: true });
    expect(await store.has(fixedIdemKey)).toBe(true);

    const clock = new FakeClock(ts);
    const orch = new Orchestrator({
      dryRun: false,
      idempotencyStore: store,
      clock,
    });

    let execCount = 0;
    const research = async () => signalPack();
    const focusedTx = async () => {
      execCount++;
    };
    const secretsVault = async () => ({ ttlSeconds: 300 });

    await expect(
      orch.run(intentSpec, research, secretsVault, focusedTx)
    ).rejects.toThrow(IDEMPOTENCY_REPLAY_BLOCK);
    expect(execCount).toBe(0);
  });
});
