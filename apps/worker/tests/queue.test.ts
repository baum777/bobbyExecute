import { describe, it, expect } from "vitest";
import { InMemoryQueue } from "../src/queues/index.js";

describe("InMemoryQueue", () => {
  it("enqueues and processes jobs", async () => {
    const queue = new InMemoryQueue();
    let processed = false;

    queue.register("test", async () => {
      processed = true;
      return { ok: true };
    });

    await queue.enqueue("test", { value: 1 });
    const job = await queue.processNext();

    expect(processed).toBe(true);
    expect(job).not.toBeNull();
    expect(job!.status).toBe("completed");
  });

  it("returns null when queue empty", async () => {
    const queue = new InMemoryQueue();
    const job = await queue.processNext();
    expect(job).toBeNull();
  });

  it("marks job failed on handler error", async () => {
    const queue = new InMemoryQueue();
    queue.register("fail", async () => {
      throw new Error("boom");
    });

    await queue.enqueue("fail", {});
    const job = await queue.processNext();
    expect(job!.status).toBe("failed");
    expect(job!.error).toBe("boom");
  });
});
