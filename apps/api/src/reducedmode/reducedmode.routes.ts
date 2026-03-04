import type { FastifyInstance } from "fastify";
import { ReducedModeController } from "./reducedmode.controller.js";
import { ReducedModeService } from "./reducedmode.service.js";

export async function registerReducedModeRoutes(app: FastifyInstance): Promise<void> {
  const service = new ReducedModeService();
  const controller = new ReducedModeController(service);

  app.post("/reducedmode/run", controller.run);
  app.get("/reducedmode/runs/:runId", controller.getRun);
  app.get("/reducedmode/health", controller.health);
}
