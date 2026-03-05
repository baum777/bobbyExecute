import type { InMemoryQueue } from "../queues/index.js";

export class CronScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly queue: InMemoryQueue,
    private readonly intervalMs: number = Number(process.env["REDUCEDMODE_CRON_MS"] ?? 300_000),
  ) {}

  start(): void {
    console.log(`[cron] Scheduler started, interval=${this.intervalMs}ms`);
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    console.log("[cron] Scheduler stopped");
  }

  private tick(): void {
    const mode = process.env["REDUCEDMODE_RUN_MODE"] ?? "dry";
    console.log(`[cron] Enqueuing reducedmode.run (mode=${mode}) at ${new Date().toISOString()}`);
    this.queue.enqueue("reducedmode.run", { mode }).catch((err) => {
      console.error("[cron] Enqueue failed:", err);
    });
  }
}
