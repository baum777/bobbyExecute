/**
 * Migration parity harness (PR-M0-02).
 * Test-only shadow/derived scaffolding for old/new deterministic lineage comparison.
 * This file is intentionally non-authoritative and must never be imported by runtime code.
 */
import { DATA_QUALITY_MIN_COMPLETENESS } from "@bot/core/contracts/dataquality.js";
import { buildTokenUniverse } from "@bot/core/universe/token-universe-builder.js";
import type { MarketSnapshot } from "@bot/core/contracts/market.js";
import type { PatternResult } from "@bot/core/contracts/pattern.js";
import { runScoringEngine } from "@bot/scoring/scoring-engine.js";
import { runSignalEngine } from "@bot/signals/signal-engine.js";
import { createSourceObservation } from "@bot/discovery/source-observation.js";
import { buildDiscoveryEvidence } from "@bot/discovery/discovery-evidence.js";
import { createCandidateToken } from "@bot/discovery/candidate-discovery.js";
import { buildUniverseResult } from "@bot/intelligence/universe/build-universe-result.js";
import { buildDataQualityV1 } from "@bot/intelligence/quality/build-data-quality.js";
import { buildCQDSnapshotV1 } from "@bot/intelligence/cqd/build-cqd.js";
import {
  buildSignalPackV1,
  buildTrendReversalMonitorInputV1,
} from "@bot/intelligence/forensics/build-signal-pack.js";
import { buildTrendReversalObservationV1 } from "@bot/intelligence/forensics/trend-reversal-monitor-worker.js";
import { buildConstructedSignalSetV1 } from "@bot/intelligence/signals/build-constructed-signal-set.js";
import { buildScoreCardV1 } from "@bot/intelligence/scoring/build-score-card.js";
import type { TestSignal, TestSignalPack } from "../fixtures/mci-bci-test-shapes.js";
import type {
  MigrationParityFixture,
  MigrationParityObservationFixture,
} from "../fixtures/migration/parity-fixtures.js";

const DEFAULT_CHAIN = "solana" as const;
const FRESHNESS_SOFT_LIMIT_MS = 30_000;

export const MIGRATION_PARITY_SURVIVOR_NAMING_LINE = Object.freeze([
  "SourceObservation",
  "DiscoveryEvidence",
  "CandidateToken",
  "UniverseBuildResult",
  "DataQualityV1",
  "CQDSnapshotV1",
  "ConstructedSignalSetV1",
  "ScoreCardV1",
] as const);

export interface MigrationParityShadowGuard {
  harnessMode: "shadow";
  derivedOnly: true;
  nonAuthoritative: true;
  canonicalDecisionHistory: false;
  authorityInfluence: false;
}

export interface MigrationParityDeltaField {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changed: boolean;
}

export interface MigrationParityComparison {
  stableFields: Record<string, unknown>;
  deltaFields: MigrationParityDeltaField[];
  expectedDeltaFields: string[];
  unexpectedDeltaFields: string[];
  missingExpectedDeltaFields: string[];
  notes: string[];
}

export interface LegacyDeterministicArtifacts {
  executed: true;
  universeTokenCount: number;
  signalBlocked: boolean;
  signalReasonCodes: string[];
  qualityStatus: "pass" | "fail";
  qualityCrossSourceConfidence: number;
  scoreHybrid: number;
  scoreConfidence: number;
  riskFlagsCount: number;
}

export interface SurvivorDeterministicArtifacts {
  executed: true;
  sourceObservationCount: number;
  evidenceStatus: "COLLECTED" | "PARTIAL" | "REJECTED";
  candidatePriority: "low" | "medium" | "high" | "critical";
  universeIncluded: boolean;
  qualityStatus: "pass" | "degraded" | "fail";
  qualityCrossSourceConfidence: number;
  cqdPresent: boolean;
  cqdStageError: string | null;
  cqdAnomalyFlagsCount: number;
  scorePresent: boolean;
  scoreComposite: number | null;
  scoreConfidence: number | null;
  constructedBuildStatus: "built" | "degraded" | "invalidated" | null;
  scoreBuildStatus: "built" | "degraded" | "invalidated" | null;
  derivedBlocked: boolean;
}

export interface MigrationParityHarnessResult {
  fixtureId: string;
  scenario: string;
  survivorNamingLine: readonly string[];
  shadowGuard: MigrationParityShadowGuard;
  oldLineage: LegacyDeterministicArtifacts;
  newLineage: SurvivorDeterministicArtifacts;
  comparison: MigrationParityComparison;
}

interface SharedFixtureArtifacts {
  timestampIso: string;
  fixedNowMs: number;
  sourceObservations: ReturnType<typeof createSourceObservation>[];
  evidence: ReturnType<typeof buildDiscoveryEvidence>;
  candidate: ReturnType<typeof createCandidateToken>;
  universe: ReturnType<typeof buildUniverseResult>;
  quality: ReturnType<typeof buildDataQualityV1>;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function withFixedNow<T>(fixedNowMs: number, callback: () => T): T {
  const originalNow = Date.now;
  Date.now = () => fixedNowMs;
  try {
    return callback();
  } finally {
    Date.now = originalNow;
  }
}

function marketSourceToLegacy(
  source: MigrationParityFixture["market"]["source"]
): TestSignal["source"] {
  if (source === "dexpaprika") {
    return "paprika";
  }
  if (source === "dexscreener") {
    return "dexscreener";
  }
  return "moralis";
}

function observationSourceToLegacy(
  source: MigrationParityObservationFixture["source"],
  fixtureMarketSource: MigrationParityFixture["market"]["source"]
): TestSignal["source"] {
  switch (source) {
    case "market":
      return marketSourceToLegacy(fixtureMarketSource);
    case "social":
      return "x_tl_semantic";
    case "wallet":
      return "x_tl_keyword";
    case "onchain":
      return "moralis";
    default:
      return "paprika";
  }
}

function buildSharedArtifacts(fixture: MigrationParityFixture): SharedFixtureArtifacts {
  const timestampIso = new Date(fixture.baseTimestampMs).toISOString();
  const sourceObservations = fixture.observations.map((observation) =>
    createSourceObservation({
      source: observation.source,
      token: fixture.token,
      chain: DEFAULT_CHAIN,
      observedAtMs: fixture.baseTimestampMs + observation.observedAtOffsetMs,
      freshnessMs: observation.freshnessMs,
      payload: observation.payload,
      rawRef: `${fixture.id}:${observation.source}:${observation.observedAtOffsetMs}`,
      missingFields: observation.missingFields ?? [],
      notes: observation.notes ?? [],
    })
  );
  const evidence = buildDiscoveryEvidence({
    token: fixture.token,
    chain: DEFAULT_CHAIN,
    observations: sourceObservations,
    collectedAtMs:
      fixture.baseTimestampMs +
      Math.max(0, ...fixture.observations.map((observation) => observation.observedAtOffsetMs)),
    knownRequiredFields: fixture.knownRequiredFields,
    sourceFieldPresence: fixture.sourceFieldPresence,
    sourceDisagreements: fixture.sourceDisagreements ?? {},
    notes: [`fixture:${fixture.id}`],
  });
  const candidate = createCandidateToken(evidence, { symbol: fixture.symbol });
  const universe = buildUniverseResult({
    token: fixture.token,
    chain: DEFAULT_CHAIN,
    observationsBySource: fixture.universeCoverage,
    normalizedFeatures: fixture.universeFeatures,
  });
  const quality = buildDataQualityV1({
    evidence,
    candidates: [candidate],
    universe,
    traceId: `dq:${fixture.id}`,
    timestamp: timestampIso,
  });

  return {
    timestampIso,
    fixedNowMs: fixture.baseTimestampMs,
    sourceObservations,
    evidence,
    candidate,
    universe,
    quality,
  };
}

function buildLegacyDataQuality(shared: SharedFixtureArtifacts): TestSignalPack["dataQuality"] {
  const completeness = clamp01(shared.evidence.completeness);
  const freshness = shared.sourceObservations.length === 0
    ? 0
    : clamp01(
      Math.min(
        ...shared.sourceObservations.map((observation) =>
          clamp01(1 - observation.freshnessMs / FRESHNESS_SOFT_LIMIT_MS)
        )
      )
    );
  const sourceReliability = clamp01(
    1 - shared.evidence.disagreedFields.length * 0.1 - shared.evidence.missingFields.length * 0.1
  );
  const crossSourceConfidence = clamp01(
    (completeness + freshness + sourceReliability) / 3
  );

  return {
    completeness,
    freshness,
    sourceReliability,
    crossSourceConfidence,
  };
}

function runLegacyLineage(
  fixture: MigrationParityFixture,
  shared: SharedFixtureArtifacts
): LegacyDeterministicArtifacts {
  const legacyMarketSource = marketSourceToLegacy(fixture.market.source);
  const legacyTokenSources = uniqueSorted([
    legacyMarketSource,
    ...fixture.observations.map((observation) =>
      observationSourceToLegacy(observation.source, fixture.market.source)
    ),
  ]).filter((source): source is "paprika" | "dexscreener" | "moralis" =>
    source === "paprika" || source === "dexscreener" || source === "moralis"
  );

  const tokenUniverse = buildTokenUniverse(
    [
      {
        token: {
          schema_version: "normalized_token.v1",
          canonical_id: `${DEFAULT_CHAIN}:${fixture.token.toLowerCase()}`,
          symbol: fixture.symbol,
          mint: fixture.token,
          chain: DEFAULT_CHAIN,
          sources: legacyTokenSources.length > 0 ? legacyTokenSources : [legacyMarketSource],
          confidence_score: clamp01(shared.evidence.completeness),
          mappings: {
            paprika: { tokenId: fixture.symbol, poolId: fixture.market.poolId },
          },
          metadata: {
            name: fixture.symbol,
            decimals: 9,
            tags: ["migration-fixture"],
          },
          discovered_at: shared.timestampIso,
          last_updated: shared.timestampIso,
        },
        volume24h: fixture.market.volume24h,
        liquidity: fixture.market.liquidity,
      },
    ],
    { mode: "reduced" },
    shared.timestampIso
  );

  const legacySignals: TestSignal[] = shared.sourceObservations.map((observation) => {
    const matchingFixtureObservation = fixture.observations.find(
      (candidate) =>
        candidate.source === observation.source &&
        fixture.baseTimestampMs + candidate.observedAtOffsetMs === observation.observedAtMs
    );

    return {
      source: observationSourceToLegacy(observation.source, fixture.market.source),
      timestamp: new Date(observation.observedAtMs).toISOString(),
      poolId: fixture.market.poolId,
      baseToken: fixture.token,
      quoteToken: "USD",
      priceUsd: matchingFixtureObservation?.payload.priceUsd ?? fixture.market.priceUsd,
      volume24h: matchingFixtureObservation?.payload.volume24h ?? fixture.market.volume24h,
      liquidity: matchingFixtureObservation?.payload.liquidityUsd ?? fixture.market.liquidity,
      rawPayloadHash: observation.payloadHash,
    };
  });

  const legacyDataQuality = buildLegacyDataQuality(shared);
  const signalPack: TestSignalPack = {
    traceId: `legacy-signal-pack:${fixture.id}`,
    timestamp: shared.timestampIso,
    signals: legacySignals,
    dataQuality: legacyDataQuality,
    sources: uniqueSorted(legacySignals.map((signal) => signal.source)),
  };

  const scoreCard = withFixedNow(shared.fixedNowMs, () =>
    runScoringEngine({
      signalPack,
      traceId: `legacy-score:${fixture.id}`,
      timestamp: shared.timestampIso,
    })
  );
  const patternResult: PatternResult = {
    traceId: `legacy-pattern:${fixture.id}`,
    timestamp: shared.timestampIso,
    patterns: [],
    flags: [],
    confidence: 1,
    evidence: [],
  };
  const marketSnapshot: MarketSnapshot = {
    schema_version: "market.v1",
    traceId: `legacy-market:${fixture.id}`,
    timestamp: shared.timestampIso,
    source: fixture.market.source,
    poolId: fixture.market.poolId,
    baseToken: fixture.token,
    quoteToken: fixture.market.quoteToken,
    priceUsd: fixture.market.priceUsd,
    volume24h: fixture.market.volume24h,
    liquidity: fixture.market.liquidity,
    freshnessMs: fixture.market.freshnessMs,
    status: fixture.market.freshnessMs > 0 ? "stale" : "ok",
  };
  const signalResult = runSignalEngine({
    market: marketSnapshot,
    scoreCard,
    patternResult,
    dataQuality: { completeness: legacyDataQuality.completeness },
    traceId: `legacy-signal:${fixture.id}`,
    timestamp: shared.timestampIso,
    dryRun: true,
    executionMode: "dry",
  });

  return {
    executed: true,
    universeTokenCount: tokenUniverse.tokens.length,
    signalBlocked: signalResult.blocked,
    signalReasonCodes: signalResult.blocked ? signalResult.reasonCodes : [],
    qualityStatus:
      legacyDataQuality.completeness < DATA_QUALITY_MIN_COMPLETENESS ? "fail" : "pass",
    qualityCrossSourceConfidence: legacyDataQuality.crossSourceConfidence ?? 0,
    scoreHybrid: scoreCard.hybrid,
    scoreConfidence: scoreCard.crossSourceConfidenceScore,
    riskFlagsCount: patternResult.flags.length,
  };
}

function runSurvivorLineage(
  fixture: MigrationParityFixture,
  shared: SharedFixtureArtifacts
): SurvivorDeterministicArtifacts {
  let cqdSnapshot: ReturnType<typeof buildCQDSnapshotV1> | null = null;
  let cqdStageError: string | null = null;

  try {
    cqdSnapshot = buildCQDSnapshotV1({
      evidence: shared.evidence,
      candidates: [shared.candidate],
      universe: shared.universe,
      quality: shared.quality,
    });
  } catch (error) {
    cqdStageError = error instanceof Error ? error.message : String(error);
  }

  let constructedSignalSet: ReturnType<typeof buildConstructedSignalSetV1> | null = null;
  let scoreCardV1: ReturnType<typeof buildScoreCardV1> | null = null;

  if (cqdSnapshot) {
    const signalPackV1 = buildSignalPackV1({
      token: fixture.token,
      chain: DEFAULT_CHAIN,
      traceId: `new-signal-pack:${fixture.id}`,
      timestamp: shared.timestampIso,
      dataQuality: shared.quality,
      cqdSnapshot,
      evidenceRefs: [shared.evidence.evidenceRef],
      notes: [`fixture:${fixture.id}`],
    });
    const trendObservation = fixture.includeTrendObservation
      ? buildTrendReversalObservationV1(
        buildTrendReversalMonitorInputV1({
          token: fixture.token,
          chain: DEFAULT_CHAIN,
          traceId: `new-trend-input:${fixture.id}`,
          timestamp: shared.timestampIso,
          dataQuality: shared.quality,
          cqdSnapshot,
          signalPack: signalPackV1,
          contextAvailability: {
            supplementalHintsAvailable: true,
            missingSupplementalHints: [],
          },
          evidenceRefs: [shared.evidence.evidenceRef],
          notes: [`fixture:${fixture.id}`],
        })
      )
      : null;

    constructedSignalSet = buildConstructedSignalSetV1({
      token: fixture.token,
      chain: DEFAULT_CHAIN,
      traceId: `new-constructed-signals:${fixture.id}`,
      timestamp: shared.timestampIso,
      dataQuality: shared.quality,
      cqdSnapshot,
      signalPack: signalPackV1,
      trendReversalObservation: trendObservation,
      contextAvailability: fixture.includeTrendObservation
        ? {
          supplementalHintsAvailable: true,
          missingSupplementalHints: [],
        }
        : {
          supplementalHintsAvailable: false,
          missingSupplementalHints: ["supplementalHints"],
        },
      evidenceRefs: [shared.evidence.evidenceRef],
      notes: [`fixture:${fixture.id}`],
    });

    scoreCardV1 = buildScoreCardV1({
      constructedSignalSet,
    });
  }

  const derivedBlocked =
    shared.quality.status === "fail" ||
    !cqdSnapshot ||
    constructedSignalSet?.buildStatus === "invalidated" ||
    scoreCardV1?.buildStatus === "invalidated";

  return {
    executed: true,
    sourceObservationCount: shared.sourceObservations.length,
    evidenceStatus: shared.evidence.status,
    candidatePriority: shared.candidate.priority,
    universeIncluded: shared.universe.included,
    qualityStatus: shared.quality.status,
    qualityCrossSourceConfidence: shared.quality.crossSourceConfidence,
    cqdPresent: cqdSnapshot !== null,
    cqdStageError,
    cqdAnomalyFlagsCount: cqdSnapshot?.anomaly_flags.length ?? 0,
    scorePresent: scoreCardV1 !== null,
    scoreComposite: scoreCardV1?.aggregateScores.composite ?? null,
    scoreConfidence: scoreCardV1?.confidence ?? null,
    constructedBuildStatus: constructedSignalSet?.buildStatus ?? null,
    scoreBuildStatus: scoreCardV1?.buildStatus ?? null,
    derivedBlocked,
  };
}

function deriveShadowClassification(
  oldLineage: LegacyDeterministicArtifacts,
  newLineage: SurvivorDeterministicArtifacts
): "blocked" | "candidate" | "insufficient-evidence" {
  if (oldLineage.signalBlocked || newLineage.derivedBlocked) {
    return "blocked";
  }

  if (newLineage.scorePresent) {
    return "candidate";
  }

  return "insufficient-evidence";
}

function buildComparison(
  fixture: MigrationParityFixture,
  oldLineage: LegacyDeterministicArtifacts,
  newLineage: SurvivorDeterministicArtifacts
): MigrationParityComparison {
  const shadowClassification = deriveShadowClassification(oldLineage, newLineage);
  const stableProjection: Record<string, unknown> = {
    token: fixture.token,
    chain: DEFAULT_CHAIN,
    "new.universe.included": newLineage.universeIncluded,
    "shadow.classification": shadowClassification,
    "new.quality.status": newLineage.qualityStatus,
    "new.cqd.present": newLineage.cqdPresent,
    "new.cqd.present=false": newLineage.cqdPresent === false,
    "new.score.present": newLineage.scorePresent,
  };
  const stableFields = Object.fromEntries(
    fixture.comparisonScope.stableFields.map((field) => [
      field,
      field in stableProjection ? stableProjection[field] : null,
    ])
  );

  const deltaFields: MigrationParityDeltaField[] = [
    {
      field: "score.composite",
      oldValue: oldLineage.scoreHybrid,
      newValue: newLineage.scoreComposite,
      changed: !valuesEqual(oldLineage.scoreHybrid, newLineage.scoreComposite),
    },
    {
      field: "score.confidence",
      oldValue: oldLineage.scoreConfidence,
      newValue: newLineage.scoreConfidence,
      changed: !valuesEqual(oldLineage.scoreConfidence, newLineage.scoreConfidence),
    },
    {
      field: "signal.blocked",
      oldValue: oldLineage.signalBlocked,
      newValue: newLineage.derivedBlocked,
      changed: !valuesEqual(oldLineage.signalBlocked, newLineage.derivedBlocked),
    },
    {
      field: "quality.status",
      oldValue: oldLineage.qualityStatus,
      newValue: newLineage.qualityStatus,
      changed: !valuesEqual(oldLineage.qualityStatus, newLineage.qualityStatus),
    },
    {
      field: "quality.crossSourceConfidence",
      oldValue: oldLineage.qualityCrossSourceConfidence,
      newValue: newLineage.qualityCrossSourceConfidence,
      changed: !valuesEqual(
        oldLineage.qualityCrossSourceConfidence,
        newLineage.qualityCrossSourceConfidence
      ),
    },
    {
      field: "cqd.stageError",
      oldValue: null,
      newValue: newLineage.cqdStageError,
      changed: !valuesEqual(null, newLineage.cqdStageError),
    },
    {
      field: "riskFlags.count",
      oldValue: oldLineage.riskFlagsCount,
      newValue: newLineage.cqdAnomalyFlagsCount,
      changed: !valuesEqual(oldLineage.riskFlagsCount, newLineage.cqdAnomalyFlagsCount),
    },
  ].sort((left, right) => left.field.localeCompare(right.field));

  const changedFieldSet = new Set(
    deltaFields.filter((field) => field.changed).map((field) => field.field)
  );
  const expectedDeltaFields = uniqueSorted(fixture.comparisonScope.expectedDeltaFields);
  const expectedDeltaSet = new Set(expectedDeltaFields);
  const unexpectedDeltaFields = [...changedFieldSet]
    .filter((field) => !expectedDeltaSet.has(field))
    .sort((left, right) => left.localeCompare(right));
  const missingExpectedDeltaFields = expectedDeltaFields
    .filter((field) => !changedFieldSet.has(field))
    .sort((left, right) => left.localeCompare(right));

  return {
    stableFields,
    deltaFields,
    expectedDeltaFields,
    unexpectedDeltaFields,
    missingExpectedDeltaFields,
    notes: [...fixture.comparisonScope.notes],
  };
}

export function runMigrationParityHarnessFixture(
  fixture: MigrationParityFixture
): MigrationParityHarnessResult {
  const shared = buildSharedArtifacts(fixture);
  const oldLineage = runLegacyLineage(fixture, shared);
  const newLineage = runSurvivorLineage(fixture, shared);
  const comparison = buildComparison(fixture, oldLineage, newLineage);

  return {
    fixtureId: fixture.id,
    scenario: fixture.scenario,
    survivorNamingLine: MIGRATION_PARITY_SURVIVOR_NAMING_LINE,
    shadowGuard: {
      harnessMode: "shadow",
      derivedOnly: true,
      nonAuthoritative: true,
      canonicalDecisionHistory: false,
      authorityInfluence: false,
    },
    oldLineage,
    newLineage,
    comparison,
  };
}

export function runMigrationParityHarness(
  fixtures: readonly MigrationParityFixture[]
): MigrationParityHarnessResult[] {
  return [...fixtures]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((fixture) => runMigrationParityHarnessFixture(fixture));
}
