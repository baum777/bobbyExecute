import type { FastifyRequest, FastifyReply } from "fastify";
import { ReducedModeService } from "./reducedmode.service.js";
import { RunRequestSchema } from "./reducedmode.types.js";

const service = new ReducedModeService();

export async function handleRunPost(request: FastifyRequest, reply: FastifyReply) {
  const parsed = RunRequestSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid request", details: parsed.error.issues });
  }

  try {
    const run = await service.executeRun(parsed.data);
    return reply.status(200).send(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.status(500).send({ error: message });
  }
}

export async function handleGetRun(
  request: FastifyRequest<{ Params: { runId: string } }>,
  reply: FastifyReply,
) {
  const run = await service.getRun(request.params.runId);
  if (!run) {
    return reply.status(404).send({ error: "Run not found" });
  }
  return reply.status(200).send(run);
}

export async function handleHealth(_request: FastifyRequest, reply: FastifyReply) {
  const info = service.getHealthInfo();
  return reply.status(200).send(info);
}
