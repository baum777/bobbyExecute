/**
 * GET /health - Runtime health endpoint (Wave 3 P0).
 */
import type { FastifyPluginAsync } from "fastify";
import type { HealthResponse } from "../contracts/kpi.js";
import type { CircuitBreaker } from "../../governance/circuit-breaker.js";
import { getKillSwitchState } from "../../governance/kill-switch.js";
import { checkHealth } from "../../observability/health.js";
import type { RuntimeSnapshot } from "../../runtime/dry-run-runtime.js";

const VERSION = "0.1.0";

export interface HealthRouteDeps {
  circuitBreaker?: CircuitBreaker;
  startedAt: number;
  getBotStatus?: () => "running" | "paused" | "stopped";
  getRuntimeSnapshot?: () => RuntimeSnapshot;
}

export function healthRoutes(deps: HealthRouteDeps): FastifyPluginAsync {
  const { circuitBreaker, startedAt, getBotStatus, getRuntimeSnapshot } = deps;
  return async (fastify) => {
    fastify.get<{ Reply: HealthResponse }>("/health", async (_request, reply) => {
    const report = checkHealth(circuitBreaker);
    const uptimeMs = Date.now() - startedAt;
    const killState = getKillSwitchState();
    const runtime = getRuntimeSnapshot?.();
    const body: HealthResponse = {
      status: report.status,
      uptimeMs,
      version: VERSION,
      botStatus: getBotStatus?.(),
      killSwitch: killState.halted ? { halted: true, reason: killState.reason, triggeredAt: killState.triggeredAt } : undefined,
      runtime: runtime
        ? {
            status: runtime.status,
            mode: runtime.mode,
            paperModeActive: runtime.paperModeActive,
            cycleInFlight: runtime.cycleInFlight,
            counters: runtime.counters,
            lastCycleAt: runtime.lastCycleAt,
            lastDecisionAt: runtime.lastDecisionAt,
            lastBlockedReason: runtime.lastState?.blockedReason,
            lastEngineStage: runtime.lastState?.stage,
          }
        : undefined,
    };
    return reply.status(200).send(body);
  });
  };
}
