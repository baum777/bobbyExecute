import { DexScreenerAdapter, DexPaprikaAdapter } from "@bobby/adapters";
import { executeReducedModeRun, InMemoryRunStore } from "@bobby/engine";
import type { Job } from "../queues/index.js";

const store = new InMemoryRunStore();

export async function handleReducedModeRunJob(job: Job): Promise<unknown> {
  const dexScreener = new DexScreenerAdapter();
  const dexPaprika = new DexPaprikaAdapter();

  const run = await executeReducedModeRun(dexScreener, dexPaprika, {
    mode: "dry",
  });

  await store.saveRun(run);

  console.log(`[worker] ReducedMode run complete: ${run.run_id} (${run.duration_ms}ms, ${run.tokens.length} tokens)`);
  return { run_id: run.run_id, job_id: job.id };
}
