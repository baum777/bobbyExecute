import pino from "pino";
import { startCron } from "./cron/index.js";
import { runReducedModeJob } from "./jobs/reducedmode.run.job.js";
import { InMemoryQueue } from "./queues/index.js";

const logger = pino({ name: "reducedmode-worker" });

async function bootstrap(): Promise<void> {
  const queue = new InMemoryQueue(runReducedModeJob);
  const intervalMinutes = Number(process.env.REDUCEDMODE_CRON_MINUTES ?? 5);
  startCron(queue, intervalMinutes);
  queue.enqueue({ mode: "dry" });
  logger.info({ intervalMinutes }, "worker started");
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
