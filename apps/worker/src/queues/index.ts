export type QueueJob<T> = {
  id: string;
  payload: T;
};

export class InMemoryQueue<T> {
  private readonly jobs: QueueJob<T>[] = [];
  private processing = false;

  constructor(private readonly handler: (job: QueueJob<T>) => Promise<void>) {}

  enqueue(payload: T): void {
    this.jobs.push({
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      payload,
    });
    void this.process();
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.jobs.length > 0) {
        const job = this.jobs.shift();
        if (!job) continue;
        await this.handler(job);
      }
    } finally {
      this.processing = false;
    }
  }
}
