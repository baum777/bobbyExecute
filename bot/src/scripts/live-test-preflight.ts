/**
 * Live-test preflight runner.
 * Validates the live trading configuration before the operator starts a controlled round.
 */
import { pathToFileURL } from "node:url";
import { loadConfig } from "../config/load-config.js";
import {
  assertLiveTestPrerequisites,
  getLiveTestConfig,
} from "../config/safety.js";
import { inspectWorkerDiskRecovery } from "../recovery/worker-state-manifest.js";

export interface LiveTestPreflightReport {
  executionMode: "dry" | "paper" | "live";
  rpcMode: "stub" | "real";
  liveTestEnabled: boolean;
  maxCapitalUsd: number;
  maxTradesPerDay: number;
  maxDailyLossUsd: number;
  workerJournalPath: string;
  workerSafeBoot: boolean;
  workerBootCriticalMissing: string[];
  workerBootCriticalInvalid: Array<{ label: string; error?: string }>;
}

export function runLiveTestPreflight(): LiveTestPreflightReport {
  const config = loadConfig();
  if (config.executionMode !== "live") {
    throw new Error(
      `Live-test preflight requires LIVE_TRADING=true. Current executionMode='${config.executionMode}'.`
    );
  }

  const liveTestConfig = assertLiveTestPrerequisites(config);
  const normalizedLiveTestConfig = getLiveTestConfig();
  const workerState = inspectWorkerDiskRecovery({ journalPath: config.journalPath });
  if (!workerState.safeBoot) {
    const missing = workerState.bootCriticalMissing.map((artifact) => artifact.label);
    const invalid = workerState.bootCriticalInvalid.map((artifact) => {
      const reason = artifact.validationError ? `${artifact.label} (${artifact.validationError})` : artifact.label;
      return reason;
    });
    throw new Error(
      `Live-test preflight requires valid worker boot state at '${config.journalPath}'. Missing: ${missing.join(", ") || "none"}. Invalid: ${invalid.join(", ") || "none"}.`
    );
  }

  const report: LiveTestPreflightReport = {
    executionMode: config.executionMode,
    rpcMode: config.rpcMode,
    liveTestEnabled: liveTestConfig.enabled,
    maxCapitalUsd: normalizedLiveTestConfig.maxCapitalUsd,
    maxTradesPerDay: normalizedLiveTestConfig.maxTradesPerDay,
    maxDailyLossUsd: normalizedLiveTestConfig.maxDailyLossUsd,
    workerJournalPath: config.journalPath,
    workerSafeBoot: workerState.safeBoot,
    workerBootCriticalMissing: workerState.bootCriticalMissing.map((artifact) => artifact.label),
    workerBootCriticalInvalid: workerState.bootCriticalInvalid.map((artifact) => ({
      label: artifact.label,
      error: artifact.validationError,
    })),
  };

  console.log("[live-preflight] Live-test configuration validated", JSON.stringify(report));
  return report;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(entry).href === import.meta.url;
}

if (isMainModule()) {
  try {
    runLiveTestPreflight();
    console.log("[live-preflight] Preflight passed");
  } catch (error) {
    console.error("[live-preflight] Preflight failed:", error);
    process.exitCode = 1;
  }
}
