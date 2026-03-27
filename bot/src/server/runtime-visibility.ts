import type { RuntimeSnapshot } from "../runtime/dry-run-runtime.js";
import type {
  RuntimeVisibilityRecord,
  RuntimeVisibilityRepository,
  RuntimeWorkerVisibility,
} from "../persistence/runtime-visibility-repository.js";

export interface VisibleRuntimeState {
  record: RuntimeVisibilityRecord | null;
  runtime?: RuntimeSnapshot;
  worker?: RuntimeWorkerVisibility;
  metrics: Record<string, number>;
}

export async function loadVisibleRuntimeState(
  repository: RuntimeVisibilityRepository | undefined,
  environment: string | undefined,
  fallbackRuntime?: () => RuntimeSnapshot | undefined,
  fallbackMetrics?: () => Record<string, number> | undefined
): Promise<VisibleRuntimeState> {
  if (repository && environment) {
    const record = await repository.load(environment);
    if (record) {
      return {
        record,
        runtime: record.snapshot.runtime,
        worker: {
          workerId: record.workerId,
          lastHeartbeatAt: record.lastHeartbeatAt,
          lastCycleAt: record.lastCycleAt,
          lastSeenReloadNonce: record.lastSeenReloadNonce,
          lastAppliedVersionId: record.lastAppliedVersionId,
          lastValidVersionId: record.lastValidVersionId,
          degraded: record.degraded,
          degradedReason: record.degradedReason,
          errorState: record.errorState,
          observedAt: record.observedAt,
        },
        metrics: { ...record.snapshot.metrics },
      };
    }
  }

  return {
    record: null,
    runtime: fallbackRuntime?.(),
    metrics: { ...(fallbackMetrics?.() ?? {}) },
  };
}
