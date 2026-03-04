import { InMemoryQueue } from "./queues/index.js";
import { CronScheduler } from "./cron/index.js";
import { handleReducedModeRunJob } from "./jobs/reducedmode.run.job.js";

const INTERVAL_MS = Number(process.env["CRON_INTERVAL_MS"] ?? 5 * 60 * 1000);
const POLL_MS = 2000;

async function main() {
  const queue = new InMemoryQueue();
  queue.register("reducedmode.run", handleReducedModeRunJob);

  const cron = new CronScheduler(queue, INTERVAL_MS);
  cron.start();

  console.log("[worker] Worker started, processing queue...");
  const poll = setInterval(async () => {
    const job = await queue.processNext();
    if (job) {
      console.log(`[worker] Processed job ${job.id}: ${job.status}`);
    }
  }, POLL_MS);

  process.on("SIGINT", () => {
    cron.stop();
    clearInterval(poll);
    console.log("[worker] Shutdown complete");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    cron.stop();
    clearInterval(poll);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
