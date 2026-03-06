/**
 * Wave 4: Metrics persistence - persistMetricsSnapshot, loadMetricsHistory.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  recordLatency,
  persistMetricsSnapshot,
  loadMetricsHistory,
  getAllP95,
} from "../../src/observability/metrics.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Metrics persistence (Wave 4)", () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "metrics-"));
    filePath = join(tmpDir, "metrics.jsonl");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("persistMetricsSnapshot writes snapshot with p95", async () => {
    recordLatency("adapter", 10);
    recordLatency("adapter", 20);
    recordLatency("adapter", 100);

    await persistMetricsSnapshot(filePath);

    const hist = await loadMetricsHistory(filePath);
    expect(hist.length).toBe(1);
    expect(hist[0].p95).toBeDefined();
    expect(typeof hist[0].p95.adapter).toBe("number");
  });

  it("loadMetricsHistory returns empty when file missing", async () => {
    const hist = await loadMetricsHistory(join(tmpDir, "nonexistent.jsonl"));
    expect(hist).toEqual([]);
  });

  it("getAllP95 returns recorded buckets", () => {
    recordLatency("x", 5);
    recordLatency("x", 15);
    const p95 = getAllP95();
    expect(p95.x).toBeDefined();
  });
});
