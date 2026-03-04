import type { FastifyReply, FastifyRequest } from "fastify";
import { ReducedModeService } from "./reducedmode.service.js";
import type { ReducedModeRunRequest } from "./reducedmode.types.js";

export class ReducedModeController {
  constructor(private readonly service: ReducedModeService) {}

  run = async (
    request: FastifyRequest<{ Body: ReducedModeRunRequest }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const run = await this.service.run(request.body ?? {});
    reply.status(200).send(run);
  };

  getRun = async (
    request: FastifyRequest<{ Params: { runId: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const run = await this.service.getRun(request.params.runId);
    if (!run) {
      reply.status(404).send({ message: "run_not_found" });
      return;
    }
    reply.status(200).send(run);
  };

  health = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const health = await this.service.health();
    reply.status(200).send(health);
  };
}
