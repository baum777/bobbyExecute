import { InMemoryQueue } from "./queues/index.js";
import { CronScheduler } from "./cron/scheduler.js";
import { handleReducedModeRunJob } from "./jobs/reducedmode.run.job.js";

const POLL_MS = 2000;

async function main() {
  const queue = new InMemoryQueue();
  queue.register("reducedmode.run", handleReducedModeRunJob);

  const cron = new CronScheduler(queue);
  cron.start();

  console.log("[worker] Worker started, processing queue...");
  const poll = setInterval(async () => {
    const job = await queue.processNext();
    if (job) console.log(`[worker] Processed job ${job.id}: ${job.status}`);
  }, POLL_MS);

  const shutdown = () => { cron.stop(); clearInterval(poll); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => { console.error("[worker] Fatal:", err); process.exit(1); });
