import type { FastifyRequest, FastifyReply } from "fastify";

export async function handleHealthCheck(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send({ status: "ok", timestamp: new Date().toISOString() });
}
