import pino from "pino";
import type { InMemoryQueue } from "../queues/index.js";
import type { ReducedModeRunJobPayload } from "../jobs/reducedmode.run.job.js";

const logger = pino({ name: "reducedmode-worker-cron" });

export function startCron(
  queue: InMemoryQueue<ReducedModeRunJobPayload>,
  intervalMinutes: number,
): () => void {
  const safeIntervalMinutes = Math.max(1, intervalMinutes);
  const intervalMs = safeIntervalMinutes * 60_000;
  const timer = setInterval(() => {
    queue.enqueue({ mode: "dry" });
    logger.info({ interval_minutes: safeIntervalMinutes }, "scheduled reducedmode run");
  }, intervalMs);

  return () => clearInterval(timer);
}
