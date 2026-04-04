/**
 * Trend reversal monitor runner.
 * Sidecar-safe observational runner: replay/enrichment/watchlist only, never authority-canonical.
 * Emits observations, not approvals, blocks, or control decisions.
 */
import type { JournalWriter } from "../../journal-writer/writer.js";
import type { WatchCandidate } from "../../discovery/contracts/watch-candidate.js";
import type { WatchCandidateRegistry } from "../../discovery/watch-candidate-registry.js";
import type { DataQualityV1 } from "../quality/contracts/data-quality.v1.js";
import { hashResult } from "../../core/determinism/hash.js";
import { sortRecord, uniqueSorted } from "./deterministic.js";
import {
  TrendReversalObservationParticipationSignalsSchema,
  TrendReversalObservationRiskSignalsSchema,
  TrendReversalObservationSourceCoverageEntrySchema,
  TrendReversalObservationStructureSignalsSchema,
  TrendReversalObservationV1Schema,
  type TrendReversalObservationParticipationSignals,
  type TrendReversalObservationRiskSignals,
  type TrendReversalObservationSourceCoverageEntry,
  type TrendReversalObservationState,
  type TrendReversalObservationStructureSignals,
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

function deriveState(
  candidate: WatchCandidate,
  quality: DataQualityV1 | null | undefined
): TrendReversalObservationState {
  if (quality?.status === "fail" || candidate.observationCompleteness < 0.7) {
    return "invalidated";
  }

  if (candidate.observationCompleteness >= 0.95 && (quality?.crossSourceConfidence ?? 0) >= 0.9) {
    return "structure_shift_confirming";
  }

  if (candidate.observationCompleteness >= 0.9) {
    return "structure_shift_possible";
  }

  if (candidate.observationCompleteness >= 0.8) {
    return "reclaim_attempt";
  }

  if (candidate.observationCompleteness >= 0.7) {
    return "weak_reclaim";
  }

  return "dead_bounce";
}

function buildStructureSignals(
  candidate: WatchCandidate,
  quality: DataQualityV1 | null | undefined
): TrendReversalObservationStructureSignals {
  const completeness = candidate.observationCompleteness;

  return TrendReversalObservationStructureSignalsSchema.parse({
    higherLowForming: completeness >= 0.95 ? true : null,
    reclaimingLevel: completeness >= 0.8 ? true : null,
    rejectionAtResistance: completeness < 0.8 ? true : null,
    breakdownInvalidation: quality?.status === "fail" ? true : null,
  });
}

function buildParticipationSignals(
  candidate: WatchCandidate,
  quality: DataQualityV1 | null | undefined
): TrendReversalObservationParticipationSignals {
  return TrendReversalObservationParticipationSignalsSchema.parse({
    buyerStrengthIncreasing:
      quality?.crossSourceConfidence !== undefined
        ? quality.crossSourceConfidence >= 0.85
        : null,
    volumeExpansion: candidate.observationCompleteness >= 0.8 ? true : null,
    holderGrowthVisible: candidate.observationCompleteness >= 0.75 ? true : null,
  });
}

function buildRiskSignals(
  quality: DataQualityV1 | null | undefined
): TrendReversalObservationRiskSignals {
  return TrendReversalObservationRiskSignalsSchema.parse({
    liquidityDrop: quality?.liquidityEligible === false ? true : null,
    distributionRisk:
      quality?.discrepancy === undefined ? null : quality.discrepancy >= 0.1,
    exhaustionWickPattern:
      quality?.freshness === undefined ? null : quality.freshness < 0.8,
  });
}

function buildSourceCoverage(
  quality: DataQualityV1 | null | undefined
): Record<string, TrendReversalObservationSourceCoverageEntry> {
  if (!quality || !quality.source_breakdown) {
    return {};
  }

  const sources = uniqueSorted(Object.keys(quality.source_breakdown));
  return sortRecord(
    Object.fromEntries(
      sources.map((source) => {
        const breakdown = quality.source_breakdown[source];
        const isStale = quality.staleSources.includes(source);
        const status = isStale
          ? "STALE"
          : breakdown.completeness === 1 && breakdown.freshness === 1
            ? "OK"
            : breakdown.completeness > 0 || breakdown.freshness > 0
              ? "PARTIAL"
              : "MISSING";

        return [
          source,
          TrendReversalObservationSourceCoverageEntrySchema.parse({
            status,
            isStale,
          }),
        ];
      })
    )
  );
}

function buildConfidence(
  candidate: WatchCandidate,
  quality: DataQualityV1 | null | undefined,
  sourceCoverage: Record<string, TrendReversalObservationSourceCoverageEntry>
): number {
  const coverageCompleteness = Object.values(sourceCoverage)
    .map((entry) => entry.isStale ? 0.5 : 1)
    .filter((value) => Number.isFinite(value));

  const values = [
    candidate.observationCompleteness,
    quality?.completeness,
    quality?.crossSourceConfidence,
    coverageCompleteness.length > 0
      ? coverageCompleteness.reduce((total, value) => total + value, 0) /
        coverageCompleteness.length
      : undefined,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, Math.min(...values)));
}

function buildMissingFields(
  candidate: WatchCandidate,
  quality: DataQualityV1 | null | undefined
): string[] {
  return uniqueSorted([
    ...(quality?.missingCriticalFields ?? []),
    ...(quality?.status === "fail" ? ["dataQuality.status"] : []),
    ...(candidate.observationCompleteness < 0.7 ? ["candidate.observationCompleteness"] : []),
  ]);
}

function buildObservation(
  candidate: WatchCandidate,
  quality: DataQualityV1 | null | undefined,
  observedAt: number
): TrendReversalObservationV1 {
  const structureSignals = buildStructureSignals(candidate, quality);
  const participationSignals = buildParticipationSignals(candidate, quality);
  const riskSignals = buildRiskSignals(quality);
  const sourceCoverage = buildSourceCoverage(quality);
  const state = deriveState(candidate, quality);
  const invalidationReasons = uniqueSorted([
    ...(quality?.status === "fail" ? ["data_quality_fail"] : []),
    ...(state === "invalidated" ? ["monitor_invalidation"] : []),
  ]);
  const confidence = invalidationReasons.length > 0 ? 0 : buildConfidence(candidate, quality, sourceCoverage);

  const observation = {
    schema_version: "trend_reversal_observation.v1" as const,
    token: candidate.token,
    chain: "solana" as const,
    observedAt: new Date(observedAt).toISOString(),
    inputRef: hashResult({
      candidate,
      quality: quality ?? null,
      observedAt,
    }),
    state,
    confidence,
    structureSignals,
    participationSignals,
    riskSignals,
    invalidationReasons,
    evidenceRefs: uniqueSorted(candidate.evidenceRefs),
    missingFields: buildMissingFields(candidate, quality),
    sourceCoverage,
  };

  return TrendReversalObservationV1Schema.parse(observation);
}

function appendObservationJournal(
  journalWriter: JournalWriter,
  observation: TrendReversalObservationV1
): Promise<void> {
  return journalWriter.append({
    traceId: `sidecar-monitor:${observation.token}:${observation.observedAt}`,
    timestamp: observation.observedAt,
    stage: "sidecar.monitor.observation",
    input: {
      token: observation.token,
      state: observation.state,
      confidence: observation.confidence,
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
      ((candidate, quality) => buildObservation(candidate, quality, this.now()));
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
