/**
 * Fastify HTTP server for Runtime Visibility & Dashboard Bridge (Wave 3 P0).
 * Endpoints: GET /health, GET /kpi/summary, GET /kpi/decisions, GET /kpi/adapters, GET /kpi/metrics
 */
import Fastify from "fastify";
import { healthRoutes } from "./routes/health.js";
import { kpiRoutes } from "./routes/kpi.js";
import { controlRoutes } from "./routes/control.js";
import type { CircuitBreaker } from "../governance/circuit-breaker.js";
import type { ActionLogger } from "../observability/action-log.js";
import type { KpiRouteDeps } from "./routes/kpi.js";
import type { HealthRouteDeps } from "./routes/health.js";

export interface ServerConfig {
  port?: number;
  host?: string;
  circuitBreaker?: CircuitBreaker;
  actionLogger?: ActionLogger & { list?: () => import("../observability/action-log.js").ActionLogEntry[] };
  getP95?: (name: string) => number | undefined;
  botStatus?: "running" | "paused" | "stopped";
  getBotStatus?: () => "running" | "paused" | "stopped";
  chaosPassRate?: number;
  riskScore?: number;
}

const DEFAULT_PORT = 3333;
const DEFAULT_HOST = "0.0.0.0";

/**
 * Create and start the Fastify server.
 * Returns the server instance; call server.close() to stop.
 */
export async function createServer(config: ServerConfig = {}) {
  const port = config.port ?? DEFAULT_PORT;
  const host = config.host ?? DEFAULT_HOST;
  const startedAt = Date.now();

  const fastify = Fastify({ logger: true });

  await fastify.register(healthRoutes({
    circuitBreaker: config.circuitBreaker,
    startedAt,
  }));

  const kpiDeps: KpiRouteDeps = {
    circuitBreaker: config.circuitBreaker,
    actionLogger: config.actionLogger,
    getP95: config.getP95,
    botStatus: config.botStatus,
    getBotStatus: config.getBotStatus,
    chaosPassRate: config.chaosPassRate,
    riskScore: config.riskScore,
  };
  await fastify.register(kpiRoutes(kpiDeps));
  await fastify.register(controlRoutes);

  await fastify.listen({ port, host });
  return fastify;
}
