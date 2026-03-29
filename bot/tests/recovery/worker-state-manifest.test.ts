import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { inspectWorkerDiskRecovery } from "../../src/recovery/worker-state-manifest.js";

async function writeFileIfNeeded(path: string, content = "{}\n"): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function writeValidBootState(baseDir: string): Promise<void> {
  await writeFileIfNeeded(join(baseDir, "journal.kill-switch.json"), JSON.stringify({ halted: false }));
  await writeFileIfNeeded(
    join(baseDir, "journal.live-control.json"),
    JSON.stringify({
      armed: false,
      blocked: false,
      degraded: false,
      manualRearmRequired: false,
      roundStatus: "idle",
      inFlight: 0,
      recentTradeAtMs: [],
      recentFailureAtMs: [],
      dailyNotional: 0,
      dailyKey: "2026-03-01",
    })
  );
  await writeFileIfNeeded(join(baseDir, "journal.daily-loss.json"), JSON.stringify({ dateKey: "", tradesCount: 0, lossUsd: 0 }));
  await writeFileIfNeeded(join(baseDir, "journal.idempotency.json"), JSON.stringify([]));
}

describe("worker state manifest", () => {
  it("fails closed when boot-critical files are missing", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "bobbyexecute-worker-state-"));
    try {
      const journalPath = join(baseDir, "journal.jsonl");
      await writeFileIfNeeded(journalPath, "{\"event\":\"journal\"}\n");

      const report = inspectWorkerDiskRecovery({ journalPath });
      expect(report.safeBoot).toBe(false);
      expect(report.bootCriticalMissing.map((artifact) => artifact.label)).toEqual(
        expect.arrayContaining([
          "kill switch state",
          "live control state",
          "daily loss state",
          "idempotency cache",
        ])
      );
      expect(report.bootCriticalInvalid).toHaveLength(0);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("fails closed on empty boot-critical files", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "bobbyexecute-worker-state-empty-"));
    try {
      const journalPath = join(baseDir, "journal.jsonl");
      await writeFileIfNeeded(journalPath, "{\"event\":\"journal\"}\n");
      await writeValidBootState(baseDir);
      await writeFileIfNeeded(join(baseDir, "journal.live-control.json"), "   \n");

      const report = inspectWorkerDiskRecovery({ journalPath });
      expect(report.safeBoot).toBe(false);
      expect(report.bootCriticalMissing).toHaveLength(0);
      expect(report.bootCriticalInvalid.map((artifact) => artifact.label)).toContain("live control state");
      expect(report.bootCriticalInvalid.find((artifact) => artifact.label === "live control state")?.validationError).toContain("empty");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("fails closed on malformed boot-critical JSON files", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "bobbyexecute-worker-state-malformed-"));
    try {
      const journalPath = join(baseDir, "journal.jsonl");
      await writeFileIfNeeded(journalPath, "{\"event\":\"journal\"}\n");
      await writeValidBootState(baseDir);
      await writeFileIfNeeded(join(baseDir, "journal.kill-switch.json"), "{");

      const report = inspectWorkerDiskRecovery({ journalPath });
      expect(report.safeBoot).toBe(false);
      expect(report.bootCriticalInvalid.map((artifact) => artifact.label)).toContain("kill switch state");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("fails closed on structurally invalid boot-critical JSON files", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "bobbyexecute-worker-state-struct-"));
    try {
      const journalPath = join(baseDir, "journal.jsonl");
      await writeFileIfNeeded(journalPath, "{\"event\":\"journal\"}\n");
      await writeValidBootState(baseDir);
      await writeFileIfNeeded(join(baseDir, "journal.idempotency.json"), JSON.stringify([{ createdAt: 1 }]));

      const report = inspectWorkerDiskRecovery({ journalPath });
      expect(report.safeBoot).toBe(false);
      expect(report.bootCriticalInvalid.map((artifact) => artifact.label)).toContain("idempotency cache");
      expect(report.bootCriticalInvalid.find((artifact) => artifact.label === "idempotency cache")?.validationError).toContain(
        "required idempotency record fields"
      );
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("passes when canonical boot-critical files are present and valid", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "bobbyexecute-worker-state-valid-"));
    try {
      const journalPath = join(baseDir, "journal.jsonl");
      await writeFileIfNeeded(journalPath, "{\"event\":\"journal\"}\n");
      await writeFileIfNeeded(join(baseDir, "journal.actions.jsonl"), "{\"event\":\"action\"}\n");
      await writeValidBootState(baseDir);

      const report = inspectWorkerDiskRecovery({ journalPath });
      expect(report.safeBoot).toBe(true);
      expect(report.bootCriticalMissing).toHaveLength(0);
      expect(report.bootCriticalInvalid).toHaveLength(0);
      expect(report.message).toContain("present and valid");
      expect(report.recoveryDrillMissing.length).toBeGreaterThanOrEqual(0);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
