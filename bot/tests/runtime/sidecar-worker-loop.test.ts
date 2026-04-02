import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryJournalWriter } from "../../src/journal-writer/writer.js";
import { startSidecarWorkerLoop } from "../../src/runtime/sidecar/worker-loop.js";

describe("sidecar worker loop", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filters discovery output into the registry and journals candidates", async () => {
    const journalWriter = new InMemoryJournalWriter();
    const loop = startSidecarWorkerLoop({
      autoStart: false,
      journalWriter,
      discoveryIntervalMs: 60_000,
      monitorIntervalMs: 60_000,
      now: () => 1_717_171_717_000,
      runDiscoveryWorker: async () => ({
        candidates: [
          {
            token: "BONK",
            observationCompleteness: 0.82,
            monitorRecommendation: "monitor",
            evidenceRefs: ["ev-1"],
          },
          {
            token: "WIF",
            observationCompleteness: 0.69,
            monitorRecommendation: "monitor",
          },
          {
            token: "POPCAT",
            observationCompleteness: 0.9,
            monitorRecommendation: "ignore",
          },
        ],
      }),
    });

    const discovery = await loop.tickDiscovery();
    const active = loop.registry.getActiveCandidates(1_717_171_717_000);
    const entries = journalWriter.list();

    expect(discovery.map((candidate) => candidate.token)).toEqual(["BONK"]);
    expect(active.map((candidate) => candidate.token)).toEqual(["BONK"]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.stage).toBe("sidecar.discovery.candidate_ingestion");

    loop.stop();
  });

  it("runs the monitor only against active registry entries", async () => {
    const loop = startSidecarWorkerLoop({
      autoStart: false,
      discoveryIntervalMs: 60_000,
      monitorIntervalMs: 60_000,
      now: () => 2_000,
      runDiscoveryWorker: async () => ({
        candidates: [
          {
            token: "BONK",
            observationCompleteness: 0.88,
            monitorRecommendation: "monitor",
          },
        ],
      }),
    });

    await loop.tickDiscovery();
    const result = await loop.tickMonitor();

    expect(result.checkedCandidates).toBe(1);
    expect(result.emittedObservations[0]?.token).toBe("BONK");

    loop.stop();
  });

  it("fails closed with logging when discovery throws", async () => {
    const warn = vi.fn();
    const loop = startSidecarWorkerLoop({
      autoStart: false,
      discoveryIntervalMs: 60_000,
      monitorIntervalMs: 60_000,
      logger: { info: vi.fn(), warn, error: vi.fn() },
      runDiscoveryWorker: async () => {
        throw new Error("boom");
      },
    });

    const result = await loop.tickDiscovery();
    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalled();

    loop.stop();
  });
});
