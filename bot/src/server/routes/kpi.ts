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
} from "../contracts/kpi.js";
import type { CircuitBreaker, AdapterHealth } from "../../governance/circuit-breaker.js";
import type { ActionLogger, ActionLogEntry } from "../../observability/action-log.js";
import { getP95 } from "../../observability/metrics.js";
import { ADAPTER_IDS } from "../../adapters/adapters-with-cb.js";
import type { RuntimeSnapshot } from "../../runtime/dry-run-runtime.js";

export interface KpiRouteDeps {
  circuitBreaker?: CircuitBreaker;
  actionLogger?: ActionLogger & { list?: () => ActionLogEntry[] };
  getP95?: (name: string) => number | undefined;
  botStatus?: "running" | "paused" | "stopped";
  getBotStatus?: () => "running" | "paused" | "stopped";
  chaosPassRate?: number;
  riskScore?: number;
  getRuntimeSnapshot?: () => RuntimeSnapshot;
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
  const token = (entry.input as { token?: string })?.token ?? "unknown";
  const confidence = typeof entry.output === "object" && entry.output !== null && "confidence" in entry.output
    ? (entry.output as { confidence?: number }).confidence ?? 0
    : 0;
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
  };
}

export function kpiRoutes(deps: KpiRouteDeps): FastifyPluginAsync {
  const {
    circuitBreaker,
    actionLogger,
    getP95: getP95Fn,
    botStatus = "running",
    getBotStatus,
    chaosPassRate = 1,
    riskScore = 0,
    getRuntimeSnapshot,
  } = deps;

  return async (fastify) => {
    const getEntries = async (): Promise<import("../../observability/action-log.js").ActionLogEntry[]> => {
      const logger = actionLogger as { ensureLoaded?: () => Promise<void>; list?: () => import("../../observability/action-log.js").ActionLogEntry[] } | undefined;
      if (logger && typeof logger.ensureLoaded === "function") await logger.ensureLoaded();
      return logger && typeof logger.list === "function" ? logger.list() : [];
    };

    fastify.get<{ Reply: KpiSummaryResponse }>("/kpi/summary", async (_request, reply) => {
    const entries = await getEntries();
    const lastEntry = entries[entries.length - 1];
    const lastDecisionAt = lastEntry?.ts ?? null;
    const tradesToday = entries.filter((e) => e.action === "execute" && !e.blocked).length;
    const dataQuality =
      circuitBreaker != null
        ? (() => {
            const health = circuitBreaker.getHealth();
            const healthy = health.filter((h) => h.healthy).length;
            return health.length > 0 ? healthy / health.length : 1;
          })()
        : 1;

    const runtime = getRuntimeSnapshot?.();
    const body: KpiSummaryResponse = {
      botStatus: getBotStatus?.() ?? botStatus,
      riskScore,
      chaosPassRate,
      dataQuality,
      lastDecisionAt,
      tradesToday,
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
    const health = circuitBreaker?.getHealth() ?? [];
    const adapters: KpiAdapter[] = health.map((h) => ({
      id: h.adapterId,
      status: mapHealthToStatus(h),
      latencyMs: h.averageLatencyMs,
      lastSuccessAt:
        h.lastCheckedAt > 0
          ? new Date(h.lastCheckedAt).toISOString()
          : new Date(0).toISOString(),
      consecutiveFailures: h.consecutiveFailures,
    }));
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
