import { randomUUID } from "node:crypto";
import type { ReducedModeRunV1, TokenAnalysisV1, RunMode, Source } from "@bobby/contracts";
import { ReducedModeRunV1Schema } from "@bobby/contracts";
import type { DexScreenerAdapter, DexPaprikaAdapter } from "@bobby/adapters";
import type { ReducedModeConfig } from "./config/defaults.js";
import { resolveConfig } from "./config/resolveConfig.js";
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
import { NoOpMetrics, emitRunMetrics } from "./observability/metrics.js";
import { createLogger } from "./observability/logger.js";

export interface ReducedModeEngineOptions {
  config?: Partial<ReducedModeConfig>;
  mode?: RunMode;
  maxTokens?: number;
  metrics?: MetricsCollector;
}

export interface EngineError {
  code: "ENGINE_FAIL_CLOSED" | "SOURCE_DEGRADED" | "INSUFFICIENT_DATA";
  run_id: string;
  phase: string;
  reason: string;
  recovery_attempts: number;
  suggested_action: string;
}

const log = createLogger("reducedmode-engine");

export async function executeReducedModeRun(
  dexScreener: DexScreenerAdapter,
  dexPaprika: DexPaprikaAdapter,
  options: ReducedModeEngineOptions = {},
): Promise<ReducedModeRunV1> {
  const config = resolveConfig(options.config);
  if (options.maxTokens !== undefined) config.MAX_UNIQUE_TOKENS = options.maxTokens;
  const mode: RunMode = options.mode ?? "dry";
  const metrics = options.metrics ?? new NoOpMetrics();
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  log.info({ run_id: runId, phase: "start", mode }, "ReducedMode run started");

  const builder = new UniverseBuilder(dexScreener, dexPaprika, config);
  let universeResult;
  try {
    universeResult = await builder.build();
  } catch (err) {
    if (err instanceof InsufficientUniverseError) {
      log.error({ run_id: runId, phase: "universe", error: err.message }, "Fail-closed: insufficient universe");
      metrics.counter("reducedmode_runs_total", 1, { status: "fail_closed" });
      throw err;
    }
    throw err;
  }

  log.info({ run_id: runId, phase: "universe", pre_dedupe: universeResult.preDedupe, post_dedupe: universeResult.postDedupe }, "Universe built");

  const tokens: TokenAnalysisV1[] = [];
  const sourcesQueried: Source[] = universeResult.sourcesQueried;

  const allStructural = [];
  const allSocial = [];
  const allDivergences = [];
  const divergenceCounts: number[] = [];

  for (const [ca, snapshots] of universeResult.snapshots) {
    const normalized = normalizeToken(ca, snapshots, config.DISCREPANCY_THRESHOLD);
    const structural = computeStructuralMetrics(normalized);
    const socialRaw = await collectSocialData(ca, config.enableSocial);
    const social = scoreSocial(ca, socialRaw, config.enableSocial);
    const divergence = detectDivergences(ca, snapshots, config.DISCREPANCY_THRESHOLD, normalized, structural);
    const risk = computeRisk(normalized, structural, social, divergence);

    allStructural.push(structural);
    allSocial.push(social);
    allDivergences.push(divergence);
    divergenceCounts.push(divergence.divergence_count);

    tokens.push(buildTokenAnalysis(normalized, structural, social, risk, divergence, null));
  }

  const ecosystem = classifyEcosystem(allStructural, allSocial, allDivergences);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const updated = buildTokenAnalysis(t.normalized, t.structural, t.social, t.risk, t.divergence, ecosystem);
    tokens[i] = updated;
  }

  const rankings = buildRankings(tokens);
  const transparency = buildTransparency(tokens, config.MIN_DATA_COMPLETENESS);
  const lowConfidence = transparency.avg_completeness < config.MIN_DATA_COMPLETENESS;
  const notes: string[] = [];
  if (lowConfidence) {
    notes.push(`Average data completeness (${transparency.avg_completeness}%) below threshold (${config.MIN_DATA_COMPLETENESS}%). Low-confidence analysis.`);
  }

  const durationMs = Date.now() - startMs;
  const completedAt = new Date().toISOString();
  const dominantProfile = tokens.length > 0 ? tokens[0].risk.weight_profile.profile : "balanced";

  emitRunMetrics(metrics, lowConfidence ? "low_confidence" : "ok", universeResult.postDedupe,
    transparency.avg_completeness, transparency.avg_cross_source_confidence,
    transparency.avg_discrepancy_rate, divergenceCounts, dominantProfile, durationMs);

  const run: ReducedModeRunV1 = {
    run_id: runId, mode, started_at: startedAt, completed_at: completedAt, duration_ms: durationMs,
    config: {
      max_unique_tokens: config.MAX_UNIQUE_TOKENS, min_unique_tokens: config.MIN_UNIQUE_TOKENS,
      trending_ratio_target: config.TRENDING_RATIO_TARGET, volume_ratio_target: config.VOLUME_RATIO_TARGET,
      discrepancy_threshold: config.DISCREPANCY_THRESHOLD, min_data_completeness: config.MIN_DATA_COMPLETENESS,
    },
    universe: {
      pre_dedupe_count: universeResult.preDedupe, post_dedupe_count: universeResult.postDedupe,
      excluded_no_contract: universeResult.excludedNoContract, sources_queried: sourcesQueried,
      final_trending_count: universeResult.trendingCount, final_volume_count: universeResult.volumeCount,
    },
    tokens, ecosystem, transparency, rankings, low_confidence: lowConfidence, notes,
  };

  const validated = ReducedModeRunV1Schema.parse(run);
  log.info({ run_id: runId, phase: "complete", duration_ms: durationMs, low_confidence: lowConfidence, token_count: tokens.length }, "ReducedMode run complete");
  return validated;
}
