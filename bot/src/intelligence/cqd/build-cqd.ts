/**
 * Pre-authority CQD boundary builder.
 * Compact, deterministic, replay-friendly snapshot only.
 */
import { hashDecision } from "../../core/determinism/hash.js";
import {
  CQDSnapshotV1Schema,
  type CQDSnapshotV1,
} from "../../core/contracts/cqd.js";
import type { DataQualityV1 } from "../../core/contracts/dataquality.js";
import { classifyFreshnessBand } from "../../core/validate/cross-source-validator.js";
import type { CandidateToken } from "../../discovery/contracts/candidate-token.js";
import type { DiscoveryEvidence } from "../../discovery/contracts/discovery-evidence.js";
import type { SourceObservation } from "../../discovery/contracts/source-observation.js";
import type { UniverseBuildResult, UniverseCoverageState } from "../universe/contracts/universe-build-result.js";

export interface BuildCQDSnapshotV1Input {
  evidence: DiscoveryEvidence;
  candidates: CandidateToken[];
  universe: UniverseBuildResult;
  quality: DataQualityV1;
}

type CqdSourceSummaryStatus = "OK" | "PARTIAL" | "STALE" | "ERROR" | "MISSING";

interface CqdSourceSummary {
  source: string;
  freshness_ms: number;
  status: CqdSourceSummaryStatus;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sortObservations(observations: SourceObservation[]): SourceObservation[] {
  return [...observations].sort((left, right) => {
    return (
      left.source.localeCompare(right.source) ||
      left.observedAtMs - right.observedAtMs ||
      left.payloadHash.localeCompare(right.payloadHash)
    );
  });
}

function normalizeCandidate(candidate: CandidateToken): CandidateToken {
  return {
    ...candidate,
    discoveryReasons: uniqueSorted(candidate.discoveryReasons),
    sourceSet: uniqueSorted(candidate.sourceSet) as CandidateToken["sourceSet"],
    evidenceRefs: uniqueSorted(candidate.evidenceRefs),
  };
}

function priorityRank(priority: CandidateToken["priority"]): number {
  switch (priority) {
    case "critical":
      return 3;
    case "high":
      return 2;
    case "medium":
      return 1;
    default:
      return 0;
  }
}

function sortCandidates(candidates: CandidateToken[]): CandidateToken[] {
  return [...candidates].map(normalizeCandidate).sort((left, right) => {
    return (
      left.token.localeCompare(right.token) ||
      left.chain.localeCompare(right.chain) ||
      (left.symbol ?? "").localeCompare(right.symbol ?? "") ||
      left.firstSeenMs - right.firstSeenMs ||
      priorityRank(right.priority) - priorityRank(left.priority) ||
      left.discoveryReasons.join("|").localeCompare(right.discoveryReasons.join("|")) ||
      left.sourceSet.join("|").localeCompare(right.sourceSet.join("|")) ||
      left.evidenceRefs.join("|").localeCompare(right.evidenceRefs.join("|"))
    );
  });
}

function collectSourceNames(
  evidence: DiscoveryEvidence,
  candidates: CandidateToken[],
  universe: UniverseBuildResult
): string[] {
  return uniqueSorted([
    ...evidence.sources,
    ...evidence.observations.map((observation) => observation.source),
    ...candidates.flatMap((candidate) => candidate.sourceSet),
    ...Object.keys(universe.sourceCoverage),
  ]);
}

function latestObservationBySource(
  observations: SourceObservation[]
): Map<string, SourceObservation> {
  const latest = new Map<string, SourceObservation>();

  for (const observation of sortObservations(observations)) {
    latest.set(observation.source, observation);
  }

  return latest;
}

function deriveSourceSummaryStatus(
  observation: SourceObservation | undefined,
  coverageStatus: UniverseCoverageState | undefined
): CqdSourceSummaryStatus {
  if (observation) {
    if (observation.status === "ERROR") {
      return "ERROR";
    }
    if (observation.isStale || classifyFreshnessBand(observation.freshnessMs) === "stale") {
      return "STALE";
    }
    return observation.status;
  }

  return coverageStatus ?? "MISSING";
}

function buildSourceSummaries(input: {
  evidence: DiscoveryEvidence;
  candidates: CandidateToken[];
  universe: UniverseBuildResult;
  quality: DataQualityV1;
}): {
  sourceSummaries: CqdSourceSummary[];
  freshestSourceTsMs: number;
  maxStalenessMs: number;
} {
  const sourceNames = collectSourceNames(input.evidence, input.candidates, input.universe);
  const latestObservations = latestObservationBySource(input.evidence.observations);
  const qualityTimestampMs = Date.parse(input.quality.timestamp);
  const snapshotAgeMs = Number.isFinite(qualityTimestampMs)
    ? Math.max(0, qualityTimestampMs - input.evidence.collectedAtMs)
    : 0;

  const sourceSummaries = sourceNames.map((source) => {
    const observation = latestObservations.get(source);
    const freshnessMs = observation?.freshnessMs ?? snapshotAgeMs;
    const status = deriveSourceSummaryStatus(
      observation,
      input.universe.sourceCoverage[source]?.status
    );

    return {
      source,
      freshness_ms: freshnessMs,
      status,
    };
  });

  const freshestSourceTsMs = input.evidence.observations.length > 0
    ? Math.max(...input.evidence.observations.map((observation) => observation.observedAtMs))
    : input.evidence.collectedAtMs;
  const maxStalenessMs = sourceSummaries.length > 0
    ? Math.max(...sourceSummaries.map((summary) => summary.freshness_ms))
    : snapshotAgeMs;

  return {
    sourceSummaries,
    freshestSourceTsMs,
    maxStalenessMs,
  };
}

function buildCandidateSummary(candidates: CandidateToken[]): string {
  if (candidates.length === 0) {
    return "none";
  }

  return candidates
    .map((candidate) => {
      const normalized = normalizeCandidate(candidate);
      const symbol = normalized.symbol ?? normalized.token;
      return [
        normalized.token,
        symbol,
        normalized.priority,
        normalized.discoveryReasons.join("+") || "none",
        normalized.sourceSet.join("+") || "none",
        normalized.evidenceRefs.join("+") || "none",
      ].join(":");
    })
    .join("|");
}

function buildSourceSummarySummary(sourceSummaries: CqdSourceSummary[]): string {
  if (sourceSummaries.length === 0) {
    return "none";
  }

  return sourceSummaries
    .map((summary) => `${summary.source}=${summary.status}@${summary.freshness_ms}`)
    .join("|");
}

function buildEvidencePack(input: {
  evidence: DiscoveryEvidence;
  candidates: CandidateToken[];
  universe: UniverseBuildResult;
  quality: DataQualityV1;
  sourceSummaries: CqdSourceSummary[];
}): string[] {
  const pack = [
    `evidence:${input.evidence.evidenceRef}`,
    `evidence_status:${input.evidence.status}`,
    `quality:${input.quality.status}:${input.quality.reasonCodes.join("+") || "none"}`,
    `universe:${input.universe.included ? "included" : "excluded"}:${
      input.universe.exclusionReasons.join("+") || "none"
    }`,
    `candidates:${buildCandidateSummary(input.candidates)}`,
    `sources:${buildSourceSummarySummary(input.sourceSummaries)}`,
  ];

  if (input.quality.missingCriticalFields.length > 0) {
    pack.push(`missing:${uniqueSorted(input.quality.missingCriticalFields).join("+")}`);
  }
  if (input.quality.staleSources.length > 0) {
    pack.push(`stale:${uniqueSorted(input.quality.staleSources).join("+")}`);
  }
  if (Object.keys(input.quality.disagreedSources).length > 0) {
    pack.push(
      `disagree:${uniqueSorted(Object.keys(input.quality.disagreedSources)).join("+")}`
    );
  }

  return uniqueSorted(pack);
}

function buildAnomalyFlags(input: {
  evidence: DiscoveryEvidence;
  quality: DataQualityV1;
  universe: UniverseBuildResult;
}): string[] {
  const flags = new Set<string>();

  if (input.quality.status === "degraded") {
    flags.add("QUALITY_DEGRADED");
  }
  if (input.evidence.status === "PARTIAL") {
    flags.add("EVIDENCE_PARTIAL");
  }
  if (input.quality.missingCriticalFields.length > 0) {
    flags.add("MISSING_CRITICAL_FIELDS");
  }
  if (input.quality.staleSources.length > 0) {
    flags.add("STALE_SOURCES");
  }
  if (Object.keys(input.quality.disagreedSources).length > 0) {
    flags.add("DISAGREED_SOURCES");
  }
  if (input.quality.crossSourceConfidence < 0.85) {
    flags.add("LOW_CONFIDENCE");
  }
  if (!input.universe.included) {
    flags.add("UNIVERSE_EXCLUDED");
  }

  return [...flags].sort((left, right) => left.localeCompare(right)).slice(0, 8);
}

function buildDivergenceSummary(input: {
  evidence: DiscoveryEvidence;
  quality: DataQualityV1;
}): {
  price_divergence_pct?: number;
  volume_divergence_pct?: number;
  liquidity_divergence_pct?: number;
} {
  const fields = uniqueSorted([
    ...input.evidence.disagreedFields,
    ...Object.keys(input.quality.disagreedSources),
  ]).map((field) => field.toLowerCase());
  const divergence: {
    price_divergence_pct?: number;
    volume_divergence_pct?: number;
    liquidity_divergence_pct?: number;
  } = {};

  if (fields.some((field) => field.includes("price"))) {
    divergence.price_divergence_pct = input.quality.discrepancy;
  }
  if (fields.some((field) => field.includes("volume"))) {
    divergence.volume_divergence_pct = input.quality.discrepancy;
  }
  if (fields.some((field) => field.includes("liquidity"))) {
    divergence.liquidity_divergence_pct = input.quality.discrepancy;
  }

  return divergence;
}

function buildSourcesAggregate(input: {
  freshestSourceTsMs: number;
  maxStalenessMs: number;
  evidence: DiscoveryEvidence;
  quality: DataQualityV1;
}): CQDSnapshotV1["sources"] {
  return {
    freshest_source_ts_ms: input.freshestSourceTsMs,
    max_staleness_ms: input.maxStalenessMs,
    ...buildDivergenceSummary({
      evidence: input.evidence,
      quality: input.quality,
    }),
  };
}

function buildConfidence(quality: DataQualityV1): number {
  const degradedPenalty = quality.status === "degraded" ? 0.05 : 0;
  return clamp01(quality.crossSourceConfidence - degradedPenalty);
}

function toTsBucket(timestamp: string): number {
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) {
    throw new Error(`CQD_INVALID_TIMESTAMP:${timestamp}`);
  }

  return Math.floor(timestampMs / 60_000);
}

export function buildCQDSnapshotV1(input: BuildCQDSnapshotV1Input): CQDSnapshotV1 {
  if (
    input.quality.status === "fail" ||
    !input.quality.routeViable ||
    !input.quality.liquidityEligible ||
    input.evidence.status === "REJECTED" ||
    !input.universe.included
  ) {
    throw new Error(
      `CQD_BUILD_BLOCKED:${input.quality.status}:${input.evidence.status}:${
        input.universe.included ? "included" : "excluded"
      }`
    );
  }

  const matchingCandidates = sortCandidates(
    input.candidates.filter(
      (candidate) =>
        candidate.token === input.evidence.token &&
        candidate.chain === input.evidence.chain
    )
  );

  if (matchingCandidates.length === 0) {
    throw new Error(`CQD_BUILD_BLOCKED:missing_candidates:${input.evidence.token}`);
  }

  const { sourceSummaries, freshestSourceTsMs, maxStalenessMs } = buildSourceSummaries({
    evidence: input.evidence,
    candidates: matchingCandidates,
    universe: input.universe,
    quality: input.quality,
  });
  const anomalyFlags = buildAnomalyFlags({
    evidence: input.evidence,
    quality: input.quality,
    universe: input.universe,
  });
  const features = Object.fromEntries(
    Object.entries(input.universe.normalizedFeatures)
      .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
      .sort(([left], [right]) => left.localeCompare(right))
  );
  const evidencePack = buildEvidencePack({
    evidence: input.evidence,
    candidates: matchingCandidates,
    universe: input.universe,
    quality: input.quality,
    sourceSummaries,
  });
  const snapshotWithoutHash = {
    schema_version: "cqd.snapshot.v1" as const,
    chain: input.universe.chain,
    token: input.evidence.token,
    ts_bucket: toTsBucket(input.quality.timestamp),
    features,
    confidence: buildConfidence(input.quality),
    anomaly_flags: anomalyFlags,
    evidence_pack: evidencePack,
    source_summaries: sourceSummaries,
    sources: buildSourcesAggregate({
      freshestSourceTsMs,
      maxStalenessMs,
      evidence: input.evidence,
      quality: input.quality,
    }),
  };
  const hash = hashDecision(snapshotWithoutHash);

  return CQDSnapshotV1Schema.parse({
    ...snapshotWithoutHash,
    hash,
  });
}
