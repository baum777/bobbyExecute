import type { JournalWriter } from "../../journal-writer/writer.js";
import type { WatchCandidate } from "../../discovery/contracts/watch-candidate.js";
import type { WatchCandidateRegistry } from "../../discovery/watch-candidate-registry.js";
import type { DataQualityV1 } from "../quality/contracts/data-quality.v1.js";
import {
  TrendReversalObservationV1Schema,
  type TrendReversalObservationV1,
} from "./contracts/trend-reversal-observation.v1.js";

export interface TrendReversalMonitorRunnerDeps {
  registry: WatchCandidateRegistry;
  logger?: Pick<Console, "info" | "error" | "warn">;
  journalWriter?: JournalWriter;
  now?: () => number;
  dataQualityByToken?: (token: string) => DataQualityV1 | null | undefined;
  monitorCandidate?: (
    candidate: WatchCandidate,
    quality: DataQualityV1 | null | undefined
  ) => TrendReversalObservationV1;
}

export interface TrendReversalMonitorRunResult {
  checkedCandidates: number;
  emittedObservations: TrendReversalObservationV1[];
}

function defaultObservationState(
  candidate: WatchCandidate
): TrendReversalObservationV1["observationState"] {
  if (candidate.observationCompleteness >= 0.9) {
    return "STRUCTURE_SHIFT_FORMING";
  }
  if (candidate.observationCompleteness >= 0.8) {
    return "RECLAIM_ATTEMPT";
  }
  if (candidate.observationCompleteness >= 0.7) {
    return "WEAK_BOUNCE";
  }
  return "DOWN_TREND_CONFIRMED";
}

function defaultMonitorCandidate(
  candidate: WatchCandidate,
  quality: DataQualityV1 | null | undefined,
  observedAt: number
): TrendReversalObservationV1 {
  const reasons = quality?.reasons ?? [];
  return TrendReversalObservationV1Schema.parse({
    schema_version: "trend_reversal_observation.v1",
    token: candidate.token,
    observationState: defaultObservationState(candidate),
    structureContext: {
      drawdownPct: quality
        ? Math.max(0, Math.round((1 - quality.freshnessScore) * 1000) / 10)
        : undefined,
      reclaimZone: candidate.observationCompleteness >= 0.85 ? [0.95, 1.05] : undefined,
      lowerHigh: quality?.crossSourceConfidence,
    },
    monitoringConfidence: Math.max(
      0,
      Math.min(
        1,
        ((quality?.completeness ?? candidate.observationCompleteness) +
          candidate.observationCompleteness) /
          2
      )
    ),
    invalidationFlags: reasons.slice().sort(),
    evidenceRefs: candidate.evidenceRefs.slice().sort(),
    observedAt,
  });
}

async function appendObservationJournal(
  journalWriter: JournalWriter,
  observation: TrendReversalObservationV1
): Promise<void> {
  await journalWriter.append({
    traceId: `sidecar-monitor:${observation.token}:${observation.observedAt}`,
    timestamp: new Date(observation.observedAt).toISOString(),
    stage: "sidecar.monitor.observation",
    input: {
      token: observation.token,
      observationState: observation.observationState,
    },
    output: observation,
    blocked: false,
  });
}

export class TrendReversalMonitorRunner {
  private readonly logger: Pick<Console, "info" | "error" | "warn">;
  private readonly now: () => number;
  private readonly dataQualityByToken: (token: string) => DataQualityV1 | null | undefined;
  private readonly monitorCandidate: (
    candidate: WatchCandidate,
    quality: DataQualityV1 | null | undefined
  ) => TrendReversalObservationV1;

  constructor(private readonly deps: TrendReversalMonitorRunnerDeps) {
    this.logger = deps.logger ?? console;
    this.now = deps.now ?? Date.now;
    this.dataQualityByToken = deps.dataQualityByToken ?? (() => null);
    this.monitorCandidate =
      deps.monitorCandidate ??
      ((candidate, quality) => defaultMonitorCandidate(candidate, quality, this.now()));
  }

  async runOnce(): Promise<TrendReversalMonitorRunResult> {
    const now = this.now();
    const candidates = this.deps.registry
      .getActiveCandidates(now)
      .filter((candidate) => {
        const quality = this.dataQualityByToken(candidate.token);
        return quality == null || quality.completeness >= 0.7;
      });

    const emittedObservations: TrendReversalObservationV1[] = [];

    for (const candidate of candidates) {
      const quality = this.dataQualityByToken(candidate.token);
      const observation = this.monitorCandidate(candidate, quality);
      emittedObservations.push(observation);

      if (this.deps.journalWriter) {
        await appendObservationJournal(this.deps.journalWriter, observation);
      }
    }

    this.logger.info?.(
      `[sidecar-monitor] checked=${candidates.length} emitted=${emittedObservations.length}`
    );

    return {
      checkedCandidates: candidates.length,
      emittedObservations,
    };
  }
}
