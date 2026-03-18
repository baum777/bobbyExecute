import type { FastifyPluginAsync } from "fastify";
import type { DryRunRuntime } from "../../runtime/dry-run-runtime.js";
import type { IncidentRecord } from "../../persistence/incident-repository.js";
import type { RuntimeCycleSummary } from "../../persistence/runtime-cycle-summary-repository.js";

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

export interface OperatorRouteDeps {
  runtime?: DryRunRuntime;
  getRuntimeSnapshot?: () => import("../../runtime/dry-run-runtime.js").RuntimeSnapshot;
}

export interface OperatorReadErrorResponse {
  success: false;
  code: "runtime_unavailable" | "invalid_limit";
  message: string;
}

export interface RuntimeCyclesResponse {
  success: true;
  cycles: RuntimeCycleSummary[];
}

export interface IncidentsResponse {
  success: true;
  incidents: IncidentRecord[];
}

export interface RuntimeStatusResponse {
  success: true;
  runtime: import("../../runtime/dry-run-runtime.js").RuntimeSnapshot;
}

function parseLimit(rawLimit?: string): { ok: true; limit: number } | { ok: false; error: OperatorReadErrorResponse } {
  if (rawLimit == null) {
    return { ok: true, limit: DEFAULT_LIST_LIMIT };
  }

  if (!/^\d+$/.test(rawLimit)) {
    return {
      ok: false,
      error: {
        success: false,
        code: "invalid_limit",
        message: `Invalid limit '${rawLimit}': limit must be an integer between 1 and ${MAX_LIST_LIMIT}.`,
      },
    };
  }

  const limit = Number.parseInt(rawLimit, 10);
  if (limit < 1 || limit > MAX_LIST_LIMIT) {
    return {
      ok: false,
      error: {
        success: false,
        code: "invalid_limit",
        message: `Invalid limit '${rawLimit}': limit must be an integer between 1 and ${MAX_LIST_LIMIT}.`,
      },
    };
  }

  return { ok: true, limit };
}

export function operatorRoutes(deps: OperatorRouteDeps): FastifyPluginAsync {
  const { runtime, getRuntimeSnapshot } = deps;
  return async (fastify) => {
    fastify.get<{ Querystring: { limit?: string }; Reply: RuntimeCyclesResponse | OperatorReadErrorResponse }>(
      "/runtime/cycles",
      async (request, reply) => {
        if (!runtime) {
          return reply.status(501).send({
            success: false,
            code: "runtime_unavailable",
            message: "Recent cycle summaries unavailable: runtime is not wired.",
          });
        }
        const parsedLimit = parseLimit(request.query.limit);
        if (!parsedLimit.ok) {
          return reply.status(400).send(parsedLimit.error);
        }
        const cycles = await runtime.listRecentCycleSummaries(parsedLimit.limit);
        return reply.status(200).send({ success: true, cycles });
      }
    );

    fastify.get<{ Querystring: { limit?: string }; Reply: IncidentsResponse | OperatorReadErrorResponse }>(
      "/incidents",
      async (request, reply) => {
        if (!runtime) {
          return reply.status(501).send({
            success: false,
            code: "runtime_unavailable",
            message: "Recent incidents unavailable: runtime is not wired.",
          });
        }
        const parsedLimit = parseLimit(request.query.limit);
        if (!parsedLimit.ok) {
          return reply.status(400).send(parsedLimit.error);
        }
        const incidents = await runtime.listRecentIncidents(parsedLimit.limit);
        return reply.status(200).send({ success: true, incidents });
      }
    );

    fastify.get<{ Reply: RuntimeStatusResponse | OperatorReadErrorResponse }>("/runtime/status", async (_request, reply) => {
      const runtimeSnapshot = getRuntimeSnapshot?.() ?? runtime?.getSnapshot();
      if (!runtimeSnapshot) {
        return reply.status(501).send({
          success: false,
          code: "runtime_unavailable",
          message: "Runtime status unavailable: runtime snapshot wiring is missing.",
        });
      }
      return reply.status(200).send({ success: true, runtime: runtimeSnapshot });
    });
  };
}
