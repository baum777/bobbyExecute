import pino from "pino";
import { InMemoryMetrics, InMemoryRunStore, ReducedModeEngine } from "@reducedmode/engine";
import type { QueueJob } from "../queues/index.js";

export interface ReducedModeRunJobPayload {
  mode: "live" | "dry";
  maxTokens?: number;
}

const logger = pino({ name: "reducedmode-worker-job" });
const metrics = new InMemoryMetrics();
const store = new InMemoryRunStore();
const engine = new ReducedModeEngine({
  store,
  metrics,
});

export async function runReducedModeJob(job: QueueJob<ReducedModeRunJobPayload>): Promise<void> {
  logger.info({ job_id: job.id, phase: "start" }, "job started");
  const run = await engine.run({
    mode: job.payload.mode,
    ...(job.payload.maxTokens !== undefined ? { maxTokens: job.payload.maxTokens } : {}),
  });
  logger.info(
    { job_id: job.id, run_id: run.run_id, phase: "done", token_count: run.tokens.length },
    "job completed",
  );
}
