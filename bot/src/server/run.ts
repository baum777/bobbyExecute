/**
 * Standalone server entry - run with: node dist/server/run.js (after npm run build)
 * Or: npx tsx src/server/run.ts
 * Uses bootstrap: config validation + assertLiveTradingRequiresRealRpc before server start.
 */
import { bootstrap } from "../bootstrap.js";

bootstrap()
  .then(({ server, runtime }) => {
    const addr = server.addresses()[0];
    const host = addr?.address ?? "0.0.0.0";
    const port = addr?.port ?? 3333;
    console.log(`Server listening on http://${host}:${port}`);
    console.log("Endpoints: GET /health, GET /kpi/summary, GET /kpi/decisions, GET /kpi/adapters, GET /kpi/metrics, GET /runtime/status, GET /runtime/cycles, GET /incidents");

    const shutdown = async () => {
      await runtime.stop();
      await server.close();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  })
  .catch((err) => {
    console.error("Server failed:", err);
    process.exit(1);
  });
