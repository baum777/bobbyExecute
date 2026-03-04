import { randomUUID } from "node:crypto";
import type {
  ReducedModeRunV1,
  TokenAnalysisV1,
  RunMode,
} from "@bobby/contracts";
import { ReducedModeRunV1Schema } from "@bobby/contracts";
import type { DexScreenerAdapter, DexPaprikaAdapter } from "@bobby/adapters";
import { type ReducedModeConfig, DEFAULT_REDUCEDMODE_CONFIG } from "./config.js";
import { UniverseBuilder, InsufficientUniverseError } from "./universe/universe.builder.js";
import { normalizeToken } from "./normalize/normalizer.js";
import { computeStructuralMetrics } from "./structural/structural.metrics.js";
import { collectSocialData } from "./social/social.collector.js";
import { scoreSocial } from "./social/social.scorer.js";
import { computeRisk } from "./risk/risk.model.js";
import { detectDivergences } from "./divergence/divergence.detect.js";
import { classifyEcosystem } from "./classify/ecosystem.classifier.js";
import { buildTokenAnalysis } from "./output/report.builder.js";
import { buildRankings, buildTransparency } from "./output/tables.builder.js";
import type { MetricsCollector } from "./observability/metrics.js";
import { NoOpMetrics } from "./observability/metrics.js";
import { createLogger } from "./observability/logger.js";

export { DEFAULT_REDUCEDMODE_CONFIG, type ReducedModeConfig } from "./config.js";
export { InMemoryRunStore, type RunStore } from "./storage/run.store.js";
export { InsufficientUniverseError } from "./universe/universe.builder.js";
export { NoOpMetrics, InMemoryMetrics, type MetricsCollector } from "./observability/metrics.js";
export { normalizeToken } from "./normalize/normalizer.js";
export { computeRelativeDelta, computeDataQuality } from "./normalize/crosssource.confidence.js";
export { computeStructuralMetrics } from "./structural/structural.metrics.js";
export { inferLiquidityRegime, inferVolatilityRegime } from "./structural/regime.infer.js";
export { computeRisk } from "./risk/risk.model.js";
export { selectWeightProfile } from "./risk/risk.weights.js";
export { computeRiskFlags } from "./risk/flags.js";
export { detectDivergences } from "./divergence/divergence.detect.js";
export { classifyEcosystem } from "./classify/ecosystem.classifier.js";
export { buildTokenAnalysis } from "./output/report.builder.js";
export { buildRankings, buildTransparency } from "./output/tables.builder.js";
export { dedupeByContractAddress, enforceRatioBalance } from "./universe/dedupe.balance.js";
export { resolveContractAddress } from "./universe/contract.resolver.js";

export interface ReducedModeEngineOptions {
  config?: Partial<ReducedModeConfig>;
  mode?: RunMode;
  maxTokens?: number;
  metrics?: MetricsCollector;
}

const log = createLogger("reducedmode-engine");

export async function executeReducedModeRun(
  dexScreener: DexScreenerAdapter,
  dexPaprika: DexPaprikaAdapter,
  options: ReducedModeEngineOptions = {},
): Promise<ReducedModeRunV1> {
  const config: ReducedModeConfig = {
    ...DEFAULT_REDUCEDMODE_CONFIG,
    ...options.config,
  };
  if (options.maxTokens !== undefined) {
    config.MAX_UNIQUE_TOKENS = options.maxTokens;
  }
  const mode: RunMode = options.mode ?? "dry";
  const metrics = options.metrics ?? new NoOpMetrics();
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  log.info({ run_id: runId, phase: "start", mode }, "ReducedMode run started");
  metrics.counter("reducedmode.runs.started");

  const builder = new UniverseBuilder(dexScreener, dexPaprika, config);
  let universeResult;
  try {
    universeResult = await builder.build();
  } catch (err) {
    if (err instanceof InsufficientUniverseError) {
      log.error({ run_id: runId, phase: "universe", error: err.message }, "Fail-closed: insufficient universe");
      metrics.counter("reducedmode.runs.fail_closed");
      throw err;
    }
    throw err;
  }

  log.info({
    run_id: runId,
    phase: "universe",
    pre_dedupe: universeResult.preDedupe,
    post_dedupe: universeResult.postDedupe,
    excluded: universeResult.excludedNoContract,
  }, "Universe built");

  metrics.gauge("reducedmode.universe.size", universeResult.postDedupe);

  const tokens: TokenAnalysisV1[] = [];

  for (const [ca, snapshots] of universeResult.snapshots) {
    const normalized = normalizeToken(ca, snapshots, config.DISCREPANCY_THRESHOLD);
    const structural = computeStructuralMetrics(normalized);
    const socialRaw = await collectSocialData(ca, config.enableSocial);
    const social = scoreSocial(ca, socialRaw, config.enableSocial);
    const divergence = detectDivergences(ca, snapshots, config.DISCREPANCY_THRESHOLD);
    const risk = computeRisk(normalized, structural, social, divergence);
    const analysis = buildTokenAnalysis(normalized, structural, social, risk, divergence);
    tokens.push(analysis);
  }

  log.info({ run_id: runId, phase: "analysis", token_count: tokens.length }, "Token analysis complete");

  const allStructural = tokens.map((t) => t.structural);
  const allSocial = tokens.map((t) => t.social);
  const allDivergences = tokens.map((t) => t.divergence);

  const ecosystem = classifyEcosystem(allStructural, allSocial, allDivergences);
  const rankings = buildRankings(tokens);
  const transparency = buildTransparency(tokens, config.MIN_DATA_COMPLETENESS);

  const lowConfidence = transparency.avg_completeness < config.MIN_DATA_COMPLETENESS;
  const notes: string[] = [];
  if (lowConfidence) {
    notes.push(
      `Average data completeness (${transparency.avg_completeness}%) is below minimum threshold (${config.MIN_DATA_COMPLETENESS}%). Results are low-confidence.`,
    );
  }

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  const run: ReducedModeRunV1 = {
    run_id: runId,
    mode,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    config: {
      max_unique_tokens: config.MAX_UNIQUE_TOKENS,
      min_unique_tokens: config.MIN_UNIQUE_TOKENS,
      trending_ratio_target: config.TRENDING_RATIO_TARGET,
      volume_ratio_target: config.VOLUME_RATIO_TARGET,
      discrepancy_threshold: config.DISCREPANCY_THRESHOLD,
      min_data_completeness: config.MIN_DATA_COMPLETENESS,
    },
    universe: {
      pre_dedupe_count: universeResult.preDedupe,
      post_dedupe_count: universeResult.postDedupe,
      excluded_no_contract: universeResult.excludedNoContract,
      sources_queried: universeResult.sourcesQueried,
      final_trending_count: universeResult.trendingCount,
      final_volume_count: universeResult.volumeCount,
    },
    tokens,
    ecosystem,
    transparency,
    rankings,
    low_confidence: lowConfidence,
    notes,
  };

  const validated = ReducedModeRunV1Schema.parse(run);

  metrics.counter("reducedmode.runs.completed");
  metrics.histogram("reducedmode.runs.duration_ms", durationMs);
  metrics.gauge("reducedmode.transparency.avg_completeness", transparency.avg_completeness);
  metrics.gauge("reducedmode.transparency.avg_confidence", transparency.avg_cross_source_confidence);

  log.info({ run_id: runId, phase: "complete", duration_ms: durationMs, low_confidence: lowConfidence }, "ReducedMode run complete");

  return validated;
}
