/**
 * GET /kpi/* - KPI endpoints for Dashboard (Wave 3 P0).
 */
import type { FastifyPluginAsync } from "fastify";
import type {
  KpiSummaryResponse,
  KpiDecisionsResponse,
  KpiAdaptersResponse,
  KpiMetricsResponse,
  KpiDecision,
  KpiAdapter,
  KpiMetricProvenance,
} from "../contracts/kpi.js";
import type { CircuitBreaker, AdapterHealth } from "../../governance/circuit-breaker.js";
import type { ActionLogger, ActionLogEntry } from "../../observability/action-log.js";
import { getP95 } from "../../observability/metrics.js";
import { ADAPTER_IDS } from "../../adapters/adapters-with-cb.js";
import type { RuntimeSnapshot } from "../../runtime/dry-run-runtime.js";
import { buildRuntimeHistory, buildRuntimeReadiness } from "../runtime-truth.js";
import { loadVisibleRuntimeState } from "../runtime-visibility.js";
import type { RuntimeVisibilityRepository } from "../../persistence/runtime-visibility-repository.js";

export interface KpiRouteDeps {
  circuitBreaker?: CircuitBreaker;
  actionLogger?: ActionLogger & { list?: () => ActionLogEntry[] };
  getP95?: (name: string) => number | undefined;
  botStatus?: "running" | "paused" | "stopped";
  getBotStatus?: () => "running" | "paused" | "stopped";
  chaosPassRate?: number;
  riskScore?: number;
  getRuntimeSnapshot?: () => RuntimeSnapshot;
  runtimeVisibilityRepository?: RuntimeVisibilityRepository;
  runtimeEnvironment?: string;
}

function mapHealthToStatus(h: AdapterHealth): KpiAdapter["status"] {
  if (h.healthy) {
    const stale = (h.freshnessAgeMs ?? 0) > 15_000;
    return stale ? "degraded" : "healthy";
  }
  return "down";
}

function actionToKpiDecision(entry: ActionLogEntry, index: number): KpiDecision {
  const action =
    entry.blocked === true ? "block" : entry.skillBlockReason ? "abort" : "allow";
  const inputPayload = entry.input as {
    token?: string;
    signal?: { confidence?: number };
    tradeIntent?: { tokenOut?: string; tokenIn?: string };
    executionReport?: { success?: boolean; paperExecution?: boolean };
  };
  const token = inputPayload.token ?? inputPayload.tradeIntent?.tokenOut ?? inputPayload.tradeIntent?.tokenIn ?? "unknown";
  const confidence = typeof entry.output === "object" && entry.output !== null && "confidence" in entry.output
    ? (entry.output as { confidence?: number }).confidence ?? 0
    : inputPayload.signal?.confidence ?? 0;
  const reasons: string[] = [];
  if (entry.reason) reasons.push(entry.reason);
  if (entry.skillBlockReason) reasons.push(entry.skillBlockReason);
  return {
    id: entry.traceId ?? `dec-${index}`,
    timestamp: entry.ts,
    action,
    token,
    confidence,
    reasons,
    provenanceKind: "derived",
    source: "action_log_projection",
    actionLogAction: entry.action,
    actionLogAgentId: entry.agentId,
  };
}

function isTradeExecutionEntry(entry: ActionLogEntry): boolean {
  const inputPayload = entry.input as {
    executionReport?: { success?: boolean; paperExecution?: boolean };
  };
  const executionReport = inputPayload.executionReport;
  return entry.action === "complete" && entry.blocked !== true && executionReport?.success === true;
}

export function kpiRoutes(deps: KpiRouteDeps): FastifyPluginAsync {
  const {
    circuitBreaker,
    actionLogger,
    getP95: getP95Fn,
    botStatus = "stopped",
    getBotStatus,
    chaosPassRate = 1,
    riskScore = 0,
    getRuntimeSnapshot,
    runtimeVisibilityRepository,
    runtimeEnvironment,
  } = deps;

  return async (fastify) => {
    const getEntries = async (): Promise<import("../../observability/action-log.js").ActionLogEntry[]> => {
      const logger = actionLogger as { ensureLoaded?: () => Promise<void>; list?: () => import("../../observability/action-log.js").ActionLogEntry[] } | undefined;
      if (logger && typeof logger.ensureLoaded === "function") await logger.ensureLoaded();
      return logger && typeof logger.list === "function" ? logger.list() : [];
    };

    fastify.get<{ Reply: KpiSummaryResponse }>("/kpi/summary", async (_request, reply) => {
      const entries = await getEntries();
      const visible = await loadVisibleRuntimeState(
        runtimeVisibilityRepository,
        runtimeEnvironment,
        getRuntimeSnapshot
      );
      const runtime = visible.runtime;
      const lastEntry = entries[entries.length - 1];
      const lastDecisionAt = lastEntry?.ts ?? runtime?.lastDecisionAt ?? null;
      const tradesToday = entries.filter(isTradeExecutionEntry).length;
      const dataQuality =
        circuitBreaker != null
          ? (() => {
              const health = circuitBreaker.getHealth();
              const healthy = health.filter((h) => h.healthy).length;
              return health.length > 0 ? healthy / health.length : 1;
            })()
          : runtime?.adapterHealth && runtime.adapterHealth.total > 0
            ? runtime.adapterHealth.healthy / runtime.adapterHealth.total
            : 1;
      const lastDecisionAtProvenance: KpiMetricProvenance =
        lastEntry != null ? "derived" : runtime?.lastDecisionAt != null ? "wired" : "default";
      const dataQualityProvenance: KpiMetricProvenance =
        circuitBreaker != null
          ? "wired"
          : runtime?.adapterHealth && runtime.adapterHealth.total > 0
            ? "derived"
            : "default";
      const body: KpiSummaryResponse = {
        botStatus:
          getBotStatus?.() ??
          (runtime?.status === "running" ? "running" : runtime?.status === "paused" ? "paused" : botStatus),
        riskScore,
        chaosPassRate,
        dataQuality,
        lastDecisionAt,
        tradesToday,
        metricProvenance: {
          riskScore: "default",
          chaosPassRate: "default",
          dataQuality: dataQualityProvenance,
          lastDecisionAt: lastDecisionAtProvenance,
          tradesToday: "derived",
        },
        worker: visible.worker,
        runtime: runtime
          ? {
              mode: runtime.mode,
              paperModeActive: runtime.paperModeActive,
              status: runtime.status,
              cycleCount: runtime.counters.cycleCount,
              decisionCount: runtime.counters.decisionCount,
              executionCount: runtime.counters.executionCount,
              blockedCount: runtime.counters.blockedCount,
              errorCount: runtime.counters.errorCount,
              lastDecisionAt: runtime.lastDecisionAt,
              lastIntakeOutcome: runtime.lastCycleSummary?.intakeOutcome,
              runtimeConfig: runtime.runtimeConfig,
              liveControl: runtime.liveControl
                ? {
                    mode: runtime.liveControl.mode,
                    liveTestMode: runtime.liveControl.liveTestMode,
                    roundStatus: runtime.liveControl.roundStatus,
                    roundStartedAt: runtime.liveControl.roundStartedAt,
                    roundStoppedAt: runtime.liveControl.roundStoppedAt,
                    roundCompletedAt: runtime.liveControl.roundCompletedAt,
                    stopReason: runtime.liveControl.stopReason,
                    failureReason: runtime.liveControl.failureReason,
                    lastTransitionAt: runtime.liveControl.lastTransitionAt,
                    lastTransitionBy: runtime.liveControl.lastTransitionBy,
                    posture: runtime.liveControl.posture,
                    rolloutPosture: runtime.liveControl.rolloutPosture,
                    rolloutConfigured: runtime.liveControl.rolloutConfigured,
                    rolloutConfigValid: runtime.liveControl.rolloutConfigValid,
                    rolloutReasonCode: runtime.liveControl.rolloutReasonCode,
                    rolloutReasonDetail: runtime.liveControl.rolloutReasonDetail,
                    rolloutLastReasonAt: runtime.liveControl.rolloutLastReasonAt,
                    caps: runtime.liveControl.caps,
                    armed: runtime.liveControl.armed,
                    killSwitchActive: runtime.liveControl.killSwitchActive,
                    blocked: runtime.liveControl.blocked,
                    disarmed: runtime.liveControl.disarmed,
                    stopped: runtime.liveControl.stopped,
                    reasonCode: runtime.liveControl.reasonCode,
                    reasonDetail: runtime.liveControl.reasonDetail,
                    lastOperatorAction: runtime.liveControl.lastOperatorAction,
                    lastOperatorActionAt: runtime.liveControl.lastOperatorActionAt,
                    lastGuardrailRefusal: runtime.liveControl.lastGuardrailRefusal,
                    counters: runtime.liveControl.counters,
                  }
                : undefined,
              degraded: runtime.degradedState,
              adapterHealth: runtime.adapterHealth
                ? {
                    total: runtime.adapterHealth.total,
                    healthy: runtime.adapterHealth.healthy,
                    unhealthy: runtime.adapterHealth.unhealthy,
                    degraded: runtime.adapterHealth.degraded,
                    degradedAdapterIds: runtime.adapterHealth.degradedAdapterIds,
                    unhealthyAdapterIds: runtime.adapterHealth.unhealthyAdapterIds,
                  }
                : undefined,
              readiness: buildRuntimeReadiness(runtime),
              recentHistory: buildRuntimeHistory(runtime),
            }
          : undefined,
      };
      return reply.status(200).send(body);
    });

  fastify.get<{ Querystring: { limit?: string }; Reply: KpiDecisionsResponse }>(
    "/kpi/decisions",
    async (request, reply) => {
      const limit = Math.min(parseInt(request.query.limit ?? "50", 10) || 50, 200);
      const entries = await getEntries();
      const recent = entries.slice(-limit).reverse();
      const decisions = recent.map((e, i) => actionToKpiDecision(e, entries.length - 1 - i));
      return reply.status(200).send({ decisions });
    }
  );

    fastify.get<{ Reply: KpiAdaptersResponse }>("/kpi/adapters", async (_request, reply) => {
    const visible = await loadVisibleRuntimeState(
      runtimeVisibilityRepository,
      runtimeEnvironment,
      getRuntimeSnapshot
    );
    const runtime = visible.runtime;
    const health = circuitBreaker?.getHealth() ?? [];
    const adapters: KpiAdapter[] =
      health.length > 0
        ? health.map((h) => ({
            id: h.adapterId,
            status: mapHealthToStatus(h),
            latencyMs: h.averageLatencyMs,
            lastSuccessAt:
              h.lastCheckedAt > 0
                ? new Date(h.lastCheckedAt).toISOString()
                : new Date(0).toISOString(),
            consecutiveFailures: h.consecutiveFailures,
          }))
        : runtime?.adapterHealth
          ? runtime.adapterHealth.adapterIds.map((id) => {
              const unhealthy = runtime.adapterHealth?.unhealthyAdapterIds.includes(id) ?? false;
              const degraded = runtime.adapterHealth?.degradedAdapterIds.includes(id) ?? false;
              return {
                id,
                status: unhealthy ? "down" : degraded ? "degraded" : "healthy",
                latencyMs: 0,
                lastSuccessAt: runtime.lastCycleAt ?? new Date(0).toISOString(),
                consecutiveFailures: 0,
              } satisfies KpiAdapter;
            })
          : [];
    if (adapters.length === 0 && ADAPTER_IDS.length > 0) {
      for (const id of ADAPTER_IDS) {
        adapters.push({
          id,
          status: "down",
          latencyMs: 0,
          lastSuccessAt: new Date(0).toISOString(),
          consecutiveFailures: 0,
        });
      }
    }
    return reply.status(200).send({ adapters });
  });

    fastify.get<{ Reply: KpiMetricsResponse }>("/kpi/metrics", async (_request, reply) => {
      const getter = getP95Fn ?? getP95;
      const names = ["adapter", "quote", "swap", "rpc", "chaos"];
      const p95LatencyMs: Record<string, number> = {};
      for (const name of names) {
        const v = getter(name);
        if (v !== undefined) p95LatencyMs[name] = v;
      }
      return reply.status(200).send({ p95LatencyMs });
    });
  };
}
