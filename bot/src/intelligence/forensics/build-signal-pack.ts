/**
 * Deterministic forensics foundation builders.
 * These are pre-authority helpers only and do not perform scoring or decisions.
 */
import { hashPayload, integerOrNull, numberOrNull, sortRecord, uniqueSorted } from "./deterministic.js";
import { booleanOrNull } from "./deterministic.js";
import type { DataQualityV1 } from "../quality/contracts/data-quality.v1.js";
import type { CQDSnapshotV1 } from "../cqd/contracts/cqd.snapshot.v1.js";
import {
  SignalPackMarketStructureSchema,
  SignalPackHolderFlowSchema,
  SignalPackLiquiditySchema,
  SignalPackManipulationFlagsSchema,
  SignalPackSourceCoverageEntrySchema,
  SignalPackV1Schema,
  SignalPackVolatilitySchema,
  SignalPackVolumeSchema,
  TrendReversalMonitorInputAvailabilitySchema,
  TrendReversalMonitorInputV1Schema,
  type SignalPackMarketStructure,
  type SignalPackHolderFlow,
  type SignalPackLiquidity,
  type SignalPackManipulationFlags,
  type SignalPackSourceCoverageEntry,
  type SignalPackV1,
  type SignalPackVolatility,
  type SignalPackVolume,
  type TrendReversalMonitorInputAvailability,
  type TrendReversalMonitorInputV1,
} from "./contracts/index.js";

export interface MarketStructureHints {
  observedHigh?: number | null;
  observedLow?: number | null;
  lastPrice?: number | null;
  priceReturnPct?: number | null;
  drawdownPct?: number | null;
  rangePct?: number | null;
  reclaimGapPct?: number | null;
  lowerHighPct?: number | null;
  higherHighPct?: number | null;
  lowerLowPct?: number | null;
  higherLowPct?: number | null;
  pivotCount?: number | null;
  notes?: readonly string[];
}

export interface HolderFlowHints {
  holderCount?: number | null;
  holderConcentrationPct?: number | null;
  holderTurnoverPct?: number | null;
  netFlowUsd?: number | null;
  netFlowDirection?: "inflow" | "outflow" | "flat" | null;
  participationPct?: number | null;
  notes?: readonly string[];
}

export interface ManipulationFlagsHints {
  washTradingSuspected?: boolean | null;
  spoofingSuspected?: boolean | null;
  concentrationFragility?: boolean | null;
  staleSourceRisk?: boolean | null;
  crossSourceDivergence?: boolean | null;
  anomalyFlags?: readonly string[];
  notes?: readonly string[];
}

export interface SourceCoverageHint {
  status?: SignalPackSourceCoverageEntry["status"];
  completeness?: number | null;
  freshness?: number | null;
  freshnessMs?: number | null;
  evidenceRefs?: readonly string[];
  notes?: readonly string[];
}

export interface BuildSignalPackV1Input {
  token: string;
  chain?: "solana";
  traceId: string;
  timestamp?: string;
  dataQuality: DataQualityV1;
  cqdSnapshot: CQDSnapshotV1;
  evidenceRefs?: readonly string[];
  marketStructureHints?: MarketStructureHints;
  holderFlowHints?: HolderFlowHints;
  manipulationFlagsHints?: ManipulationFlagsHints;
  sourceCoverageHints?: Readonly<Record<string, SourceCoverageHint>>;
  notes?: readonly string[];
}

export interface BuildTrendReversalMonitorInputV1Input {
  token: string;
  chain?: "solana";
  traceId: string;
  timestamp?: string;
  dataQuality: DataQualityV1;
  cqdSnapshot: CQDSnapshotV1;
  signalPack: SignalPackV1;
  contextAvailability?: Partial<TrendReversalMonitorInputAvailability>;
  evidenceRefs?: readonly string[];
  notes?: readonly string[];
}

function featureNumber(
  features: Record<string, number | undefined>,
  keys: readonly string[]
): number | null {
  for (const key of keys) {
    const value = features[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function featureInteger(
  features: Record<string, number | undefined>,
  keys: readonly string[]
): number | null {
  for (const key of keys) {
    const value = features[key];
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }
  }
  return null;
}

function anyStaleSource(dataQuality: DataQualityV1, source: string): boolean {
  return dataQuality.staleSources.includes(source);
}

function buildSectionNotes(notes: readonly string[] | undefined): string[] {
  return uniqueSorted(notes ?? []);
}

function buildMarketStructure(input: BuildSignalPackV1Input): SignalPackMarketStructure {
  const features = input.cqdSnapshot.features;
  const hints = input.marketStructureHints;

  return SignalPackMarketStructureSchema.parse({
    observedHigh: numberOrNull(hints?.observedHigh) ?? featureNumber(features, ["observed_high", "high_since_launch", "session_high", "high"]),
    observedLow: numberOrNull(hints?.observedLow) ?? featureNumber(features, ["observed_low", "low_since_launch", "session_low", "low"]),
    lastPrice: numberOrNull(hints?.lastPrice) ?? featureNumber(features, ["last_price", "price", "price_usd", "close_price"]),
    priceReturnPct: numberOrNull(hints?.priceReturnPct) ?? featureNumber(features, ["price_return_pct", "price_return_1m", "price_return_5m"]),
    drawdownPct: numberOrNull(hints?.drawdownPct) ?? featureNumber(features, ["drawdown_pct", "drawdown_1m_pct", "drawdown_5m_pct"]),
    rangePct: numberOrNull(hints?.rangePct) ?? featureNumber(features, ["range_pct", "price_range_pct"]),
    reclaimGapPct: numberOrNull(hints?.reclaimGapPct) ?? featureNumber(features, ["reclaim_gap_pct", "reclaim_gap_1m_pct"]),
    lowerHighPct: numberOrNull(hints?.lowerHighPct) ?? featureNumber(features, ["lower_high_pct", "lower_high_1m_pct"]),
    higherHighPct: numberOrNull(hints?.higherHighPct) ?? featureNumber(features, ["higher_high_pct", "higher_high_1m_pct"]),
    lowerLowPct: numberOrNull(hints?.lowerLowPct) ?? featureNumber(features, ["lower_low_pct", "lower_low_1m_pct"]),
    higherLowPct: numberOrNull(hints?.higherLowPct) ?? featureNumber(features, ["higher_low_pct", "higher_low_1m_pct"]),
    pivotCount: integerOrNull(hints?.pivotCount) ?? featureInteger(features, ["pivot_count", "swing_count"]),
    notes: buildSectionNotes(hints?.notes),
  });
}

function buildVolatility(input: BuildSignalPackV1Input): SignalPackVolatility {
  const features = input.cqdSnapshot.features;
  return SignalPackVolatilitySchema.parse({
    realizedVolatilityPct: featureNumber(features, ["realized_volatility_pct", "volatility_pct", "volatility_1m_pct"]),
    atrPct: featureNumber(features, ["atr_pct", "atr_1m_pct"]),
    rangePct: featureNumber(features, ["range_pct", "price_range_pct"]),
    maxStalenessMs: input.cqdSnapshot.sources.max_staleness_ms ?? null,
    notes: [],
  });
}

function buildLiquidity(input: BuildSignalPackV1Input): SignalPackLiquidity {
  const features = input.cqdSnapshot.features;
  return SignalPackLiquiditySchema.parse({
    liquidityUsd: featureNumber(features, ["liquidity_usd", "liquidityUsd", "liquidity"]),
    liquidityScore: featureNumber(features, ["liquidity_score", "liquidityScore"]),
    spreadPct: featureNumber(features, ["spread_pct", "spreadPct"]),
    depthUsd: featureNumber(features, ["depth_usd", "depthUsd"]),
    slippagePct: featureNumber(features, ["slippage_pct", "slippagePct"]),
    notes: [],
  });
}

function buildVolume(input: BuildSignalPackV1Input): SignalPackVolume {
  const features = input.cqdSnapshot.features;
  return SignalPackVolumeSchema.parse({
    volume24hUsd: featureNumber(features, ["volume_24h_usd", "volume24hUsd", "volume_24h", "volume24h"]),
    relativeVolumePct: featureNumber(features, ["relative_volume_pct", "relativeVolumePct"]),
    volumeMomentumPct: featureNumber(features, ["volume_momentum_pct", "volumeMomentumPct"]),
    transferCount: featureInteger(features, ["transfer_count", "transferCount"]),
    notes: [],
  });
}

function buildHolderFlow(input: BuildSignalPackV1Input): SignalPackHolderFlow {
  const features = input.cqdSnapshot.features;
  const hints = input.holderFlowHints;
  const netFlowUsd =
    numberOrNull(hints?.netFlowUsd) ??
    featureNumber(features, ["net_flow_usd", "netFlowUsd", "flow_usd"]);

  return SignalPackHolderFlowSchema.parse({
    holderCount: integerOrNull(hints?.holderCount) ?? featureInteger(features, ["holder_count", "holderCount"]),
    holderConcentrationPct:
      numberOrNull(hints?.holderConcentrationPct) ??
      featureNumber(features, ["holder_concentration_pct", "holderConcentrationPct"]),
    holderTurnoverPct:
      numberOrNull(hints?.holderTurnoverPct) ??
      featureNumber(features, ["holder_turnover_pct", "holderTurnoverPct"]),
    netFlowUsd,
    netFlowDirection:
      hints?.netFlowDirection ??
      (typeof netFlowUsd === "number"
        ? netFlowUsd > 0
          ? "inflow"
          : netFlowUsd < 0
            ? "outflow"
            : "flat"
        : null),
    participationPct:
      numberOrNull(hints?.participationPct) ??
      featureNumber(features, ["participation_pct", "participationPct"]),
    notes: buildSectionNotes(hints?.notes),
  });
}

function buildManipulationFlags(input: BuildSignalPackV1Input): SignalPackManipulationFlags {
  const hints = input.manipulationFlagsHints;
  const dataQuality = input.dataQuality;
  const cqdSnapshot = input.cqdSnapshot;
  const hasExplicitDivergence =
    dataQuality.discrepancy > 0 ||
    Object.keys(dataQuality.disagreedSources).length > 0 ||
    cqdSnapshot.anomaly_flags.some((flag) => flag.toLowerCase().includes("diverg"));
  const hasExplicitStaleCoverage =
    dataQuality.staleSources.length > 0 ||
    (cqdSnapshot.source_summaries ?? []).some((summary) => summary.status === "STALE") ||
    Object.values(input.sourceCoverageHints ?? {}).some((hint) => hint.status === "STALE");

  return SignalPackManipulationFlagsSchema.parse({
    washTradingSuspected: booleanOrNull(hints?.washTradingSuspected),
    spoofingSuspected: booleanOrNull(hints?.spoofingSuspected),
    concentrationFragility: booleanOrNull(hints?.concentrationFragility),
    staleSourceRisk: hasExplicitStaleCoverage ? true : booleanOrNull(hints?.staleSourceRisk),
    crossSourceDivergence: hasExplicitDivergence ? true : booleanOrNull(hints?.crossSourceDivergence),
    anomalyFlags: uniqueSorted([
      ...dataQuality.discrepancy_flags,
      ...cqdSnapshot.anomaly_flags,
      ...(hints?.anomalyFlags ?? []),
    ]),
    notes: buildSectionNotes(hints?.notes),
  });
}

function mapCoverageStatus(
  source: string,
  input: BuildSignalPackV1Input
): SignalPackSourceCoverageEntry {
  const hint = input.sourceCoverageHints?.[source];
  const sourceBreakdown = input.dataQuality.source_breakdown[source];
  const sourceSummaries = input.cqdSnapshot.source_summaries ?? [];
  const cqdSummary = sourceSummaries.find((summary) => summary.source === source);

  const status =
    hint?.status ??
    (anyStaleSource(input.dataQuality, source)
      ? "STALE"
      : cqdSummary?.status ?? (
          sourceBreakdown
            ? sourceBreakdown.completeness === 1 && sourceBreakdown.freshness === 1
              ? "OK"
              : sourceBreakdown.completeness > 0 || sourceBreakdown.freshness > 0
                ? "PARTIAL"
                : "MISSING"
            : "MISSING"
        ));

  const completeness = hint?.completeness ?? sourceBreakdown?.completeness ?? null;
  const freshness = hint?.freshness ?? sourceBreakdown?.freshness ?? null;
  const freshnessMs = hint?.freshnessMs ?? cqdSummary?.freshness_ms ?? sourceBreakdown?.latency_ms ?? null;

  return SignalPackSourceCoverageEntrySchema.parse({
    status,
    completeness: numberOrNull(completeness),
    freshness: numberOrNull(freshness),
    freshnessMs: numberOrNull(freshnessMs),
    evidenceRefs: uniqueSorted(hint?.evidenceRefs ?? []),
    notes: buildSectionNotes(hint?.notes),
  });
}

function buildSourceCoverage(input: BuildSignalPackV1Input): Record<string, SignalPackSourceCoverageEntry> {
  const sourceSummaries = input.cqdSnapshot.source_summaries ?? [];
  const sources = uniqueSorted([
    ...Object.keys(input.dataQuality.source_breakdown),
    ...sourceSummaries.map((summary) => summary.source),
    ...Object.keys(input.sourceCoverageHints ?? {}),
  ]);

  return sortRecord(
    Object.fromEntries(sources.map((source) => [source, mapCoverageStatus(source, input)]))
  );
}

function collectMissingSectionFields(signalPack: {
  marketStructure: SignalPackMarketStructure;
  volatility: SignalPackVolatility;
  liquidity: SignalPackLiquidity;
  volume: SignalPackVolume;
  holderFlow: SignalPackHolderFlow;
  manipulationFlags: SignalPackManipulationFlags;
}): string[] {
  const missing: string[] = [];

  const sections: Array<[string, Record<string, unknown>]> = [
    ["marketStructure", signalPack.marketStructure],
    ["volatility", signalPack.volatility],
    ["liquidity", signalPack.liquidity],
    ["volume", signalPack.volume],
    ["holderFlow", signalPack.holderFlow],
    ["manipulationFlags", signalPack.manipulationFlags],
  ];

  for (const [sectionName, section] of sections) {
    for (const [fieldName, value] of Object.entries(section)) {
      if (fieldName === "notes" || fieldName === "anomalyFlags") {
        continue;
      }
      if (value === null || value === undefined) {
        missing.push(`${sectionName}.${fieldName}`);
      }
    }
  }

  return uniqueSorted(missing);
}

export function buildMarketStructureV1(input: BuildSignalPackV1Input): SignalPackMarketStructure {
  return buildMarketStructure(input);
}

export function buildHolderFlowSnapshotV1(input: BuildSignalPackV1Input): SignalPackHolderFlow {
  return buildHolderFlow(input);
}

export function buildManipulationFlagsV1(input: BuildSignalPackV1Input): SignalPackManipulationFlags {
  return buildManipulationFlags(input);
}

export function buildSignalPackV1(input: BuildSignalPackV1Input): SignalPackV1 {
  const marketStructure = buildMarketStructure(input);
  const volatility = buildVolatility(input);
  const liquidity = buildLiquidity(input);
  const volume = buildVolume(input);
  const holderFlow = buildHolderFlow(input);
  const manipulationFlags = buildManipulationFlags(input);
  const sourceCoverage = buildSourceCoverage(input);
  const evidenceRefs = uniqueSorted([
    ...(input.evidenceRefs ?? []),
    ...input.cqdSnapshot.evidence_pack,
  ]);
  const notes = uniqueSorted([
    ...(input.notes ?? []),
    ...marketStructure.notes,
    ...holderFlow.notes,
    ...manipulationFlags.notes,
  ]);
  const missingFields = uniqueSorted([
    ...input.dataQuality.missingCriticalFields,
    ...collectMissingSectionFields({
      marketStructure,
      volatility,
      liquidity,
      volume,
      holderFlow,
      manipulationFlags,
    }),
    ...Object.entries(sourceCoverage)
      .filter(([, entry]) => entry.status === "MISSING")
      .map(([source]) => `sourceCoverage.${source}.status`),
  ]);

  const payload = {
    schema_version: "signal_pack.v1" as const,
    chain: input.chain ?? "solana",
    token: input.token,
    traceId: input.traceId,
    timestamp: input.timestamp ?? input.dataQuality.timestamp,
    dataQualityTraceId: input.dataQuality.traceId,
    cqdHash: input.cqdSnapshot.hash,
    marketStructure,
    volatility,
    liquidity,
    volume,
    holderFlow,
    manipulationFlags,
    evidenceRefs,
    missingFields,
    sourceCoverage,
    notes,
  };

  return SignalPackV1Schema.parse({
    ...payload,
    payloadHash: hashPayload(payload),
  });
}

export function buildTrendReversalMonitorInputV1(
  input: BuildTrendReversalMonitorInputV1Input
): TrendReversalMonitorInputV1 {
  const contextAvailability: TrendReversalMonitorInputAvailability = TrendReversalMonitorInputAvailabilitySchema.parse(
    input.contextAvailability ?? {
      supplementalHintsAvailable: false,
      missingSupplementalHints: [],
    }
  );
  const evidenceRefs = uniqueSorted([
    ...(input.evidenceRefs ?? []),
    ...input.signalPack.evidenceRefs,
    ...input.cqdSnapshot.evidence_pack,
  ]);
  const notes = uniqueSorted([
    ...(input.notes ?? []),
    ...input.signalPack.notes,
  ]);
  const missingFields = uniqueSorted([
    ...input.signalPack.missingFields,
    ...contextAvailability.missingSupplementalHints.map((hint) => `contextAvailability.${hint}`),
  ]);

  const payload = {
    schema_version: "trend_reversal_monitor_input.v1" as const,
    chain: input.chain ?? "solana",
    token: input.token,
    traceId: input.traceId,
    timestamp: input.timestamp ?? input.dataQuality.timestamp,
    dataQualityTraceId: input.dataQuality.traceId,
    cqdHash: input.cqdSnapshot.hash,
    signalPackHash: input.signalPack.payloadHash,
    dataQuality: input.dataQuality,
    cqdSnapshot: input.cqdSnapshot,
    signalPack: input.signalPack,
    evidenceRefs,
    missingFields,
    contextAvailability,
    notes,
  };

  return TrendReversalMonitorInputV1Schema.parse({
    ...payload,
    payloadHash: hashPayload(payload),
  });
}
