import { describe, expect, it } from "vitest";
import type { ControlPlaneBackupRoundTripValidationResult } from "../../src/recovery/control-plane-backup.js";
import type { WorkerDiskRecoveryReport } from "../../src/recovery/worker-state-manifest.js";
import { buildRestoreValidationReadinessReport } from "../../src/scripts/control-restore-validate.js";

function buildValidationResult(
  status: ControlPlaneBackupRoundTripValidationResult["status"]
): ControlPlaneBackupRoundTripValidationResult {
  const counts = {
    runtimeConfigVersions: 1,
    runtimeConfigActive: 1,
    runtimeConfigChangeLog: 1,
    runtimeVisibility: 1,
    workerRestarts: 1,
    restartAlerts: 1,
    restartAlertEvents: 1,
    governanceAudits: 1,
    livePromotions: 1,
  };

  const countsMatched = status !== "count_or_metadata_mismatch";
  const contentMatched = status === "exact_match";
  return {
    matched: status === "exact_match",
    countsMatched,
    contentMatched,
    status,
    mismatchTables: contentMatched ? [] : ["runtime_config_versions"],
    countMismatchTables: countsMatched ? [] : ["runtime_config_versions"],
    metadataMismatches: countsMatched ? [] : ["total_records"],
    before: {
      environment: "test",
      capturedAt: "2026-03-29T00:00:00.000Z",
      schemaState: "ready",
      counts,
      totalRecords: Object.values(counts).reduce((sum, value) => sum + value, 0),
    },
    after: {
      environment: "test",
      capturedAt: "2026-03-29T00:00:01.000Z",
      schemaState: "ready",
      counts,
      totalRecords: Object.values(counts).reduce((sum, value) => sum + value, 0),
    },
  };
}

function buildWorkerReport(safeBoot: boolean): WorkerDiskRecoveryReport {
  return {
    basePath: "/tmp/journal",
    journalPath: "/tmp/journal.jsonl",
    artifacts: [],
    bootCriticalMissing: safeBoot ? [] : [{ label: "kill switch state" }] as WorkerDiskRecoveryReport["bootCriticalMissing"],
    bootCriticalInvalid: safeBoot ? [] : [{ label: "live control state" }] as WorkerDiskRecoveryReport["bootCriticalInvalid"],
    recoveryDrillMissing: [],
    safeBoot,
    message: safeBoot ? "Worker disk recovery prerequisites are present and valid." : "Worker disk recovery prerequisites are missing or invalid.",
  };
}

describe("control restore validate readiness", () => {
  it("reports ready only for exact DB match plus safe worker boot state", () => {
    const report = buildRestoreValidationReadinessReport(
      buildValidationResult("exact_match"),
      buildWorkerReport(true),
      "/tmp/journal.jsonl"
    );

    expect(report.ready).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.reasons).toEqual([]);
    expect(report.workerState.safeBoot).toBe(true);
  });

  it("fails closed when worker state is not validated", () => {
    const report = buildRestoreValidationReadinessReport(buildValidationResult("exact_match"), undefined, undefined);

    expect(report.ready).toBe(false);
    expect(report.status).toBe("not_ready");
    expect(report.workerState.checked).toBe(false);
    expect(report.reasons).toContain("worker state was not validated because journal path is unavailable");
  });

  it("fails closed when worker boot-critical state is invalid", () => {
    const report = buildRestoreValidationReadinessReport(
      buildValidationResult("exact_match"),
      buildWorkerReport(false),
      "/tmp/journal.jsonl"
    );

    expect(report.ready).toBe(false);
    expect(report.workerState.checked).toBe(true);
    expect(report.workerState.safeBoot).toBe(false);
    expect(report.reasons).toContain("worker boot-critical state is missing or invalid");
  });

  it("fails closed when DB restore status is not exact", () => {
    const report = buildRestoreValidationReadinessReport(
      buildValidationResult("content_mismatch"),
      buildWorkerReport(true),
      "/tmp/journal.jsonl"
    );

    expect(report.ready).toBe(false);
    expect(report.reasons).toContain("database restore validation status=content_mismatch");
  });
});

