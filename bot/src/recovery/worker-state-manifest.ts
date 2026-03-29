import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Config } from "../config/config-schema.js";
import type { DailyLossState } from "../governance/daily-loss-tracker.js";
import type { KillSwitchState } from "../governance/kill-switch.js";
import type { PersistedLiveControlState } from "../persistence/live-control-repository.js";
import { FileSystemDailyLossRepository } from "../persistence/daily-loss-repository.js";
import { FileSystemIdempotencyRepository, type IdempotencyRecord } from "../persistence/idempotency-repository.js";
import { FileSystemKillSwitchRepository } from "../persistence/kill-switch-repository.js";
import { FileSystemLiveControlRepository } from "../persistence/live-control-repository.js";

export type WorkerDiskArtifactCategory =
  | "canonical_durable_state"
  | "reconstructible_derivative_state"
  | "operational_evidence"
  | "transient_no_recovery_needed";

export interface WorkerDiskArtifactDescriptor {
  path: string;
  label: string;
  category: WorkerDiskArtifactCategory;
  bootCritical: boolean;
  requiredForRecoveryDrill: boolean;
  optionalInPaperMode: boolean;
  recoveryExpectation: string;
  lostArtifactImpact: string;
  present: boolean;
  valid?: boolean;
  validationError?: string;
}

export interface WorkerDiskRecoveryReport {
  basePath: string;
  journalPath: string;
  artifacts: WorkerDiskArtifactDescriptor[];
  bootCriticalMissing: WorkerDiskArtifactDescriptor[];
  bootCriticalInvalid: WorkerDiskArtifactDescriptor[];
  recoveryDrillMissing: WorkerDiskArtifactDescriptor[];
  safeBoot: boolean;
  message: string;
}

function stripJsonlSuffix(path: string): string {
  return path.replace(/\.jsonl$/i, "");
}

function buildArtifact(
  path: string,
  input: Omit<WorkerDiskArtifactDescriptor, "path" | "present" | "valid" | "validationError"> & { present?: boolean }
): WorkerDiskArtifactDescriptor {
  return {
    path,
    present: input.present ?? false,
    label: input.label,
    category: input.category,
    bootCritical: input.bootCritical,
    requiredForRecoveryDrill: input.requiredForRecoveryDrill,
    optionalInPaperMode: input.optionalInPaperMode,
    recoveryExpectation: input.recoveryExpectation,
    lostArtifactImpact: input.lostArtifactImpact,
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isKillSwitchState(value: unknown): value is KillSwitchState {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (typeof value.halted !== "boolean") {
    return false;
  }

  if (value.reason != null && typeof value.reason !== "string") {
    return false;
  }

  if (value.triggeredAt != null && typeof value.triggeredAt !== "string") {
    return false;
  }

  return true;
}

function isDailyLossState(value: unknown): value is DailyLossState {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    typeof value.dateKey === "string" &&
    isFiniteNumber(value.tradesCount) &&
    value.tradesCount >= 0 &&
    isFiniteNumber(value.lossUsd) &&
    value.lossUsd >= 0
  );
}

function isIdempotencyRecord(value: unknown): value is IdempotencyRecord {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (typeof value.key !== "string" || typeof value.createdAt !== "string") {
    return false;
  }

  return value.expiresAt == null || isFiniteNumber(value.expiresAt);
}

function isPersistedLiveControlState(value: unknown): value is PersistedLiveControlState {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (
    typeof value.armed !== "boolean" ||
    typeof value.blocked !== "boolean" ||
    typeof value.degraded !== "boolean" ||
    typeof value.manualRearmRequired !== "boolean" ||
    typeof value.roundStatus !== "string" ||
    !isFiniteNumber(value.inFlight) ||
    !isFiniteNumber(value.dailyNotional) ||
    typeof value.dailyKey !== "string"
  ) {
    return false;
  }

  if (!Array.isArray(value.recentTradeAtMs) || !value.recentTradeAtMs.every((entry) => isFiniteNumber(entry))) {
    return false;
  }

  if (!Array.isArray(value.recentFailureAtMs) || !value.recentFailureAtMs.every((entry) => isFiniteNumber(entry))) {
    return false;
  }

  if (value.lastExecutionAtMs != null && !isFiniteNumber(value.lastExecutionAtMs)) {
    return false;
  }

  return true;
}

function readTrimmedContent(filePath: string): string {
  return readFileSync(filePath, "utf8").trim();
}

function validateBootCriticalArtifact(artifact: WorkerDiskArtifactDescriptor): WorkerDiskArtifactDescriptor {
  if (!artifact.bootCritical) {
    return artifact;
  }

  if (!artifact.present) {
    return {
      ...artifact,
      valid: false,
    };
  }

  let raw: string;
  try {
    raw = readTrimmedContent(artifact.path);
  } catch (error) {
    return {
      ...artifact,
      valid: false,
      validationError: error instanceof Error ? error.message : String(error),
    };
  }

  if (raw.length === 0) {
    return {
      ...artifact,
      valid: false,
      validationError: "file is empty",
    };
  }

  try {
    if (artifact.label === "kill switch state") {
      const loaded = new FileSystemKillSwitchRepository(artifact.path).loadSync();
      if (!loaded || !isKillSwitchState(loaded)) {
        return { ...artifact, valid: false, validationError: "state is missing required kill-switch fields" };
      }
      return { ...artifact, valid: true };
    }

    if (artifact.label === "live control state") {
      const loaded = new FileSystemLiveControlRepository(artifact.path).loadSync();
      if (!loaded || !isPersistedLiveControlState(loaded)) {
        return { ...artifact, valid: false, validationError: "state is missing required live-control fields" };
      }
      return { ...artifact, valid: true };
    }

    if (artifact.label === "daily loss state") {
      const loaded = new FileSystemDailyLossRepository(artifact.path).loadSync();
      if (!loaded || !isDailyLossState(loaded)) {
        return { ...artifact, valid: false, validationError: "state is missing required daily-loss fields" };
      }
      return { ...artifact, valid: true };
    }

    if (artifact.label === "idempotency cache") {
      const loaded = new FileSystemIdempotencyRepository(artifact.path).loadSync();
      if (!loaded || !Array.isArray(loaded) || !loaded.every((entry) => isIdempotencyRecord(entry))) {
        return { ...artifact, valid: false, validationError: "state is missing required idempotency record fields" };
      }
      return { ...artifact, valid: true };
    }

    return artifact;
  } catch (error) {
    return {
      ...artifact,
      valid: false,
      validationError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getWorkerDiskArtifacts(config: Pick<Config, "journalPath">): WorkerDiskArtifactDescriptor[] {
  const basePath = stripJsonlSuffix(config.journalPath);
  const directory = dirname(basePath);
  const artifacts = [
    buildArtifact(config.journalPath, {
      label: "worker journal",
      category: "operational_evidence",
      bootCritical: false,
      requiredForRecoveryDrill: true,
      optionalInPaperMode: false,
      recoveryExpectation: "Retain the append-only journal for audit and replay review.",
      lostArtifactImpact: "Evidence gap only. The worker can still boot, but historical replay fidelity is reduced.",
      present: existsSync(config.journalPath),
    }),
    buildArtifact(join(directory, `${basePath.split(/[\\/]/).pop() ?? "journal"}.actions.jsonl`), {
      label: "paper action log",
      category: "operational_evidence",
      bootCritical: false,
      requiredForRecoveryDrill: true,
      optionalInPaperMode: true,
      recoveryExpectation: "Retain when paper mode is used; it is operator evidence, not control truth.",
      lostArtifactImpact: "Paper-mode evidence gap only. Safe boot is unaffected.",
      present: existsSync(join(directory, `${basePath.split(/[\\/]/).pop() ?? "journal"}.actions.jsonl`)),
    }),
    buildArtifact(`${basePath}.runtime-cycles.jsonl`, {
      label: "runtime cycle summary stream",
      category: "reconstructible_derivative_state",
      bootCritical: false,
      requiredForRecoveryDrill: true,
      optionalInPaperMode: false,
      recoveryExpectation: "Retain for incident review. If lost, later cycles are still safe, but the historical slice is gone.",
      lostArtifactImpact: "Historical reconstruction gap only.",
      present: existsSync(`${basePath}.runtime-cycles.jsonl`),
    }),
    buildArtifact(`${basePath}.incidents.jsonl`, {
      label: "incident journal",
      category: "operational_evidence",
      bootCritical: false,
      requiredForRecoveryDrill: true,
      optionalInPaperMode: false,
      recoveryExpectation: "Retain as operator evidence. It is not authoritative control state.",
      lostArtifactImpact: "Incident evidence gap only.",
      present: existsSync(`${basePath}.incidents.jsonl`),
    }),
    buildArtifact(`${basePath}.execution-evidence.jsonl`, {
      label: "execution evidence",
      category: "operational_evidence",
      bootCritical: false,
      requiredForRecoveryDrill: true,
      optionalInPaperMode: false,
      recoveryExpectation: "Retain to preserve execution auditability and replay context.",
      lostArtifactImpact: "Execution evidence gap only.",
      present: existsSync(`${basePath}.execution-evidence.jsonl`),
    }),
    buildArtifact(`${basePath}.kill-switch.json`, {
      label: "kill switch state",
      category: "canonical_durable_state",
      bootCritical: true,
      requiredForRecoveryDrill: true,
      optionalInPaperMode: false,
      recoveryExpectation: "Restore exact state before boot. If absent, the worker must fail closed.",
      lostArtifactImpact: "Safe boot is blocked until the operator restores or re-arms the state.",
      present: existsSync(`${basePath}.kill-switch.json`),
    }),
    buildArtifact(`${basePath}.live-control.json`, {
      label: "live control state",
      category: "canonical_durable_state",
      bootCritical: true,
      requiredForRecoveryDrill: true,
      optionalInPaperMode: false,
      recoveryExpectation: "Restore exact state before boot. The worker cannot infer live-control truth from Postgres.",
      lostArtifactImpact: "Safe boot is blocked until the operator restores or re-seeds the state explicitly.",
      present: existsSync(`${basePath}.live-control.json`),
    }),
    buildArtifact(`${basePath}.daily-loss.json`, {
      label: "daily loss state",
      category: "canonical_durable_state",
      bootCritical: true,
      requiredForRecoveryDrill: true,
      optionalInPaperMode: false,
      recoveryExpectation: "Restore exact state before boot. Loss accounting must not be guessed.",
      lostArtifactImpact: "Safe boot is blocked until the operator restores or re-seeds the state explicitly.",
      present: existsSync(`${basePath}.daily-loss.json`),
    }),
    buildArtifact(`${basePath}.idempotency.json`, {
      label: "idempotency cache",
      category: "canonical_durable_state",
      bootCritical: true,
      requiredForRecoveryDrill: true,
      optionalInPaperMode: false,
      recoveryExpectation: "Restore exact state before boot. Duplicate suppression is safety-critical in live posture.",
      lostArtifactImpact: "Safe boot is blocked until the operator restores or re-seeds the state explicitly.",
      present: existsSync(`${basePath}.idempotency.json`),
    }),
  ];

  return artifacts.map((artifact) => validateBootCriticalArtifact(artifact));
}

export function inspectWorkerDiskRecovery(config: Pick<Config, "journalPath">): WorkerDiskRecoveryReport {
  const artifacts = getWorkerDiskArtifacts(config);
  const bootCriticalMissing = artifacts.filter((artifact) => artifact.bootCritical && !artifact.present);
  const bootCriticalInvalid = artifacts.filter((artifact) => artifact.bootCritical && artifact.present && artifact.valid === false);
  const recoveryDrillMissing = artifacts.filter((artifact) => artifact.requiredForRecoveryDrill && !artifact.present);
  const safeBoot = bootCriticalMissing.length === 0 && bootCriticalInvalid.length === 0;
  const message = safeBoot
    ? "Worker disk recovery prerequisites are present and valid."
    : "Worker disk recovery prerequisites are missing or invalid. The worker must fail closed until the state is restored.";

  return {
    basePath: stripJsonlSuffix(config.journalPath),
    journalPath: config.journalPath,
    artifacts,
    bootCriticalMissing,
    bootCriticalInvalid,
    recoveryDrillMissing,
    safeBoot,
    message,
  };
}
