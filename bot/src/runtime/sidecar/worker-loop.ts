import type { JournalWriter } from "../../journal-writer/writer.js";
import type { WatchCandidate } from "../../discovery/contracts/watch-candidate.js";
import { WatchCandidateRegistry } from "../../discovery/watch-candidate-registry.js";
import { parseDowntrendWatchWorkerOutput } from "../../advisory/downtrend-watch-worker.js";
import {
  TrendReversalMonitorRunner,
  type TrendReversalMonitorRunResult,
} from "../../intelligence/forensics/trend-reversal-monitor-runner.js";

export interface SidecarWorkerLoopDeps {
  registry?: WatchCandidateRegistry;
  logger?: Pick<Console, "info" | "warn" | "error">;
  journalWriter?: JournalWriter;
  now?: () => number;
  discoveryIntervalMs?: number;
  monitorIntervalMs?: number;
  discoveryTimeoutMs?: number;
  autoStart?: boolean;
  runDiscoveryWorker: () => Promise<unknown>;
  monitorRunner?: TrendReversalMonitorRunner;
}

export interface SidecarWorkerLoopTickResult {
  discoveredCandidates: WatchCandidate[];
  acceptedCandidates: WatchCandidate[];
  prunedCandidates: WatchCandidate[];
  monitorResult: TrendReversalMonitorRunResult;
}

export interface SidecarWorkerLoopHandle {
  registry: WatchCandidateRegistry;
  tickDiscovery(): Promise<WatchCandidate[]>;
  tickMonitor(): Promise<TrendReversalMonitorRunResult>;
  tickAll(): Promise<SidecarWorkerLoopTickResult>;
  stop(): void;
}

const DEFAULT_DISCOVERY_INTERVAL_MS = 3 * 60 * 1000;
const DEFAULT_MONITOR_INTERVAL_MS = 20 * 1000;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`SIDECAR_DISCOVERY_TIMEOUT:${timeoutMs}`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

async function appendCandidateJournal(
  journalWriter: JournalWriter,
  candidate: WatchCandidate
): Promise<void> {
  await journalWriter.append({
    traceId: `sidecar-discovery:${candidate.token}:${candidate.updatedAt}`,
    timestamp: new Date(candidate.updatedAt).toISOString(),
    stage: "sidecar.discovery.candidate_ingestion",
    input: {
      token: candidate.token,
      recommendation: candidate.monitorRecommendation,
      completeness: candidate.observationCompleteness,
    },
    output: candidate,
    blocked: false,
  });
}

export function startSidecarWorkerLoop(
  deps: SidecarWorkerLoopDeps
): SidecarWorkerLoopHandle {
  const registry = deps.registry ?? new WatchCandidateRegistry({ now: deps.now });
  const logger = deps.logger ?? console;
  const now = deps.now ?? Date.now;
  const monitorRunner =
    deps.monitorRunner ??
    new TrendReversalMonitorRunner({
      registry,
      logger,
      journalWriter: deps.journalWriter,
      now,
    });

  let stopped = false;
  let discoveryTimer: NodeJS.Timeout | null = null;
  let monitorTimer: NodeJS.Timeout | null = null;
  let discoveryInFlight = false;
  let monitorInFlight = false;

  const tickDiscovery = async (): Promise<WatchCandidate[]> => {
    if (stopped || discoveryInFlight) {
      return [];
    }

    discoveryInFlight = true;
    try {
      const raw = await withTimeout(
        deps.runDiscoveryWorker(),
        deps.discoveryTimeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS
      );
      const parsedCandidates = parseDowntrendWatchWorkerOutput({
        nowMs: now(),
        rawDiscoveryInputs: raw,
      });
      const acceptedCandidates: WatchCandidate[] = [];

      for (const candidate of parsedCandidates) {
        if (
          candidate.monitorRecommendation === "monitor" &&
          candidate.observationCompleteness >= 0.7
        ) {
          const stored = registry.upsertCandidate(candidate);
          acceptedCandidates.push(stored);
          if (deps.journalWriter) {
            await appendCandidateJournal(deps.journalWriter, stored);
          }
        }
      }

      registry.pruneExpired(now());
      logger.info?.(
        `[sidecar-discovery] parsed=${parsedCandidates.length} accepted=${acceptedCandidates.length}`
      );
      return acceptedCandidates;
    } catch (error) {
      logger.warn?.("[sidecar-discovery] tick failed", error);
      return [];
    } finally {
      discoveryInFlight = false;
    }
  };

  const tickMonitor = async (): Promise<TrendReversalMonitorRunResult> => {
    if (stopped || monitorInFlight) {
      return { checkedCandidates: 0, emittedObservations: [] };
    }

    monitorInFlight = true;
    try {
      registry.pruneExpired(now());
      return await monitorRunner.runOnce();
    } catch (error) {
      logger.warn?.("[sidecar-monitor] tick failed", error);
      return { checkedCandidates: 0, emittedObservations: [] };
    } finally {
      monitorInFlight = false;
    }
  };

  const tickAll = async (): Promise<SidecarWorkerLoopTickResult> => {
    const acceptedCandidates = await tickDiscovery();
    const prunedCandidates = registry.pruneExpired(now());
    const monitorResult = await tickMonitor();

    return {
      discoveredCandidates: registry.getActiveCandidates(now()),
      acceptedCandidates,
      prunedCandidates,
      monitorResult,
    };
  };

  if (deps.autoStart !== false) {
    void tickAll();

    discoveryTimer = setInterval(() => {
      void tickDiscovery();
    }, deps.discoveryIntervalMs ?? DEFAULT_DISCOVERY_INTERVAL_MS);

    monitorTimer = setInterval(() => {
      void tickMonitor();
    }, deps.monitorIntervalMs ?? DEFAULT_MONITOR_INTERVAL_MS);
  }

  return {
    registry,
    tickDiscovery,
    tickMonitor,
    tickAll,
    stop(): void {
      stopped = true;
      if (discoveryTimer) {
        clearInterval(discoveryTimer);
        discoveryTimer = null;
      }
      if (monitorTimer) {
        clearInterval(monitorTimer);
        monitorTimer = null;
      }
    },
  };
}
