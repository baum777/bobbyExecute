import type { InMemoryQueue } from "../queues/index.js";

export class CronScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly queue: InMemoryQueue,
    private readonly intervalMs: number = 5 * 60 * 1000,
  ) {}

  start(): void {
    console.log(`[cron] Starting scheduler, interval=${this.intervalMs}ms`);

    this.tick();

    this.timer = setInterval(() => {
      this.tick();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[cron] Scheduler stopped");
  }

  private tick(): void {
    console.log(`[cron] Enqueuing reducedmode.run job at ${new Date().toISOString()}`);
    this.queue.enqueue("reducedmode.run", {}).catch((err) => {
      console.error("[cron] Failed to enqueue job:", err);
    });
  }
}
