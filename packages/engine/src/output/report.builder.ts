import {
  ReducedModeRunV1Schema,
  type ReducedModeRunV1,
  type SourceV1,
  type TokenAnalysisV1,
} from "@reducedmode/contracts";
import type { ReducedModeConfig } from "../config.js";
import type { UniverseBuildResult } from "../universe/universe.builder.js";
import { buildRankedTables } from "./tables.builder.js";

export interface BuildReportInput {
  run_id: string;
  generated_at: string;
  mode: "live" | "dry";
  config: ReducedModeConfig;
  universe: UniverseBuildResult;
  tokens: TokenAnalysisV1[];
}

export function buildReducedModeReport(input: BuildReportInput): ReducedModeRunV1 {
  const orderedTokens = [...input.tokens].sort((a, b) =>
    a.token.contract_address.localeCompare(b.token.contract_address),
  );

  const tokenReports = orderedTokens.map((token) => ({
    ...token,
    reasoning_bullets: buildReasoningBullets(token),
  }));

  const avgCompleteness = average(tokenReports.map((x) => x.normalized.quality.data_completeness_score));
  const avgConfidence = average(tokenReports.map((x) => x.normalized.quality.cross_source_confidence_score));
  const avgDiscrepancyRate = average(tokenReports.map((x) => x.normalized.quality.discrepancy_rate));
  const avgStructural = average(tokenReports.map((x) => x.structural.structural_score));
  const avgRisk = average(tokenReports.map((x) => x.risk.overall_risk_score));
  const lowConfidence = avgCompleteness < input.config.MIN_DATA_COMPLETENESS;

  const tables = lowConfidence
    ? { top_structural: [], top_fragile: [] }
    : buildRankedTables(tokenReports, 10);

  const run = {
    version: "1.0.0",
    run_id: input.run_id,
    generated_at: input.generated_at,
    mode: input.mode,
    status: lowConfidence ? "low_confidence" : "ok",
    low_confidence_analysis: lowConfidence,
    config: {
      max_unique_tokens: input.config.MAX_UNIQUE_TOKENS,
      min_unique_tokens: input.config.MIN_UNIQUE_TOKENS,
      discrepancy_threshold: input.config.DISCREPANCY_THRESHOLD,
      min_data_completeness: input.config.MIN_DATA_COMPLETENESS,
      max_recovery_attempts: input.config.MAX_RECOVERY_ATTEMPTS,
      social_enabled: input.config.enableSocialLite,
      moralis_enabled: input.config.enableMoralis,
      rpc_verify_enabled: input.config.enableRpcVerify,
    },
    transparency: {
      universe_size_pre_dedupe: input.universe.preDedupePool.length,
      universe_size_post_dedupe: input.universe.selected.length,
      average_completeness_score: avgCompleteness,
      average_confidence_score: avgConfidence,
      discrepancy_rate_avg: avgDiscrepancyRate,
      divergence_histogram: divergenceHistogram(tokenReports),
    },
    sections: {
      A_universe: {
        candidates_total: input.universe.preDedupePool.length,
        unique_tokens: input.universe.selected.length,
        source_balance: sourceBalance(input.universe.selected.map((c) => c.source)),
        notes: input.universe.notes,
      },
      B_quality: {
        average_data_completeness_score: avgCompleteness,
        average_cross_source_confidence_score: avgConfidence,
        discrepancy_rate: avgDiscrepancyRate,
        notes: lowConfidence ? ["low_confidence_analysis_enabled"] : [],
      },
      C_structural: {
        average_structural_score: avgStructural,
        liquidity_regime_distribution: countBy(tokenReports.map((x) => x.structural.liquidity_regime)),
        notes: [],
      },
      D_social: {
        enabled: input.config.enableSocialLite,
        data_status: summarizeSocialStatus(tokenReports),
        narrative_mix: countBy(tokenReports.map((x) => x.social.narrative_type)),
        notes: input.config.enableSocialLite ? [] : ["social_pipeline_disabled_by_config"],
      },
      E_risk_divergence: {
        average_overall_risk_score: avgRisk,
        high_risk_count: tokenReports.filter((x) => x.risk.overall_risk_score >= 70).length,
        divergence_override_count: tokenReports.filter((x) => x.divergence.has_override).length,
        notes: [],
      },
      F_classification: {
        market_structure_distribution: countBy(tokenReports.map((x) => x.ecosystem.market_structure)),
        top_narrative: topNarrative(tokenReports),
        notes: [],
      },
    },
    tokens: tokenReports,
    top_structural: tables.top_structural,
    top_fragile: tables.top_fragile,
    notes: lowConfidence
      ? ["data_completeness_below_threshold", "aggressive_rankings_disabled"]
      : [],
  } satisfies ReducedModeRunV1;

  return ReducedModeRunV1Schema.parse(run);
}

function buildReasoningBullets(token: TokenAnalysisV1): [string, string, string] {
  const confidence = token.normalized.quality.cross_source_confidence_score.toFixed(2);
  const structural = token.structural.structural_score.toFixed(2);
  const risk = token.risk.overall_risk_score.toFixed(2);
  const divergenceCount = token.divergence.signal_count;
  return [
    `cross_source_confidence_score=${confidence} and discrepancy_rate=${token.normalized.quality.discrepancy_rate.toFixed(4)}`,
    `structural_score=${structural} with liquidity_regime=${token.structural.liquidity_regime} and v2l_ratio=${token.structural.v2l_ratio === null ? "null" : token.structural.v2l_ratio.toFixed(4)}`,
    `overall_risk_score=${risk} with divergence_signal_count=${divergenceCount} and profile=${token.risk.weight_profile.profile}`,
  ];
}

function summarizeSocialStatus(tokens: TokenAnalysisV1[]): "disabled" | "data_insufficient" | "ok" {
  if (tokens.every((t) => t.social.data_status === "disabled")) return "disabled";
  if (tokens.some((t) => t.social.data_status === "ok")) return "ok";
  return "data_insufficient";
}

function sourceBalance(sources: SourceV1[]): Record<string, number> {
  return countBy(sources);
}

function countBy(values: string[]): Record<string, number> {
  const output: Record<string, number> = {};
  for (const value of values) {
    output[value] = (output[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(output).sort(([a], [b]) => a.localeCompare(b)));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function divergenceHistogram(tokens: TokenAnalysisV1[]): Record<string, number> {
  const histogram: Record<string, number> = {};
  for (const token of tokens) {
    for (const signal of token.divergence.signals) {
      histogram[signal] = (histogram[signal] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(histogram).sort(([a], [b]) => a.localeCompare(b)));
}

function topNarrative(tokens: TokenAnalysisV1[]): "momentum" | "meme" | "utility" | "mixed" | "unknown" {
  const counts = countBy(tokens.map((x) => x.social.narrative_type));
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = entries[0]?.[0];
  if (top === "momentum" || top === "meme" || top === "utility" || top === "mixed" || top === "unknown") {
    return top;
  }
  return "mixed";
}
