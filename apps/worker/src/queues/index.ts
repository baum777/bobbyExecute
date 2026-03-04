export interface Job<T = unknown> {
  id: string;
  type: string;
  data: T;
  createdAt: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
}

export class InMemoryQueue {
  private readonly jobs: Job[] = [];
  private readonly handlers = new Map<string, (job: Job) => Promise<unknown>>();

  register(type: string, handler: (job: Job) => Promise<unknown>): void {
    this.handlers.set(type, handler);
  }

  async enqueue<T>(type: string, data: T): Promise<Job<T>> {
    const job: Job<T> = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      data,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    this.jobs.push(job as Job);
    return job;
  }

  async processNext(): Promise<Job | null> {
    const pending = this.jobs.find((j) => j.status === "pending");
    if (!pending) return null;

    const handler = this.handlers.get(pending.type);
    if (!handler) {
      pending.status = "failed";
      pending.error = `No handler for job type: ${pending.type}`;
      return pending;
    }

    pending.status = "running";
    try {
      pending.result = await handler(pending);
      pending.status = "completed";
    } catch (err) {
      pending.status = "failed";
      pending.error = err instanceof Error ? err.message : String(err);
    }
    return pending;
  }

  getJobs(): readonly Job[] {
    return this.jobs;
  }
}
