import type { FastifyInstance } from "fastify";
import { handleHealthCheck } from "./health.controller.js";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", handleHealthCheck);
}
