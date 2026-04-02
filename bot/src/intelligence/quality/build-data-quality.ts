/**
 * Pre-authority data-quality gate for Wave 1.
 * Deterministic, fail-closed, and bounded to upstream evidence/candidate/universe artifacts.
 */
import { hashDecision } from "../../core/determinism/hash.js";
import {
  calculateDiscrepancy,
  generateDiscrepancyFlags,
  CROSS_SOURCE_CONFIDENCE_MIN,
  DATA_QUALITY_MIN_COMPLETENESS,
  DISCREPANCY_THRESHOLD,
  DataQualityV1Schema,
  type DataQualityV1,
  type SourceQuality,
} from "../../core/contracts/dataquality.js";
import { calculateTokenConfidence } from "../../core/contracts/tokenuniverse.js";
import {
  classifyFreshnessBand,
  freshnessScoreForMs,
} from "../../core/validate/cross-source-validator.js";
import type { CandidateToken } from "../../discovery/contracts/candidate-token.js";
import type { DiscoveryEvidence } from "../../discovery/contracts/discovery-evidence.js";
import type { SourceObservation } from "../../discovery/contracts/source-observation.js";
import type { UniverseBuildResult } from "../universe/contracts/universe-build-result.js";

export interface BuildDataQualityV1Input {
  evidence: DiscoveryEvidence;
  candidates: CandidateToken[];
  universe: UniverseBuildResult;
  traceId?: string;
  timestamp?: string;
}

const LIQUIDITY_FEATURE_KEYS = [
  "liquidityUsd",
  "liquidity",
  "liquidityScore",
  "liquidity_score",
] as const;

const FRESHNESS_FLAG_ADJUSTMENT = 0.05;

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
  return [...candidates].sort((left, right) => {
    return (
      left.token.localeCompare(right.token) ||
      left.chain.localeCompare(right.chain) ||
      (left.symbol ?? "").localeCompare(right.symbol ?? "") ||
      left.firstSeenMs - right.firstSeenMs ||
      priorityRank(right.priority) - priorityRank(left.priority) ||
      left.sourceSet.join("|").localeCompare(right.sourceSet.join("|")) ||
      left.evidenceRefs.join("|").localeCompare(right.evidenceRefs.join("|"))
    );
  });
}

function sourceCompletenessScore(status: SourceObservation["status"]): number {
  switch (status) {
    case "OK":
      return 1;
    case "PARTIAL":
      return 0.5;
    default:
      return 0;
  }
}

function sourceFreshnessScore(observation: SourceObservation): number {
  const bandScore = freshnessScoreForMs(observation.freshnessMs);
  const conservativeScore = observation.isStale
    ? Math.max(0, bandScore - FRESHNESS_FLAG_ADJUSTMENT)
    : bandScore;
  return clamp01(conservativeScore);
}

function buildSourceBreakdown(
  observations: SourceObservation[]
): {
  sourceBreakdown: Record<string, SourceQuality>;
  sourceQualityMap: Record<string, number>;
  staleSources: string[];
} {
  const grouped = new Map<string, SourceObservation[]>();

  for (const observation of sortObservations(observations)) {
    const current = grouped.get(observation.source) ?? [];
    current.push(observation);
    grouped.set(observation.source, current);
  }

  const sourceBreakdown: Record<string, SourceQuality> = {};
  const sourceQualityMap: Record<string, number> = {};
  const staleSources = new Set<string>();

  for (const source of [...grouped.keys()].sort((left, right) => left.localeCompare(right))) {
    const latest = [...(grouped.get(source) ?? [])].sort((left, right) => {
      return (
        left.observedAtMs - right.observedAtMs ||
        left.payloadHash.localeCompare(right.payloadHash)
      );
    }).at(-1);

    if (!latest) {
      continue;
    }

    const completeness = sourceCompletenessScore(latest.status);
    const freshness = sourceFreshnessScore(latest);
    const reliability = clamp01((completeness + freshness) / 2);

    if (latest.isStale || classifyFreshnessBand(latest.freshnessMs) !== "fresh") {
      staleSources.add(source);
    }

    sourceBreakdown[source] = {
      source,
      completeness,
      freshness,
      reliability,
      latency_ms: latest.freshnessMs,
    };
    sourceQualityMap[source] = reliability;
  }

  return {
    sourceBreakdown,
    sourceQualityMap,
    staleSources: [...staleSources].sort((left, right) => left.localeCompare(right)),
  };
}

function collectSourceNames(
  evidence: DiscoveryEvidence,
  candidates: CandidateToken[],
  observations: SourceObservation[]
): string[] {
  return uniqueSorted([
    ...evidence.sources,
    ...candidates.flatMap((candidate) => candidate.sourceSet),
    ...observations.map((observation) => observation.source),
  ]);
}

function collectMissingCriticalFields(
  evidence: DiscoveryEvidence,
  matchingCandidates: CandidateToken[],
  sourceNames: string[]
): string[] {
  const missing = new Set<string>(evidence.missingFields);

  if (evidence.observations.length === 0) {
    missing.add("observations");
  }
  if (matchingCandidates.length === 0) {
    missing.add("candidate_token");
  }
  if (sourceNames.length === 0) {
    missing.add("sources");
  }

  return uniqueSorted([...missing]);
}

function hasPositiveLiquidityFeature(features: Record<string, number>): boolean {
  return LIQUIDITY_FEATURE_KEYS.some((key) => {
    const value = features[key];
    return typeof value === "number" && value > 0;
  });
}

function deriveLiquidityFeature(features: Record<string, number>): number {
  let best = 0;
  for (const key of LIQUIDITY_FEATURE_KEYS) {
    const value = features[key];
    if (typeof value === "number") {
      best = Math.max(best, value);
    }
  }
  return best;
}

function deriveReasonCodes(input: {
  missingCriticalFields: string[];
  routeViable: boolean;
  liquidityEligible: boolean;
  evidenceStatus: DiscoveryEvidence["status"];
  universeIncluded: boolean;
  observationCount: number;
  candidateCount: number;
  staleSources: string[];
  disagreedSourceFields: string[];
  completeness: number;
  freshness: number;
  sourceReliability: number;
  crossSourceConfidence: number;
  discrepancy: number;
}): string[] {
  const reasonCodes: string[] = [];

  if (input.missingCriticalFields.length > 0) {
    reasonCodes.push("DQ_MISSING_CRITICAL_FIELDS");
  }
  if (input.observationCount === 0) {
    reasonCodes.push("DQ_NO_OBSERVATIONS");
  }
  if (input.candidateCount === 0) {
    reasonCodes.push("DQ_NO_CANDIDATES");
  }
  if (input.evidenceStatus === "REJECTED") {
    reasonCodes.push("DQ_REJECTED_EVIDENCE");
  }
  if (!input.universeIncluded) {
    reasonCodes.push("DQ_UNIVERSE_EXCLUDED");
  }
  if (!input.routeViable) {
    reasonCodes.push("DQ_ROUTE_NOT_VIABLE");
  }
  if (!input.liquidityEligible) {
    reasonCodes.push("DQ_LIQUIDITY_INELIGIBLE");
  }
  if (input.staleSources.length > 0) {
    reasonCodes.push("DQ_STALE_SOURCES");
  }
  if (input.disagreedSourceFields.length > 0) {
    reasonCodes.push("DQ_DISAGREED_SOURCES");
  }
  if (input.completeness < DATA_QUALITY_MIN_COMPLETENESS) {
    reasonCodes.push("DQ_LOW_COMPLETENESS");
  }
  if (input.freshness < CROSS_SOURCE_CONFIDENCE_MIN) {
    reasonCodes.push("DQ_LOW_FRESHNESS");
  }
  if (input.sourceReliability < CROSS_SOURCE_CONFIDENCE_MIN) {
    reasonCodes.push("DQ_LOW_SOURCE_RELIABILITY");
  }
  if (input.crossSourceConfidence < CROSS_SOURCE_CONFIDENCE_MIN) {
    reasonCodes.push("DQ_LOW_CROSS_SOURCE_CONFIDENCE");
  }
  if (input.discrepancy > DISCREPANCY_THRESHOLD) {
    reasonCodes.push("DQ_HIGH_DISCREPANCY");
  }

  return uniqueSorted(reasonCodes);
}

function deriveStatus(input: {
  missingCriticalFields: string[];
  routeViable: boolean;
  liquidityEligible: boolean;
  evidenceStatus: DiscoveryEvidence["status"];
  staleSources: string[];
  disagreedSourceFields: string[];
  completeness: number;
  freshness: number;
  sourceReliability: number;
  crossSourceConfidence: number;
  discrepancy: number;
}): DataQualityV1["status"] {
  if (
    input.missingCriticalFields.length > 0 ||
    input.evidenceStatus === "REJECTED" ||
    !input.routeViable ||
    !input.liquidityEligible
  ) {
    return "fail";
  }

  if (
    input.evidenceStatus === "PARTIAL" ||
    input.staleSources.length > 0 ||
    input.disagreedSourceFields.length > 0 ||
    input.completeness < DATA_QUALITY_MIN_COMPLETENESS ||
    input.freshness < CROSS_SOURCE_CONFIDENCE_MIN ||
    input.sourceReliability < CROSS_SOURCE_CONFIDENCE_MIN ||
    input.crossSourceConfidence < CROSS_SOURCE_CONFIDENCE_MIN ||
    input.discrepancy > DISCREPANCY_THRESHOLD
  ) {
    return "degraded";
  }

  return "pass";
}

export function buildDataQualityV1(input: BuildDataQualityV1Input): DataQualityV1 {
  const evidence = input.evidence;
  const observations = sortObservations(evidence.observations);
  const matchingCandidates = sortCandidates(
    input.candidates.filter((candidate) => candidate.token === evidence.token && candidate.chain === evidence.chain)
  );
  const universeAligned = input.universe.token === evidence.token && input.universe.chain === evidence.chain;
  const sourceNames = collectSourceNames(evidence, matchingCandidates, observations);
  const missingCriticalFields = collectMissingCriticalFields(evidence, matchingCandidates, sourceNames);
  const { sourceBreakdown, sourceQualityMap, staleSources } = buildSourceBreakdown(observations);
  const disagreedSources = Object.fromEntries(
    Object.entries(evidence.disagreedSources)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, sources]) => [field, uniqueSorted(sources)])
  );
  const disagreedSourceFields = Object.keys(disagreedSources).sort((left, right) => left.localeCompare(right));
  const sourceReliability = Object.keys(sourceQualityMap).length > 0
    ? calculateTokenConfidence(Object.keys(sourceQualityMap), sourceQualityMap)
    : 0;
  const completeness = clamp01(evidence.completeness);
  const freshness = observations.length > 0
    ? clamp01(Math.min(...observations.map((observation) => sourceFreshnessScore(observation))))
    : 0;
  const discrepancy = clamp01(
    sourceNames.length > 1
      ? calculateDiscrepancy(Object.values(sourceQualityMap))
      : 0
  );
  const routeViable =
    evidence.status !== "REJECTED" &&
    evidence.observations.length > 0 &&
    matchingCandidates.length > 0 &&
    universeAligned &&
    input.universe.included &&
    missingCriticalFields.length === 0;
  const liquidityFeature = deriveLiquidityFeature(input.universe.normalizedFeatures);
  const liquidityEligible = routeViable && liquidityFeature > 0 && hasPositiveLiquidityFeature(input.universe.normalizedFeatures);
  const crossSourceConfidence = clamp01(
    (completeness + freshness + sourceReliability) / 3 -
      (discrepancy * 0.25) -
      (staleSources.length > 0 ? 0.05 : 0) -
      (disagreedSourceFields.length > 0 ? 0.05 : 0)
  );
  const status = deriveStatus({
    missingCriticalFields,
    routeViable,
    liquidityEligible,
    evidenceStatus: evidence.status,
    staleSources,
    disagreedSourceFields,
    completeness,
    freshness,
    sourceReliability,
    crossSourceConfidence,
    discrepancy,
  });
  const reasonCodes = deriveReasonCodes({
    missingCriticalFields,
    routeViable,
    liquidityEligible,
    evidenceStatus: evidence.status,
    universeIncluded: input.universe.included,
    observationCount: observations.length,
    candidateCount: matchingCandidates.length,
    staleSources,
    disagreedSourceFields,
    completeness,
    freshness,
    sourceReliability,
    crossSourceConfidence,
    discrepancy,
  });

  const collectedAtMs = Math.max(
    evidence.collectedAtMs,
    ...observations.map((observation) => observation.observedAtMs),
    ...matchingCandidates.map((candidate) => candidate.firstSeenMs)
  );
  const traceSeed = {
    evidenceId: evidence.evidenceId,
    token: evidence.token,
    chain: evidence.chain,
    sourceNames,
    candidateEvidenceRefs: matchingCandidates.flatMap((candidate) => candidate.evidenceRefs),
    universeAligned,
    universeIncluded: input.universe.included,
    routeViable,
    liquidityEligible,
    status,
  };
  const traceId = input.traceId ?? `dq:${hashDecision(traceSeed).slice(0, 16)}`;
  const timestamp = input.timestamp ?? new Date(collectedAtMs).toISOString();
  const discrepancyFlags = generateDiscrepancyFlags(
    sourceQualityMap,
    DISCREPANCY_THRESHOLD,
    "data_quality_divergence"
  );

  return DataQualityV1Schema.parse({
    schema_version: "data_quality.v1",
    traceId,
    timestamp,
    completeness,
    freshness,
    discrepancy,
    sourceReliability,
    crossSourceConfidence,
    confidence: crossSourceConfidence,
    source_breakdown: sourceBreakdown,
    discrepancy_flags: uniqueSorted(discrepancyFlags),
    missingCriticalFields,
    staleSources,
    disagreedSources,
    routeViable,
    liquidityEligible,
    status,
    reasonCodes,
  });
}
