/**
 * GET /health - Runtime health endpoint (Wave 3 P0).
 */
import type { FastifyPluginAsync } from "fastify";
import type { HealthResponse } from "../contracts/kpi.js";
import type { CircuitBreaker } from "../../governance/circuit-breaker.js";
import { checkHealth } from "../../observability/health.js";
import type { RuntimeController } from "../../runtime/controller.js";
import type { RuntimeSnapshot } from "../../runtime/dry-run-runtime.js";
import { buildRuntimeReadiness, buildRuntimeHistory } from "../runtime-truth.js";

const VERSION = "0.1.0";

export interface HealthRouteDeps {
  circuitBreaker?: CircuitBreaker;
  startedAt: number;
  getBotStatus?: () => "running" | "paused" | "stopped";
  getRuntimeSnapshot?: () => RuntimeSnapshot;
  runtime?: RuntimeController;
}

export function healthRoutes(deps: HealthRouteDeps): FastifyPluginAsync {
  const { circuitBreaker, startedAt, getBotStatus, getRuntimeSnapshot, runtime } = deps;
  return async (fastify) => {
    fastify.get<{ Reply: HealthResponse }>("/health", async (_request, reply) => {
      const runtimeSnapshot = getRuntimeSnapshot?.() ?? runtime?.getSnapshot();
      const report = checkHealth(circuitBreaker, runtimeSnapshot);
      const uptimeMs = Date.now() - startedAt;
      const killState = runtimeSnapshot?.liveControl?.killSwitchActive
        ? { halted: true, reason: runtimeSnapshot.liveControl.reasonDetail, triggeredAt: runtimeSnapshot.liveControl.lastTransitionAt }
        : undefined;
      const body: HealthResponse = {
        status: report.status,
        uptimeMs,
        version: VERSION,
        botStatus: getBotStatus?.(),
        killSwitch: killState,
        runtime: runtimeSnapshot
          ? {
              status: runtimeSnapshot.status,
              mode: runtimeSnapshot.mode,
              paperModeActive: runtimeSnapshot.paperModeActive,
              cycleInFlight: runtimeSnapshot.cycleInFlight,
              counters: runtimeSnapshot.counters,
              lastCycleAt: runtimeSnapshot.lastCycleAt,
              lastDecisionAt: runtimeSnapshot.lastDecisionAt,
              lastBlockedReason: runtimeSnapshot.lastState?.blockedReason,
              lastEngineStage: runtimeSnapshot.lastState?.stage,
              lastIntakeOutcome: runtimeSnapshot.lastCycleSummary?.intakeOutcome,
              liveControl: runtimeSnapshot.liveControl
                ? {
                    mode: runtimeSnapshot.liveControl.mode,
                    liveTestMode: runtimeSnapshot.liveControl.liveTestMode,
                    roundStatus: runtimeSnapshot.liveControl.roundStatus,
                    roundStartedAt: runtimeSnapshot.liveControl.roundStartedAt,
                    roundStoppedAt: runtimeSnapshot.liveControl.roundStoppedAt,
                    roundCompletedAt: runtimeSnapshot.liveControl.roundCompletedAt,
                    stopReason: runtimeSnapshot.liveControl.stopReason,
                    failureReason: runtimeSnapshot.liveControl.failureReason,
                    lastTransitionAt: runtimeSnapshot.liveControl.lastTransitionAt,
                    lastTransitionBy: runtimeSnapshot.liveControl.lastTransitionBy,
                    posture: runtimeSnapshot.liveControl.posture,
                    rolloutPosture: runtimeSnapshot.liveControl.rolloutPosture,
                    rolloutConfigured: runtimeSnapshot.liveControl.rolloutConfigured,
                    rolloutConfigValid: runtimeSnapshot.liveControl.rolloutConfigValid,
                    rolloutReasonCode: runtimeSnapshot.liveControl.rolloutReasonCode,
                    rolloutReasonDetail: runtimeSnapshot.liveControl.rolloutReasonDetail,
                    rolloutLastReasonAt: runtimeSnapshot.liveControl.rolloutLastReasonAt,
                    caps: runtimeSnapshot.liveControl.caps,
                    armed: runtimeSnapshot.liveControl.armed,
                    killSwitchActive: runtimeSnapshot.liveControl.killSwitchActive,
                    blocked: runtimeSnapshot.liveControl.blocked,
                    disarmed: runtimeSnapshot.liveControl.disarmed,
                    stopped: runtimeSnapshot.liveControl.stopped,
                    reasonCode: runtimeSnapshot.liveControl.reasonCode,
                    reasonDetail: runtimeSnapshot.liveControl.reasonDetail,
                    lastOperatorAction: runtimeSnapshot.liveControl.lastOperatorAction,
                    lastOperatorActionAt: runtimeSnapshot.liveControl.lastOperatorActionAt,
                    lastGuardrailRefusal: runtimeSnapshot.liveControl.lastGuardrailRefusal,
                    counters: runtimeSnapshot.liveControl.counters,
                  }
                : undefined,
              degraded: runtimeSnapshot.degradedState,
              adapterHealth: runtimeSnapshot.adapterHealth
                ? {
                    total: runtimeSnapshot.adapterHealth.total,
                    healthy: runtimeSnapshot.adapterHealth.healthy,
                    unhealthy: runtimeSnapshot.adapterHealth.unhealthy,
                    degraded: runtimeSnapshot.adapterHealth.degraded,
                    degradedAdapterIds: runtimeSnapshot.adapterHealth.degradedAdapterIds,
                    unhealthyAdapterIds: runtimeSnapshot.adapterHealth.unhealthyAdapterIds,
                  }
                : undefined,
              readiness: buildRuntimeReadiness(runtimeSnapshot),
              recentHistory: buildRuntimeHistory(runtimeSnapshot),
            }
          : undefined,
      };
      return reply.status(200).send(body);
    });
  };
}
