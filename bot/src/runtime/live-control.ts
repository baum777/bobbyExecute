import type { TradeIntent } from "../core/contracts/trade.js";
import { getKillSwitchState, isKillSwitchHalted, triggerKillSwitch } from "../governance/kill-switch.js";

export type LiveControlPosture =
  | "live_unavailable"
  | "live_disarmed"
  | "live_armed"
  | "live_blocked"
  | "live_killed";

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

export interface MicroLiveCaps {
  requireArm: boolean;
  maxNotionalPerTrade: number;
  maxTradesPerWindow: number;
  windowMs: number;
  cooldownMs: number;
  maxInFlight: number;
  failuresToBlock: number;
  failureWindowMs: number;
  maxDailyNotional?: number;
  allowlistTokens: string[];
}

export interface MicroLiveControlSnapshot {
  posture: LiveControlPosture;
  executionMode: "dry" | "paper" | "live";
  liveEnabled: boolean;
  armed: boolean;
  killSwitchActive: boolean;
  blocked: boolean;
  degraded: boolean;
  manualRearmRequired: boolean;
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
  caps: MicroLiveCaps;
  counters: {
    inFlight: number;
    tradesInWindow: number;
    failuresInWindow: number;
    dailyNotional: number;
    lastExecutionAt?: string;
  };
}

export interface LiveControlDecision {
  allowed: boolean;
  attempt?: LiveExecutionAttempt;
  refusal?: {
    code: LiveControlReasonCode;
    stage: "preflight" | "limits";
    detail?: string;
    at: string;
    operatorActionRequired: boolean;
    posture: LiveControlPosture;
  };
}

export interface LiveExecutionAttempt {
  attemptId: string;
  startedAt: string;
  notional: number;
}

type ExecutionMode = "dry" | "paper" | "live";

interface MutableControlState {
  armed: boolean;
  blocked: boolean;
  degraded: boolean;
  manualRearmRequired: boolean;
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

const DEFAULT_CAPS: MicroLiveCaps = {
  requireArm: true,
  maxNotionalPerTrade: 25,
  maxTradesPerWindow: 2,
  windowMs: 60 * 60 * 1000,
  cooldownMs: 60 * 1000,
  maxInFlight: 1,
  failuresToBlock: 3,
  failureWindowMs: 15 * 60 * 1000,
  maxDailyNotional: 50,
  allowlistTokens: [],
};

const state: MutableControlState = {
  armed: false,
  blocked: false,
  degraded: false,
  manualRearmRequired: false,
  inFlight: 0,
  recentTradeAtMs: [],
  recentFailureAtMs: [],
  dailyNotional: 0,
  dailyKey: toDayKey(Date.now()),
};

function toDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw === "") {
    return fallback;
  }
  const normalized = raw.toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error(`invalid boolean '${raw}'`);
}

function parseNumber(raw: string | undefined, fallback: number, min: number): number {
  if (raw == null || raw === "") {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`invalid numeric '${raw}'`);
  }
  return parsed;
}

function parseIntStrict(raw: string | undefined, fallback: number, min: number): number {
  if (raw == null || raw === "") {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    throw new Error(`invalid integer '${raw}'`);
  }
  const parsed = Number.parseInt(raw, 10);
  if (parsed < min) {
    throw new Error(`invalid integer '${raw}'`);
  }
  return parsed;
}

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function readExecutionMode(env: NodeJS.ProcessEnv): ExecutionMode {
  if (String(env.LIVE_TRADING).toLowerCase() === "true") {
    return "live";
  }
  if (String(env.DRY_RUN).toLowerCase() === "false") {
    return "paper";
  }
  return "dry";
}

function readCaps(env: NodeJS.ProcessEnv): { valid: true; caps: MicroLiveCaps } | { valid: false; error: string } {
  try {
    const caps: MicroLiveCaps = {
      requireArm: parseBool(env.MICRO_LIVE_REQUIRE_ARM, DEFAULT_CAPS.requireArm),
      maxNotionalPerTrade: parseNumber(env.MICRO_LIVE_MAX_NOTIONAL, DEFAULT_CAPS.maxNotionalPerTrade, 0.000001),
      maxTradesPerWindow: parseIntStrict(env.MICRO_LIVE_MAX_TRADES_PER_WINDOW, DEFAULT_CAPS.maxTradesPerWindow, 1),
      windowMs: parseIntStrict(env.MICRO_LIVE_WINDOW_MS, DEFAULT_CAPS.windowMs, 1000),
      cooldownMs: parseIntStrict(env.MICRO_LIVE_COOLDOWN_MS, DEFAULT_CAPS.cooldownMs, 0),
      maxInFlight: parseIntStrict(env.MICRO_LIVE_MAX_INFLIGHT, DEFAULT_CAPS.maxInFlight, 1),
      failuresToBlock: parseIntStrict(env.MICRO_LIVE_FAILURES_TO_BLOCK, DEFAULT_CAPS.failuresToBlock, 1),
      failureWindowMs: parseIntStrict(
        env.MICRO_LIVE_FAILURE_WINDOW_MS,
        DEFAULT_CAPS.failureWindowMs,
        1000
      ),
      maxDailyNotional:
        env.MICRO_LIVE_MAX_DAILY_NOTIONAL == null || env.MICRO_LIVE_MAX_DAILY_NOTIONAL === ""
          ? DEFAULT_CAPS.maxDailyNotional
          : parseNumber(env.MICRO_LIVE_MAX_DAILY_NOTIONAL, DEFAULT_CAPS.maxDailyNotional ?? 0, 0.000001),
      allowlistTokens: parseAllowlist(env.MICRO_LIVE_ALLOWLIST_TOKENS),
    };
    return { valid: true, caps };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function cleanupCounters(nowMs: number, caps: MicroLiveCaps): void {
  const dayKey = toDayKey(nowMs);
  if (state.dailyKey !== dayKey) {
    state.dailyKey = dayKey;
    state.dailyNotional = 0;
    state.recentTradeAtMs = [];
    state.recentFailureAtMs = [];
  }
  state.recentTradeAtMs = state.recentTradeAtMs.filter((timestamp) => nowMs - timestamp <= caps.windowMs);
  state.recentFailureAtMs = state.recentFailureAtMs.filter(
    (timestamp) => nowMs - timestamp <= caps.failureWindowMs
  );
}

function setReason(code: LiveControlReasonCode, detail: string | undefined, nowIso: string): void {
  state.reasonCode = code;
  state.reasonDetail = detail;
  state.lastReasonAt = nowIso;
}

function evaluatePosture(executionMode: ExecutionMode): LiveControlPosture {
  if (executionMode !== "live") {
    return "live_unavailable";
  }
  if (isKillSwitchHalted()) {
    return "live_killed";
  }
  if (state.blocked) {
    return "live_blocked";
  }
  return state.armed ? "live_armed" : "live_disarmed";
}

function refuse(
  executionMode: ExecutionMode,
  code: LiveControlReasonCode,
  stage: "preflight" | "limits",
  detail: string,
  operatorActionRequired: boolean
): LiveControlDecision {
  const at = new Date().toISOString();
  state.lastGuardrailRefusal = {
    code,
    stage,
    at,
    detail,
    operatorActionRequired,
  };
  setReason(code, detail, at);
  return {
    allowed: false,
    refusal: {
      code,
      stage,
      detail,
      at,
      operatorActionRequired,
      posture: evaluatePosture(executionMode),
    },
  };
}

function parseIntentNotional(intent: TradeIntent): number | null {
  const parsed = Number.parseFloat(intent.amountIn);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function getMicroLiveControlSnapshot(): MicroLiveControlSnapshot {
  const executionMode = readExecutionMode(process.env);
  const liveEnabled = executionMode === "live";
  const killSwitch = getKillSwitchState();
  const capsConfig = readCaps(process.env);
  const caps = capsConfig.valid ? capsConfig.caps : DEFAULT_CAPS;
  const now = Date.now();
  cleanupCounters(now, caps);

  return {
    posture: evaluatePosture(executionMode),
    executionMode,
    liveEnabled,
    armed: state.armed,
    killSwitchActive: killSwitch.halted,
    blocked: state.blocked,
    degraded: state.degraded,
    manualRearmRequired: state.manualRearmRequired,
    reasonCode: state.reasonCode,
    reasonDetail: state.reasonDetail,
    lastReasonAt: state.lastReasonAt,
    lastOperatorAction: state.lastOperatorAction,
    lastOperatorActionAt: state.lastOperatorActionAt,
    lastGuardrailRefusal: state.lastGuardrailRefusal,
    caps,
    counters: {
      inFlight: state.inFlight,
      tradesInWindow: state.recentTradeAtMs.length,
      failuresInWindow: state.recentFailureAtMs.length,
      dailyNotional: state.dailyNotional,
      lastExecutionAt: state.lastExecutionAtMs ? new Date(state.lastExecutionAtMs).toISOString() : undefined,
    },
  };
}

export function armMicroLive(actor = "operator_api"): { success: boolean; message: string; snapshot: MicroLiveControlSnapshot } {
  const executionMode = readExecutionMode(process.env);
  const nowIso = new Date().toISOString();

  if (executionMode !== "live") {
    return {
      success: false,
      message: "Arm denied: deployment is not in live mode.",
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  const capsConfig = readCaps(process.env);
  if (!capsConfig.valid) {
    state.blocked = true;
    state.manualRearmRequired = true;
    setReason("micro_live_config_invalid", capsConfig.error, nowIso);
    return {
      success: false,
      message: `Arm denied: micro-live configuration invalid (${capsConfig.error}).`,
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  if (isKillSwitchHalted()) {
    return {
      success: false,
      message: "Arm denied: kill switch is active.",
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  state.armed = true;
  state.blocked = false;
  state.degraded = false;
  state.manualRearmRequired = false;
  state.reasonCode = undefined;
  state.reasonDetail = undefined;
  state.lastOperatorAction = "arm";
  state.lastOperatorActionAt = nowIso;
  return {
    success: true,
    message: `Micro-live armed by ${actor}.`,
    snapshot: getMicroLiveControlSnapshot(),
  };
}

export function disarmMicroLive(actor = "operator_api"): { success: boolean; message: string; snapshot: MicroLiveControlSnapshot } {
  const nowIso = new Date().toISOString();
  state.armed = false;
  state.lastOperatorAction = "disarm";
  state.lastOperatorActionAt = nowIso;
  setReason("micro_live_disarmed", `Disarmed by ${actor}`, nowIso);
  return {
    success: true,
    message: `Micro-live disarmed by ${actor}.`,
    snapshot: getMicroLiveControlSnapshot(),
  };
}

export function killMicroLive(reason = "operator_kill_switch"): { success: boolean; message: string; snapshot: MicroLiveControlSnapshot } {
  const nowIso = new Date().toISOString();
  state.armed = false;
  state.blocked = false;
  state.degraded = true;
  state.manualRearmRequired = true;
  state.lastOperatorAction = "kill";
  state.lastOperatorActionAt = nowIso;
  setReason("micro_live_killed", reason, nowIso);
  triggerKillSwitch(reason);
  return {
    success: true,
    message: "Micro-live kill switch activated.",
    snapshot: getMicroLiveControlSnapshot(),
  };
}

export function resetKilledMicroLive(actor = "operator_api"): { success: boolean; message: string; snapshot: MicroLiveControlSnapshot } {
  const nowIso = new Date().toISOString();
  state.armed = false;
  state.degraded = false;
  state.manualRearmRequired = false;
  state.lastOperatorAction = "reset_kill";
  state.lastOperatorActionAt = nowIso;
  setReason("micro_live_disarmed", `Kill state reset by ${actor}; manual re-arm required.`, nowIso);
  return {
    success: true,
    message: "Kill state cleared for micro-live control; runtime remains disarmed.",
    snapshot: getMicroLiveControlSnapshot(),
  };
}

export function evaluateMicroLiveIntent(intent: TradeIntent): LiveControlDecision {
  const executionMode = readExecutionMode(process.env);
  if (intent.executionMode !== "live") {
    return { allowed: true };
  }

  if (executionMode !== "live") {
    return refuse(
      executionMode,
      "live_not_enabled",
      "preflight",
      "Live intent rejected because deployment is not in live mode.",
      false
    );
  }

  const capsConfig = readCaps(process.env);
  if (!capsConfig.valid) {
    state.blocked = true;
    state.degraded = true;
    state.manualRearmRequired = true;
    return refuse(
      executionMode,
      "micro_live_config_invalid",
      "preflight",
      `Live intent rejected: micro-live config invalid (${capsConfig.error}).`,
      true
    );
  }
  const caps = capsConfig.caps;
  const nowMs = Date.now();
  cleanupCounters(nowMs, caps);

  if (isKillSwitchHalted()) {
    state.armed = false;
    state.manualRearmRequired = true;
    return refuse(
      executionMode,
      "micro_live_killed",
      "preflight",
      "Live intent rejected because kill switch is active.",
      true
    );
  }

  if (state.blocked) {
    return refuse(
      executionMode,
      "micro_live_blocked",
      "preflight",
      state.reasonDetail ?? "Live intent rejected because micro-live state is blocked.",
      true
    );
  }

  if (caps.requireArm && !state.armed) {
    return refuse(
      executionMode,
      "micro_live_disarmed",
      "preflight",
      "Live intent rejected because micro-live is disarmed.",
      true
    );
  }

  const intentNotional = parseIntentNotional(intent);
  if (intentNotional == null) {
    return refuse(
      executionMode,
      "micro_live_notional_invalid",
      "limits",
      `Unable to parse amountIn '${intent.amountIn}' as positive notional.`,
      false
    );
  }

  if (caps.allowlistTokens.length > 0 && !caps.allowlistTokens.includes(intent.tokenOut)) {
    return refuse(
      executionMode,
      "micro_live_allowlist_denied",
      "limits",
      `tokenOut '${intent.tokenOut}' is not allowlisted for micro-live.`,
      false
    );
  }

  if (intentNotional > caps.maxNotionalPerTrade) {
    return refuse(
      executionMode,
      "micro_live_notional_cap_exceeded",
      "limits",
      `Notional ${intentNotional} exceeds max per trade ${caps.maxNotionalPerTrade}.`,
      false
    );
  }

  if (state.recentTradeAtMs.length >= caps.maxTradesPerWindow) {
    return refuse(
      executionMode,
      "micro_live_window_cap_exceeded",
      "limits",
      `Trades in active window (${state.recentTradeAtMs.length}) exceed cap ${caps.maxTradesPerWindow}.`,
      false
    );
  }

  if (
    caps.maxDailyNotional !== undefined &&
    state.dailyNotional + intentNotional > caps.maxDailyNotional
  ) {
    return refuse(
      executionMode,
      "micro_live_daily_notional_cap_exceeded",
      "limits",
      `Daily notional ${state.dailyNotional + intentNotional} exceeds cap ${caps.maxDailyNotional}.`,
      false
    );
  }

  if (state.inFlight >= caps.maxInFlight) {
    return refuse(
      executionMode,
      "micro_live_inflight_cap_exceeded",
      "limits",
      `In-flight executions ${state.inFlight} exceed cap ${caps.maxInFlight}.`,
      false
    );
  }

  if (
    caps.cooldownMs > 0 &&
    state.lastExecutionAtMs !== undefined &&
    nowMs - state.lastExecutionAtMs < caps.cooldownMs
  ) {
    return refuse(
      executionMode,
      "micro_live_cooldown_active",
      "limits",
      `Cooldown active (${nowMs - state.lastExecutionAtMs}ms < ${caps.cooldownMs}ms).`,
      false
    );
  }

  state.inFlight += 1;
  return {
    allowed: true,
    attempt: {
      attemptId: `${intent.traceId}:${nowMs}`,
      startedAt: new Date(nowMs).toISOString(),
      notional: intentNotional,
    },
  };
}

export function finalizeMicroLiveIntent(attempt: LiveExecutionAttempt, report: { success: boolean; failureCode?: string }): void {
  const capsConfig = readCaps(process.env);
  const caps = capsConfig.valid ? capsConfig.caps : DEFAULT_CAPS;
  const nowMs = Date.now();
  cleanupCounters(nowMs, caps);

  state.inFlight = Math.max(0, state.inFlight - 1);
  if (report.success) {
    state.recentTradeAtMs.push(nowMs);
    state.dailyNotional += attempt.notional;
    state.lastExecutionAtMs = nowMs;
    return;
  }

  state.recentFailureAtMs.push(nowMs);
  const failureCount = state.recentFailureAtMs.length;
  if (failureCount >= caps.failuresToBlock) {
    state.blocked = true;
    state.degraded = true;
    state.armed = false;
    state.manualRearmRequired = true;
    setReason(
      "micro_live_failure_threshold_reached",
      `Failure threshold reached (${failureCount}/${caps.failuresToBlock}). Last failure=${report.failureCode ?? "unknown"}.`,
      new Date(nowMs).toISOString()
    );
  }
}

export function resetMicroLiveControlForTests(): void {
  state.armed = false;
  state.blocked = false;
  state.degraded = false;
  state.manualRearmRequired = false;
  state.reasonCode = undefined;
  state.reasonDetail = undefined;
  state.lastReasonAt = undefined;
  state.lastOperatorAction = undefined;
  state.lastOperatorActionAt = undefined;
  state.lastGuardrailRefusal = undefined;
  state.inFlight = 0;
  state.recentTradeAtMs = [];
  state.recentFailureAtMs = [];
  state.dailyNotional = 0;
  state.dailyKey = toDayKey(Date.now());
  state.lastExecutionAtMs = undefined;
}
