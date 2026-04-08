/**
 * Live-test preflight runner.
 * Validates the live trading configuration before the operator starts a controlled round.
 */
import { pathToFileURL } from "node:url";
import { loadConfig } from "../config/load-config.js";
import { parseRolloutPostureConfig, getLiveTestConfig } from "../config/safety.js";
import { writeJsonFile } from "../persistence/json-file.js";
import { inspectWorkerDiskRecovery } from "../recovery/worker-state-manifest.js";
import { getMicroLiveControlSnapshot } from "../runtime/live-control.js";
import { buildRuntimeReadiness } from "../server/runtime-truth.js";
import type { RuntimeReadiness } from "../server/contracts/kpi.js";
import type { Config } from "../config/config-schema.js";
import type { RuntimeSnapshot } from "../runtime/dry-run-runtime.js";

export interface LiveTestPreflightReport {
  executionMode: "dry" | "paper" | "live";
  rpcMode: "stub" | "real";
  liveTestEnabled: boolean;
  rolloutPosture: "paper_only" | "micro_live" | "staged_live_candidate" | "paused_or_rolled_back" | "unset";
  readiness: RuntimeReadiness;
  preflightGate: "paper_safe" | "micro_live" | "constrained_live" | "blocked";
  evidencePath: string;
  maxCapitalUsd: number;
  maxTradesPerDay: number;
  maxDailyLossUsd: number;
  workerJournalPath: string;
  workerSafeBoot: boolean;
  workerBootCriticalMissing: string[];
  workerBootCriticalInvalid: Array<{ label: string; error?: string }>;
  blockers: string[];
}

type PreflightConfig = Pick<Config, "executionMode" | "rpcMode" | "journalPath">;

function derivePreflightEvidencePath(journalPath: string): string {
  return journalPath.replace(/\.jsonl$/i, "") + ".live-preflight.json";
}

function derivePreflightGate(
  executionMode: "dry" | "paper" | "live",
  rolloutPosture: LiveTestPreflightReport["rolloutPosture"],
  readiness: RuntimeReadiness,
  blockers: string[]
): LiveTestPreflightReport["preflightGate"] {
  if (blockers.length > 0) {
    return "blocked";
  }
  if (executionMode !== "live") {
    return "paper_safe";
  }
  if (rolloutPosture === "micro_live") {
    return "micro_live";
  }
  if (rolloutPosture === "staged_live_candidate") {
    return "constrained_live";
  }
  return readiness.liveAllowed ? "micro_live" : "blocked";
}

function buildSyntheticRuntimeSnapshot(
  configExecutionMode: "dry" | "paper" | "live",
  liveControl: ReturnType<typeof getMicroLiveControlSnapshot>
): RuntimeSnapshot {
  return {
    status: "idle",
    mode: configExecutionMode,
    paperModeActive: configExecutionMode !== "live",
    cycleInFlight: false,
    liveControl,
    counters: {
      cycleCount: 0,
      decisionCount: 0,
      executionCount: 0,
      blockedCount: 0,
      errorCount: 0,
    },
    lastState: null,
  };
}

function collectEnvBlockers(config: Config, rolloutPosture: LiveTestPreflightReport["rolloutPosture"]): string[] {
  const blockers: string[] = [];

  if (config.executionMode === "live" && rolloutPosture === "unset") {
    blockers.push("ROLLOUT_POSTURE must be set for live preflight.");
  }
  if (!config.tradingEnabled) {
    blockers.push("TRADING_ENABLED must be true.");
  }
  if (!config.liveTestMode) {
    blockers.push("LIVE_TEST_MODE must be true.");
  }
  if (!config.walletAddress) {
    blockers.push("WALLET_ADDRESS is required.");
  }
  if (config.signerMode !== "remote") {
    blockers.push("SIGNER_MODE must be remote.");
  }
  if (!config.signerUrl) {
    blockers.push("SIGNER_URL is required when SIGNER_MODE=remote.");
  }
  if (!config.signerAuthToken) {
    blockers.push("SIGNER_AUTH_TOKEN is required when SIGNER_MODE=remote.");
  }
  if (!config.controlToken) {
    blockers.push("CONTROL_TOKEN is required.");
  }
  if (!config.operatorReadToken) {
    blockers.push("OPERATOR_READ_TOKEN is required.");
  }
  if (config.controlToken && config.operatorReadToken && config.controlToken === config.operatorReadToken) {
    blockers.push("CONTROL_TOKEN and OPERATOR_READ_TOKEN must be distinct.");
  }
  if (config.discoveryProvider !== "dexscreener") {
    blockers.push("DISCOVERY_PROVIDER must be dexscreener.");
  }
  if (config.marketDataProvider !== "dexpaprika") {
    blockers.push("MARKET_DATA_PROVIDER must be dexpaprika.");
  }
  if (config.streamingProvider !== "dexpaprika" && config.streamingProvider !== "off") {
    blockers.push("STREAMING_PROVIDER must be dexpaprika or off.");
  }
  if (config.moralisEnabled && !config.moralisApiKey) {
    blockers.push("MORALIS_API_KEY is required when MORALIS_ENABLED=true.");
  }
  if (!config.jupiterApiKey) {
    blockers.push("JUPITER_API_KEY is required.");
  }
  if (rolloutPosture === "paper_only" || rolloutPosture === "paused_or_rolled_back") {
    blockers.push(`ROLLOUT_POSTURE=${rolloutPosture} blocks live preflight.`);
  }

  return blockers;
}

function buildEvidence(input: {
  config: PreflightConfig;
  liveTestConfig: ReturnType<typeof getLiveTestConfig>;
  workerState: ReturnType<typeof inspectWorkerDiskRecovery>;
  rolloutPosture: LiveTestPreflightReport["rolloutPosture"];
  evidencePath: string;
  blockers: string[];
}): LiveTestPreflightReport {
  const liveControl = getMicroLiveControlSnapshot();
  const readiness = buildRuntimeReadiness(buildSyntheticRuntimeSnapshot(input.config.executionMode, liveControl))!;
  const preflightGate = derivePreflightGate(input.config.executionMode, input.rolloutPosture, readiness, input.blockers);

  return {
    executionMode: input.config.executionMode,
    rpcMode: input.config.rpcMode,
    liveTestEnabled: input.liveTestConfig.enabled,
    rolloutPosture: input.rolloutPosture,
    readiness,
    preflightGate,
    evidencePath: input.evidencePath,
    maxCapitalUsd: input.liveTestConfig.maxCapitalUsd,
    maxTradesPerDay: input.liveTestConfig.maxTradesPerDay,
    maxDailyLossUsd: input.liveTestConfig.maxDailyLossUsd,
    workerJournalPath: input.config.journalPath,
    workerSafeBoot: input.workerState.safeBoot,
    workerBootCriticalMissing: input.workerState.bootCriticalMissing.map((artifact) => artifact.label),
    workerBootCriticalInvalid: input.workerState.bootCriticalInvalid.map((artifact) => ({
      label: artifact.label,
      error: artifact.validationError,
    })),
    blockers: input.blockers,
  };
}

function writePreflightEvidence(report: LiveTestPreflightReport): void {
  writeJsonFile(report.evidencePath, {
    capturedAt: new Date().toISOString(),
    status: report.blockers.length === 0 && report.workerSafeBoot ? "ready" : "blocked",
    report,
  });
}

export function runLiveTestPreflight(): LiveTestPreflightReport {
  const evidencePath = derivePreflightEvidencePath(process.env.JOURNAL_PATH ?? "data/journal.jsonl");
  const rolloutPosture = parseRolloutPostureConfig(process.env) ?? "unset";

  try {
    const config = loadConfig();
    if (config.executionMode !== "live") {
      throw new Error("Live-test preflight requires LIVE_TRADING=true.");
    }
    const liveTestConfig = getLiveTestConfig();
    const workerState = inspectWorkerDiskRecovery({ journalPath: config.journalPath });
    const blockers = collectEnvBlockers(config, rolloutPosture);
    if (!workerState.safeBoot) {
      const missing = workerState.bootCriticalMissing.map((artifact) => artifact.label);
      const invalid = workerState.bootCriticalInvalid.map((artifact) => {
        const reason = artifact.validationError ? `${artifact.label} (${artifact.validationError})` : artifact.label;
        return reason;
      });
      blockers.push(
        `Worker boot-critical state is invalid. Missing: ${missing.join(", ") || "none"}. Invalid: ${invalid.join(", ") || "none"}.`
      );
    }

    const report = buildEvidence({
      config,
      liveTestConfig,
      workerState,
      rolloutPosture,
      evidencePath,
      blockers,
    });
    writePreflightEvidence(report);

    if (blockers.length > 0) {
      throw new Error(
        `Live-test preflight blocked: ${blockers.join(" ")} Evidence written to '${evidencePath}'.`
      );
    }

    console.log("[live-preflight] Live-test configuration validated", JSON.stringify(report));
    return report;
  } catch (error) {
    const fallbackConfig: PreflightConfig = {
      executionMode: String(process.env.LIVE_TRADING).toLowerCase() === "true" ? "live" : "dry",
      rpcMode: String(process.env.RPC_MODE).toLowerCase() === "real" ? "real" : "stub",
      journalPath: process.env.JOURNAL_PATH ?? "data/journal.jsonl",
    };
    const liveTestConfig = getLiveTestConfig();
    const workerState = inspectWorkerDiskRecovery({ journalPath: fallbackConfig.journalPath });
    const blockers = [
      error instanceof Error ? error.message : String(error),
      ...(!workerState.safeBoot
        ? [
            `Worker boot-critical state is invalid. Missing: ${
              workerState.bootCriticalMissing.map((artifact) => artifact.label).join(", ") || "none"
            }. Invalid: ${
              workerState.bootCriticalInvalid
                .map((artifact) => (artifact.validationError ? `${artifact.label} (${artifact.validationError})` : artifact.label))
                .join(", ") || "none"
            }.`,
          ]
        : []),
    ];
    const report = buildEvidence({
      config: fallbackConfig,
      liveTestConfig,
      workerState,
      rolloutPosture,
      evidencePath,
      blockers,
    });
    writePreflightEvidence(report);
    throw new Error(`${blockers.join(" ")} Evidence written to '${evidencePath}'.`);
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
  try {
    runLiveTestPreflight();
    console.log("[live-preflight] Preflight passed");
  } catch (error) {
    console.error("[live-preflight] Preflight failed:", error);
    process.exitCode = 1;
  }
}
