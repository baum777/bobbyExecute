import { describe, expect, it } from "vitest";
import { FakeClock } from "../../src/core/clock.js";
import { createDecisionCoordinator } from "../../src/core/decision/index.js";

describe("decision entrypoint equivalence", () => {
  it("keeps canonical hashes stable across entrypoints when handler outputs match", async () => {
    const coordinator = createDecisionCoordinator();
    const clock = new FakeClock("2026-03-17T12:00:00.000Z");

    const runs = await Promise.all(
      [
        { entrypoint: "engine", prefix: "trace" },
        { entrypoint: "orchestrator", prefix: "orch" },
        { entrypoint: "dry-runtime", prefix: "runtime" },
        { entrypoint: "live-runtime", prefix: "runtime" },
      ].map((item) =>
        coordinator.run({
          entrypoint: item.entrypoint as "engine" | "orchestrator" | "dry-runtime" | "live-runtime",
          flow: "trade",
          executionMode: "dry",
          clock,
          traceIdSeed: "shared-seed",
          tracePrefix: item.prefix,
          handlers: {
            ingest: async () => ({
              payload: { ingest: "ok" },
              sources: ["fixture:ingest"],
              freshness: { marketAgeMs: 0, walletAgeMs: 0, maxAgeMs: 60_000, observedAt: clock.now().toISOString() },
              evidenceRef: {},
            }),
            signal: async () => ({
              payload: { signal: "ok" },
              sources: ["fixture:ingest", "fixture:signal"],
              freshness: { marketAgeMs: 0, walletAgeMs: 0, maxAgeMs: 60_000, observedAt: clock.now().toISOString() },
              evidenceRef: {},
            }),
            risk: async () => ({
              payload: { risk: "ok" },
              sources: ["fixture:ingest", "fixture:signal", "fixture:risk"],
              freshness: { marketAgeMs: 0, walletAgeMs: 0, maxAgeMs: 60_000, observedAt: clock.now().toISOString() },
              evidenceRef: {},
            }),
            execute: async () => ({
              payload: { execute: "ok" },
              sources: ["fixture:ingest", "fixture:signal", "fixture:risk", "fixture:execute"],
              freshness: { marketAgeMs: 0, walletAgeMs: 0, maxAgeMs: 60_000, observedAt: clock.now().toISOString() },
              evidenceRef: {},
            }),
            verify: async () => ({
              payload: { verify: "ok" },
              sources: ["fixture:ingest", "fixture:signal", "fixture:risk", "fixture:execute", "fixture:verify"],
              freshness: { marketAgeMs: 0, walletAgeMs: 0, maxAgeMs: 60_000, observedAt: clock.now().toISOString() },
              evidenceRef: {},
            }),
            journal: async () => ({
              payload: { journal: "ok" },
              sources: ["fixture:ingest", "fixture:signal", "fixture:risk", "fixture:execute", "fixture:verify", "fixture:journal"],
              freshness: { marketAgeMs: 0, walletAgeMs: 0, maxAgeMs: 60_000, observedAt: clock.now().toISOString() },
              evidenceRef: {},
            }),
            monitor: async () => ({
              payload: { monitor: "ok" },
              sources: ["fixture:ingest", "fixture:signal", "fixture:risk", "fixture:execute", "fixture:verify", "fixture:journal", "fixture:monitor"],
              freshness: { marketAgeMs: 0, walletAgeMs: 0, maxAgeMs: 60_000, observedAt: clock.now().toISOString() },
              evidenceRef: {},
            }),
          },
        })
      )
    );

    expect(runs.every((run) => run.blocked === false)).toBe(true);
    expect(new Set(runs.map((run) => run.decisionHash)).size).toBe(1);
    expect(new Set(runs.map((run) => run.resultHash)).size).toBe(1);
  });
});
