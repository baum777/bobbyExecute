/**
 * Standalone public bot entry - run with: node dist/server/run.js (after npm run build)
 * Or: npx tsx src/server/run.ts
 */
import { loadConfig } from "../config/load-config.js";
import { bootstrap } from "../bootstrap.js";

const entryConfig = loadConfig();
const entryMode = entryConfig.executionMode === "live" ? "live-test" : entryConfig.executionMode;
console.log(
  "[server] Starting BobbyExecution entry point",
  JSON.stringify({
    entryMode,
    liveTestMode: entryConfig.liveTestMode,
    rpcMode: entryConfig.rpcMode,
    tradingEnabled: entryConfig.tradingEnabled,
  })
);

bootstrap()
  .then(({ server }) => {
    const addr = server.addresses()[0];
    const host = addr?.address ?? "0.0.0.0";
    const port = addr?.port ?? 3333;
    console.log(`Server listening on http://${host}:${port}`);
    console.log("Endpoints: GET /health, GET /kpi/summary, GET /kpi/decisions, GET /kpi/adapters, GET /kpi/metrics");

    const shutdown = async () => {
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
