import Fastify from "fastify";
import { registerReducedModeRoutes } from "./reducedmode/reducedmode.routes.js";
import { registerHealthRoutes } from "./health/index.js";
import { registerObservabilityRoutes } from "./observability/index.js";

async function bootstrap(): Promise<void> {
  const app = Fastify({ logger: true });
  await registerHealthRoutes(app);
  await registerObservabilityRoutes(app);
  await registerReducedModeRoutes(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
