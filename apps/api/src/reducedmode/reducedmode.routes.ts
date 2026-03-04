import type { FastifyInstance } from "fastify";
import { handleRunPost, handleGetRun, handleHealth } from "./reducedmode.controller.js";

export async function registerReducedModeRoutes(app: FastifyInstance) {
  app.post("/reducedmode/run", handleRunPost);
  app.get<{ Params: { runId: string } }>("/reducedmode/runs/:runId", handleGetRun);
  app.get("/reducedmode/health", handleHealth);
}
