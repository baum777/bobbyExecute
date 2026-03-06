/**
 * Standalone server entry - run with: node dist/server/run.js (after npm run build)
 * Or: npx tsx src/server/run.ts
 */
import { createServer } from "./index.js";

const port = parseInt(process.env.PORT ?? "3333", 10);
const host = process.env.HOST ?? "0.0.0.0";

createServer({ port, host })
  .then((server) => {
    console.log(`Server listening on http://${host}:${port}`);
    console.log("Endpoints: GET /health, GET /kpi/summary, GET /kpi/decisions, GET /kpi/adapters, GET /kpi/metrics");
  })
  .catch((err) => {
    console.error("Server failed:", err);
    process.exit(1);
  });
