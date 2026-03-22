import type { FastifyPluginAsync } from "fastify";
import type { DryRunRuntime } from "../../runtime/dry-run-runtime.js";
import type { IncidentRecord } from "../../persistence/incident-repository.js";
import type { RuntimeCycleSummary } from "../../persistence/runtime-cycle-summary-repository.js";
import type { JournalEntry } from "../../core/contracts/journal.js";
import { buildRuntimeReadiness } from "../runtime-truth.js";
import type { RuntimeReadiness } from "../contracts/kpi.js";

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

export interface OperatorRouteDeps {
  runtime?: DryRunRuntime;
  getRuntimeSnapshot?: () => import("../../runtime/dry-run-runtime.js").RuntimeSnapshot;
  requiredToken?: string;
}

export interface OperatorReadErrorResponse {
  success: false;
  code:
    | "runtime_unavailable"
    | "invalid_limit"
    | "cycle_not_found"
    | "operator_auth_unconfigured"
    | "operator_auth_invalid";
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
  liveControl?: import("../../runtime/live-control.js").MicroLiveControlSnapshot;
  readiness?: RuntimeReadiness;
}

export interface RuntimeCycleReplayResponse {
  success: true;
  replay: {
    traceId: string;
    summary: RuntimeCycleSummary;
    incidents: IncidentRecord[];
    journal: JournalEntry[];
  };
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

function readPresentedToken(headers: Record<string, unknown>): string | undefined {
  const operatorToken = headers["x-operator-token"];
  if (typeof operatorToken === "string" && operatorToken.length > 0) {
    return operatorToken;
  }

  const authorization = headers.authorization;
  if (typeof authorization === "string") {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

export function operatorRoutes(deps: OperatorRouteDeps): FastifyPluginAsync {
  const { runtime, getRuntimeSnapshot, requiredToken } = deps;
  return async (fastify) => {
    fastify.addHook("preHandler", async (request, reply) => {
      if (!requiredToken) {
        return reply.status(403).send({
          success: false,
          code: "operator_auth_unconfigured",
          message: "Operator read routes denied: OPERATOR_READ_TOKEN is not configured.",
        } satisfies OperatorReadErrorResponse);
      }

      const presentedToken = readPresentedToken(request.headers as Record<string, unknown>);
      if (presentedToken !== requiredToken) {
        return reply.status(403).send({
          success: false,
          code: "operator_auth_invalid",
          message: "Operator read routes denied: missing or invalid operator authorization.",
        } satisfies OperatorReadErrorResponse);
      }
    });

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

    fastify.get<{ Params: { traceId: string }; Reply: RuntimeCycleReplayResponse | OperatorReadErrorResponse }>(
      "/runtime/cycles/:traceId/replay",
      async (request, reply) => {
        if (!runtime) {
          return reply.status(501).send({
            success: false,
            code: "runtime_unavailable",
            message: "Runtime replay unavailable: runtime is not wired.",
          });
        }

        const replay = await runtime.getCycleReplay(request.params.traceId);
        if (!replay) {
          return reply.status(404).send({
            success: false,
            code: "cycle_not_found",
            message: `No persisted cycle evidence found for traceId '${request.params.traceId}'.`,
          });
        }

        return reply.status(200).send({ success: true, replay });
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
      return reply.status(200).send({
        success: true,
        runtime: runtimeSnapshot,
        liveControl: runtimeSnapshot.liveControl,
        readiness: buildRuntimeReadiness(runtimeSnapshot),
      });
    });
  };
}
