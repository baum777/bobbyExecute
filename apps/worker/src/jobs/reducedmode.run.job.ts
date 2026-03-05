import { DexScreenerAdapter, DexPaprikaAdapter } from "@bobby/adapters";
import { executeReducedModeRun, InMemoryRunStore } from "@bobby/engine";
import { workerMetrics } from "../observability/metrics.js";
import { workerLogger } from "../observability/logger.js";
import type { Job } from "../queues/index.js";

const store = new InMemoryRunStore();

export async function handleReducedModeRunJob(job: Job): Promise<unknown> {
  const mode = (job.data as { mode?: string })?.mode === "live" ? "live" : "dry";
  const ds = new DexScreenerAdapter();
  const dp = new DexPaprikaAdapter();

  const run = await executeReducedModeRun(ds, dp, { mode: mode as "live" | "dry", metrics: workerMetrics });
  await store.saveRun(run);

  workerLogger.info({ run_id: run.run_id, tokens: run.tokens.length, duration_ms: run.duration_ms }, "Run complete");
  return { run_id: run.run_id, job_id: job.id };
}
