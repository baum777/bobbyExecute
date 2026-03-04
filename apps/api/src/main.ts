import Fastify from "fastify";
import { registerReducedModeRoutes } from "./reducedmode/reducedmode.routes.js";
import { registerHealthRoutes } from "./health/health.routes.js";

const PORT = Number(process.env["PORT"] ?? 3000);
const HOST = process.env["HOST"] ?? "0.0.0.0";

async function main() {
  const app = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    },
  });

  await registerHealthRoutes(app);
  await registerReducedModeRoutes(app);

  await app.listen({ port: PORT, host: HOST });
  console.log(`API server listening on ${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start API server:", err);
  process.exit(1);
});
