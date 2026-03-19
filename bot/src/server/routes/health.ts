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
    const runtime = getRuntimeSnapshot?.();
    const report = checkHealth(circuitBreaker, runtime);
    const uptimeMs = Date.now() - startedAt;
    const killState = getKillSwitchState();
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
            lastIntakeOutcome: runtime.lastCycleSummary?.intakeOutcome,
            liveControl: runtime.liveControl
              ? {
                  posture: runtime.liveControl.posture,
                  armed: runtime.liveControl.armed,
                  killSwitchActive: runtime.liveControl.killSwitchActive,
                  blocked: runtime.liveControl.blocked,
                  reasonCode: runtime.liveControl.reasonCode,
                  reasonDetail: runtime.liveControl.reasonDetail,
                  lastOperatorAction: runtime.liveControl.lastOperatorAction,
                  lastOperatorActionAt: runtime.liveControl.lastOperatorActionAt,
                  lastGuardrailRefusal: runtime.liveControl.lastGuardrailRefusal,
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
          }
        : undefined,
    };
    return reply.status(200).send(body);
  });
  };
}
