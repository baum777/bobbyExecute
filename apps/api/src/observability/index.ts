import type { FastifyInstance } from "fastify";

export async function registerObservabilityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/observability/ping", async () => ({ ok: true }));
}
