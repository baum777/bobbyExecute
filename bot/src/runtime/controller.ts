import type { IncidentRecord } from "../persistence/incident-repository.js";
import type { RuntimeCycleSummary } from "../persistence/runtime-cycle-summary-repository.js";
import type {
  RuntimeControlResult,
  RuntimeCycleReplay,
  RuntimeSnapshot,
  RuntimeStatus,
} from "./dry-run-runtime.js";

export interface RuntimeController {
  start(): Promise<void>;
  stop(): Promise<void>;
  emergencyStop(reason?: string): Promise<RuntimeControlResult>;
  pause(reason?: string): Promise<RuntimeControlResult>;
  resume(reason?: string): Promise<RuntimeControlResult>;
  halt(reason?: string): Promise<RuntimeControlResult>;
  armLive(reason?: string): Promise<RuntimeControlResult>;
  disarmLive(reason?: string): Promise<RuntimeControlResult>;
  resetLiveKill(reason?: string): Promise<RuntimeControlResult>;
  getStatus(): RuntimeStatus;
  getSnapshot(): RuntimeSnapshot;
  listRecentCycleSummaries(limit?: number): Promise<RuntimeCycleSummary[]>;
  listRecentIncidents(limit?: number): Promise<IncidentRecord[]>;
  getCycleReplay(traceId: string): Promise<RuntimeCycleReplay | null>;
}
