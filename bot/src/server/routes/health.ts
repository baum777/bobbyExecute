/**
 * GET /health - Runtime health endpoint (Wave 3 P0).
 */
import type { FastifyPluginAsync } from "fastify";
import type { HealthResponse } from "../contracts/kpi.js";
import type { CircuitBreaker } from "../../governance/circuit-breaker.js";
import { getKillSwitchState } from "../../governance/kill-switch.js";
import { checkHealth } from "../../observability/health.js";

const VERSION = "0.1.0";

export interface HealthRouteDeps {
  circuitBreaker?: CircuitBreaker;
  startedAt: number;
  getBotStatus?: () => "running" | "paused" | "stopped";
}

export function healthRoutes(deps: HealthRouteDeps): FastifyPluginAsync {
  const { circuitBreaker, startedAt, getBotStatus } = deps;
  return async (fastify) => {
    fastify.get<{ Reply: HealthResponse }>("/health", async (_request, reply) => {
    const report = checkHealth(circuitBreaker);
    const uptimeMs = Date.now() - startedAt;
    const killState = getKillSwitchState();
    const body: HealthResponse = {
      status: report.status,
      uptimeMs,
      version: VERSION,
      botStatus: getBotStatus?.(),
      killSwitch: killState.halted ? { halted: true, reason: killState.reason, triggeredAt: killState.triggeredAt } : undefined,
    };
    return reply.status(200).send(body);
  });
  };
}
