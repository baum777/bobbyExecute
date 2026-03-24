import { readJsonFile, writeJsonFile } from "./json-file.js";

export type LiveControlRoundStatus = "idle" | "preflighted" | "running" | "stopped" | "completed" | "failed";

export type LiveControlReasonCode =
  | "live_not_enabled"
  | "micro_live_config_invalid"
  | "micro_live_disarmed"
  | "micro_live_killed"
  | "micro_live_blocked"
  | "micro_live_notional_invalid"
  | "micro_live_notional_cap_exceeded"
  | "micro_live_window_cap_exceeded"
  | "micro_live_daily_notional_cap_exceeded"
  | "micro_live_cooldown_active"
  | "micro_live_inflight_cap_exceeded"
  | "micro_live_allowlist_denied"
  | "micro_live_failure_threshold_reached";

export interface PersistedLiveControlState {
  armed: boolean;
  blocked: boolean;
  degraded: boolean;
  manualRearmRequired: boolean;
  roundStatus: LiveControlRoundStatus;
  roundStartedAt?: string;
  roundStoppedAt?: string;
  roundCompletedAt?: string;
  stopReason?: string;
  failureReason?: string;
  lastTransitionAt?: string;
  lastTransitionBy?: string;
  reasonCode?: LiveControlReasonCode;
  reasonDetail?: string;
  lastReasonAt?: string;
  lastOperatorAction?: "arm" | "disarm" | "kill" | "reset_kill";
  lastOperatorActionAt?: string;
  lastGuardrailRefusal?: {
    code: LiveControlReasonCode;
    stage: "preflight" | "limits";
    at: string;
    detail?: string;
    operatorActionRequired: boolean;
  };
  inFlight: number;
  recentTradeAtMs: number[];
  recentFailureAtMs: number[];
  dailyNotional: number;
  dailyKey: string;
  lastExecutionAtMs?: number;
}

export interface LiveControlRepository {
  kind: "file" | "memory";
  load(): Promise<PersistedLiveControlState | null>;
  save(state: PersistedLiveControlState): Promise<void>;
  loadSync(): PersistedLiveControlState | null;
  saveSync(state: PersistedLiveControlState): void;
}

export class FileSystemLiveControlRepository implements LiveControlRepository {
  kind = "file" as const;

  constructor(private readonly filePath: string) {}

  async load(): Promise<PersistedLiveControlState | null> {
    return this.loadSync();
  }

  save(state: PersistedLiveControlState): Promise<void> {
    this.saveSync(state);
    return Promise.resolve();
  }

  loadSync(): PersistedLiveControlState | null {
    return readJsonFile<PersistedLiveControlState>(this.filePath);
  }

  saveSync(state: PersistedLiveControlState): void {
    writeJsonFile(this.filePath, state);
  }
}

export class InMemoryLiveControlRepository implements LiveControlRepository {
  kind = "memory" as const;

  private state: PersistedLiveControlState = {
    armed: false,
    blocked: false,
    degraded: false,
    manualRearmRequired: false,
    roundStatus: "idle",
    inFlight: 0,
    recentTradeAtMs: [],
    recentFailureAtMs: [],
    dailyNotional: 0,
    dailyKey: new Date().toISOString().slice(0, 10),
  };

  async load(): Promise<PersistedLiveControlState | null> {
    return this.loadSync();
  }

  save(state: PersistedLiveControlState): Promise<void> {
    this.saveSync(state);
    return Promise.resolve();
  }

  loadSync(): PersistedLiveControlState | null {
    return {
      ...this.state,
      recentTradeAtMs: [...this.state.recentTradeAtMs],
      recentFailureAtMs: [...this.state.recentFailureAtMs],
      lastGuardrailRefusal: this.state.lastGuardrailRefusal ? { ...this.state.lastGuardrailRefusal } : undefined,
    };
  }

  saveSync(state: PersistedLiveControlState): void {
    this.state = {
      ...state,
      recentTradeAtMs: [...state.recentTradeAtMs],
      recentFailureAtMs: [...state.recentFailureAtMs],
      lastGuardrailRefusal: state.lastGuardrailRefusal ? { ...state.lastGuardrailRefusal } : undefined,
    };
  }
}
