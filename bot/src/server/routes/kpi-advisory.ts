/**
 * Optional advisory LLM route — loads advisory module only when invoked (dynamic import).
 * Derived advisory projection only; canonical decision history remains the runtime cycle summary record.
 */
import type { FastifyPluginAsync } from "fastify";
import type { RuntimeSnapshot } from "../../runtime/dry-run-runtime.js";
import { loadVisibleRuntimeState } from "../runtime-visibility.js";
import type { RuntimeVisibilityRepository } from "../../persistence/runtime-visibility-repository.js";
import type { KpiDecisionAdvisoryResponse } from "../contracts/kpi.js";

export interface AdvisoryKpiRouteDeps {
  getRuntimeSnapshot?: () => RuntimeSnapshot;
  runtimeVisibilityRepository?: RuntimeVisibilityRepository;
  runtimeEnvironment?: string;
}

export function advisoryKpiRoutes(deps: AdvisoryKpiRouteDeps): FastifyPluginAsync {
  const { getRuntimeSnapshot, runtimeVisibilityRepository, runtimeEnvironment } = deps;

  return async (fastify) => {
    fastify.get<{
      Params: { id: string };
      Querystring: { compare?: string };
      Reply: KpiDecisionAdvisoryResponse;
    }>("/kpi/decisions/:id/advisory", async (request, reply) => {
      const traceId = decodeURIComponent(request.params.id);
      const compare = request.query.compare === "true" || request.query.compare === "1";

      const visible = await loadVisibleRuntimeState(
        runtimeVisibilityRepository,
        runtimeEnvironment,
        getRuntimeSnapshot
      );
      const runtime = visible.runtime;
      const cycle = runtime?.recentHistory?.recentCycles?.find((c) => c.traceId === traceId);
      const env = cycle?.decisionEnvelope;

      if (!env || env.schemaVersion !== "decision.envelope.v3") {
        request.log.info({ traceId, advisory: "skip_not_v3" }, "advisory_llm_skip");
        return reply.status(404).send({
          traceId,
          enabled: false,
          canonical: null,
          advisory: null,
          advisorySecondary: null,
          audits: [],
          message: "Canonical v3 decision not found for traceId",
        });
      }

      const advisoryMod = await import("../../advisory-llm/service.js");
      const service = advisoryMod.createAdvisoryLLMService();
      const pack = { decision: env };

      if (!service.isEnabled()) {
        request.log.info({ traceId, advisory: "disabled" }, "advisory_llm");
        return reply.status(200).send({
          traceId,
          enabled: false,
          canonical: env,
          advisory: null,
          advisorySecondary: null,
          audits: [],
        });
      }

      if (compare) {
        const { primary, secondary, audits } = await service.explainCompare(pack);
        for (const a of audits) {
          request.log.info(
            {
              traceId: a.traceId,
              provider: a.provider,
              model: a.model,
              latencyMs: a.latencyMs,
              success: a.success,
              cacheKey: a.cacheKey,
              error: a.error,
            },
            "advisory_llm_audit"
          );
        }
        return reply.status(200).send({
          traceId,
          enabled: true,
          canonical: env,
          advisory: primary,
          advisorySecondary: secondary,
          audits,
        });
      }

      const { advisory, audit } = await service.explain(pack);
      request.log.info(
        {
          traceId: audit.traceId,
          provider: audit.provider,
          model: audit.model,
          latencyMs: audit.latencyMs,
          success: audit.success,
          cacheKey: audit.cacheKey,
          error: audit.error,
        },
        "advisory_llm_audit"
      );
      return reply.status(200).send({
        traceId,
        enabled: true,
        canonical: env,
        advisory,
        advisorySecondary: null,
        audits: [audit],
      });
    });
  };
}
