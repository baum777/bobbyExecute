import type { FastifyPluginAsync } from "fastify";
import type { DryRunRuntime } from "../../runtime/dry-run-runtime.js";
import type { IncidentRecord } from "../../persistence/incident-repository.js";
import type { RuntimeCycleSummary } from "../../persistence/runtime-cycle-summary-repository.js";

export interface OperatorRouteDeps {
  runtime?: DryRunRuntime;
  getRuntimeSnapshot?: () => import("../../runtime/dry-run-runtime.js").RuntimeSnapshot;
}

export interface RuntimeCyclesResponse {
  cycles: RuntimeCycleSummary[];
}

export interface IncidentsResponse {
  incidents: IncidentRecord[];
}

export function operatorRoutes(deps: OperatorRouteDeps): FastifyPluginAsync {
  const { runtime, getRuntimeSnapshot } = deps;
  return async (fastify) => {
    fastify.get<{ Querystring: { limit?: string }; Reply: RuntimeCyclesResponse }>(
      "/runtime/cycles",
      async (request, reply) => {
        if (!runtime) {
          return reply.status(501).send({ cycles: [] });
        }
        const limit = Math.min(parseInt(request.query.limit ?? "50", 10) || 50, 200);
        const cycles = await runtime.listRecentCycleSummaries(limit);
        return reply.status(200).send({ cycles });
      }
    );

    fastify.get<{ Querystring: { limit?: string }; Reply: IncidentsResponse }>(
      "/incidents",
      async (request, reply) => {
        if (!runtime) {
          return reply.status(501).send({ incidents: [] });
        }
        const limit = Math.min(parseInt(request.query.limit ?? "50", 10) || 50, 200);
        const incidents = await runtime.listRecentIncidents(limit);
        return reply.status(200).send({ incidents });
      }
    );

    fastify.get("/runtime/status", async (_request, reply) => {
      const runtimeSnapshot = getRuntimeSnapshot?.();
      return reply.status(200).send({ runtime: runtimeSnapshot });
    });
  };
}
