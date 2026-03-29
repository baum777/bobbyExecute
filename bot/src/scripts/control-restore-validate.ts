import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import {
  validateControlPlaneBackupRoundTrip,
  type ControlPlaneBackupRoundTripValidationResult,
  type ControlPlaneBackupSnapshot,
} from "../recovery/control-plane-backup.js";
import { inspectWorkerDiskRecovery, type WorkerDiskRecoveryReport } from "../recovery/worker-state-manifest.js";
import { closePool, parseCliArgs, readCliString } from "./cli.js";

export interface RestoreValidationReadinessReport {
  status: "ready" | "not_ready";
  ready: boolean;
  dbValidation?: ControlPlaneBackupRoundTripValidationResult;
  workerState: {
    checked: boolean;
    journalPath?: string;
    safeBoot?: boolean;
    bootCriticalMissing: string[];
    bootCriticalInvalid: string[];
    message: string;
  };
  reasons: string[];
}

export function summarizeWorkerState(
  report: WorkerDiskRecoveryReport | undefined,
  journalPath: string | undefined
): RestoreValidationReadinessReport["workerState"] {
  if (!journalPath) {
    return {
      checked: false,
      message: "worker state was not validated because no journal path was provided",
      bootCriticalMissing: [],
      bootCriticalInvalid: [],
    };
  }

  if (!report) {
    return {
      checked: true,
      journalPath,
      safeBoot: false,
      message: "worker state validation failed to execute",
      bootCriticalMissing: [],
      bootCriticalInvalid: [],
    };
  }

  return {
    checked: true,
    journalPath,
    safeBoot: report.safeBoot,
    message: report.message,
    bootCriticalMissing: report.bootCriticalMissing.map((artifact) => artifact.label),
    bootCriticalInvalid: report.bootCriticalInvalid.map((artifact) => artifact.label),
  };
}

export function buildRestoreValidationReadinessReport(
  dbValidation: ControlPlaneBackupRoundTripValidationResult,
  workerReport: WorkerDiskRecoveryReport | undefined,
  journalPath: string | undefined
): RestoreValidationReadinessReport {
  const reasons: string[] = [];
  if (dbValidation.status !== "exact_match") {
    reasons.push(`database restore validation status=${dbValidation.status}`);
  }

  if (journalPath) {
    if (!workerReport || !workerReport.safeBoot) {
      reasons.push("worker boot-critical state is missing or invalid");
    }
  } else {
    reasons.push("worker state was not validated because journal path is unavailable");
  }

  const workerState = summarizeWorkerState(workerReport, journalPath);
  const ready = dbValidation.status === "exact_match" && workerState.checked && workerState.safeBoot === true;

  return {
    status: ready ? "ready" : "not_ready",
    ready,
    dbValidation,
    workerState,
    reasons,
  };
}

async function main(): Promise<number> {
  const args = parseCliArgs(process.argv.slice(2));
  const databaseUrl = readCliString(args, "database-url", process.env.DATABASE_URL);
  const inputPath = readCliString(args, "input");
  const journalPath = readCliString(args, "journal-path", process.env.JOURNAL_PATH);

  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    return 4;
  }
  if (!inputPath) {
    console.error("An input backup file is required.");
    return 4;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const snapshot = JSON.parse(await readFile(inputPath, "utf8")) as ControlPlaneBackupSnapshot;
    const dbValidation = await validateControlPlaneBackupRoundTrip(pool, snapshot);
    let workerReport: WorkerDiskRecoveryReport | undefined;
    if (journalPath) {
      workerReport = inspectWorkerDiskRecovery({ journalPath });
    }

    const report = buildRestoreValidationReadinessReport(dbValidation, workerReport, journalPath);

    console.log(JSON.stringify(report, null, 2));
    return report.ready ? 0 : 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await closePool(pool);
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(entry).href === import.meta.url;
}

if (isMainModule()) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
