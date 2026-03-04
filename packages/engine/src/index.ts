import {
  ReducedModeRunV1Schema,
  TokenAnalysisV1Schema,
  type ReducedModeRunV1,
  type RunModeV1,
} from "@reducedmode/contracts";
import {
  DexPaprikaAdapterImpl,
  DexScreenerAdapterImpl,
  MoralisAdapterStub,
  RpcAdapterStub,
} from "@reducedmode/adapters";
import { DEFAULT_REDUCEDMODE_CONFIG, type ReducedModeConfig } from "./config.js";
import { UniverseBuilder } from "./universe/universe.builder.js";
import { normalizeUniverse } from "./normalize/normalizer.js";
import { buildStructuralMetrics } from "./structural/structural.metrics.js";
import { collectSocialSignals } from "./social/social.collector.js";
import { scoreSocialIntel } from "./social/social.scorer.js";
import { detectDivergence } from "./divergence/divergence.detect.js";
import { computeRiskBreakdown } from "./risk/risk.model.js";
import { classifyEcosystem } from "./classify/ecosystem.classifier.js";
import { buildReducedModeReport } from "./output/report.builder.js";
import { createLogger } from "./observability/logger.js";
import { InMemoryMetrics, NoopMetrics, type MetricsSink } from "./observability/metrics.js";
import { InMemoryRunStore, type RunStore } from "./storage/run.store.js";

export interface ReducedModeRunRequest {
  mode?: RunModeV1;
  maxTokens?: number;
}

export interface ReducedModeEngineDeps {
  config?: Partial<ReducedModeConfig>;
  store?: RunStore;
  metrics?: MetricsSink;
  dexscreener?: DexScreenerAdapterImpl;
  dexpaprika?: DexPaprikaAdapterImpl;
  moralis?: MoralisAdapterStub;
  rpc?: RpcAdapterStub;
}

export class ReducedModeEngine {
  private readonly config: ReducedModeConfig;
  private readonly store: RunStore;
  private readonly metrics: MetricsSink;
  private readonly dexscreener: DexScreenerAdapterImpl;
  private readonly dexpaprika: DexPaprikaAdapterImpl;
  private readonly moralis: MoralisAdapterStub;
  private readonly rpc: RpcAdapterStub;
  private readonly logger = createLogger("reducedmode-engine");
  private lastRunStatus: ReducedModeRunV1["status"] | null = null;

  constructor(deps: ReducedModeEngineDeps = {}) {
    this.config = {
      ...DEFAULT_REDUCEDMODE_CONFIG,
      ...(deps.config ?? {}),
    };
    this.store = deps.store ?? new InMemoryRunStore();
    this.metrics = deps.metrics ?? new NoopMetrics();
    this.dexscreener = deps.dexscreener ?? new DexScreenerAdapterImpl(undefined, this.metrics);
    this.dexpaprika = deps.dexpaprika ?? new DexPaprikaAdapterImpl(undefined, this.metrics);
    this.moralis = deps.moralis ?? new MoralisAdapterStub({ enableMoralis: this.config.enableMoralis });
    this.rpc = deps.rpc ?? new RpcAdapterStub({ enableRpcVerify: this.config.enableRpcVerify });
  }

  async run(request: ReducedModeRunRequest = {}): Promise<ReducedModeRunV1> {
    const startedAt = Date.now();
    const runMode: RunModeV1 = request.mode ?? "dry";
    const runId = `reducedmode-${Date.now()}`;
    const requestedMaxTokens = request.maxTokens ?? this.config.MAX_UNIQUE_TOKENS;
    const maxTokens = Math.max(
      this.config.MIN_UNIQUE_TOKENS,
      Math.min(this.config.MAX_UNIQUE_TOKENS, requestedMaxTokens),
    );

    this.logger.info({ run_id: runId, phase: "start", mode: runMode }, "run started");

    const universeBuilder = new UniverseBuilder({
      dexscreener: this.dexscreener,
      dexpaprika: this.dexpaprika,
      config: this.config,
    });

    const universe = await universeBuilder.build(maxTokens);
    this.metrics.gauge("engine.universe.size", universe.selected.length);
    this.logger.info(
      { run_id: runId, phase: "universe", token_count: universe.selected.length },
      "phase 1 completed",
    );

    const normalized = normalizeUniverse({
      candidates: universe.selected,
      discrepancyThreshold: this.config.DISCREPANCY_THRESHOLD,
    });
    this.metrics.histogram(
      "engine.completeness.avg",
      average(normalized.map((x) => x.quality.data_completeness_score)),
    );
    this.logger.info({ run_id: runId, phase: "normalize", token_count: normalized.length }, "phase 2 completed");

    const tokenAnalyses = [];
    for (const token of normalized) {
      const structural = buildStructuralMetrics(token);
      const socialCollected = collectSocialSignals({
        enabled: this.config.enableSocialLite && runMode === "live",
        token,
      });
      const social = scoreSocialIntel(socialCollected);
      const divergence = detectDivergence({
        normalized: token,
        structural,
        social,
        discrepancyThreshold: this.config.DISCREPANCY_THRESHOLD,
      });
      const risk = computeRiskBreakdown({
        normalized: token,
        structural,
        social,
        divergence,
        discrepancyThreshold: this.config.DISCREPANCY_THRESHOLD,
      });
      const ecosystem = classifyEcosystem({
        structural,
        social,
        divergence,
      });

      const rpcCheck = await this.rpc.verifyMintExists(token.token.contract_address);
      if (!rpcCheck.ok) {
        continue;
      }

      const _moralis = await this.moralis.fetchTokenSignals([token.token.contract_address]);
      tokenAnalyses.push(
        TokenAnalysisV1Schema.parse({
          token: token.token,
          normalized: token,
          structural,
          social,
          risk,
          divergence,
          ecosystem,
          reasoning_bullets: ["", "", ""],
        }),
      );
    }

    const run = buildReducedModeReport({
      run_id: runId,
      generated_at: new Date().toISOString(),
      mode: runMode,
      config: this.config,
      universe,
      tokens: tokenAnalyses,
    });

    const parsed = ReducedModeRunV1Schema.parse(run);
    await this.store.saveRun(parsed);
    this.lastRunStatus = parsed.status;

    const duration = Date.now() - startedAt;
    this.metrics.histogram("engine.run.duration_ms", duration);
    this.metrics.histogram("engine.confidence.avg", parsed.transparency.average_confidence_score);
    this.metrics.gauge("engine.discrepancy.rate", parsed.transparency.discrepancy_rate_avg);
    this.logger.info({ run_id: runId, phase: "done", token_count: parsed.tokens.length, durationMs: duration }, "run completed");

    return parsed;
  }

  async getRun(runId: string): Promise<ReducedModeRunV1 | null> {
    return this.store.getRun(runId);
  }

  healthSnapshot(): {
    lastRunStatus: ReducedModeRunV1["status"] | null;
    breakerStates: Record<string, unknown>;
    p95LatencyMs: number | null;
  } {
    const p95LatencyMs =
      this.metrics instanceof InMemoryMetrics ? this.metrics.p95("engine.run.duration_ms") : null;
    return {
      lastRunStatus: this.lastRunStatus,
      breakerStates: {
        dexscreener: this.dexscreener.breakerState(),
        dexpaprika: this.dexpaprika.breakerState(),
      },
      p95LatencyMs,
    };
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export * from "./config.js";
export * from "./storage/index.js";
export * from "./observability/metrics.js";
export * from "./universe/universe.builder.js";
export * from "./universe/contract.resolver.js";
export * from "./universe/dedupe.balance.js";
export * from "./normalize/normalizer.js";
export * from "./normalize/crosssource.confidence.js";
export * from "./structural/structural.metrics.js";
export * from "./structural/regime.infer.js";
export * from "./social/social.collector.js";
export * from "./social/social.scorer.js";
export * from "./risk/risk.model.js";
export * from "./risk/risk.weights.js";
export * from "./risk/flags.js";
export * from "./divergence/divergence.detect.js";
export * from "./classify/ecosystem.classifier.js";
export * from "./output/report.builder.js";
export * from "./output/tables.builder.js";
