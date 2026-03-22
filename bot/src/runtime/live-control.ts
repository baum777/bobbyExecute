import type { TradeIntent } from "../core/contracts/trade.js";
import { getKillSwitchState, isKillSwitchHalted, triggerKillSwitch } from "../governance/kill-switch.js";
import { getDailyLossState } from "../governance/daily-loss-tracker.js";

export type LiveControlPosture =
  | "live_unavailable"
  | "live_disarmed"
  | "live_armed"
  | "live_blocked"
  | "live_killed";

export type LiveTestRoundStatus = "idle" | "preflighted" | "running" | "stopped" | "completed" | "failed";

export type RolloutPosture =
  | "paper_only"
  | "micro_live"
  | "staged_live_candidate"
  | "paused_or_rolled_back";

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

export interface RolloutSnapshot {
  posture: RolloutPosture;
  configured: boolean;
  valid: boolean;
  reasonCode?: LiveControlReasonCode;
  reasonDetail?: string;
  lastReasonAt?: string;
}

export interface MicroLiveControlSnapshot {
  mode: ExecutionMode;
  liveTestMode: boolean;
  roundStatus: LiveTestRoundStatus;
  roundStartedAt?: string;
  roundStoppedAt?: string;
  roundCompletedAt?: string;
  stopReason?: string;
  failureReason?: string;
  lastTransitionAt?: string;
  lastTransitionBy?: string;
  posture: LiveControlPosture;
  rolloutPosture: RolloutPosture;
  rolloutConfigured: boolean;
  rolloutConfigValid: boolean;
  rolloutReasonCode?: LiveControlReasonCode;
  rolloutReasonDetail?: string;
  rolloutLastReasonAt?: string;
  executionMode: "dry" | "paper" | "live";
  liveEnabled: boolean;
  armed: boolean;
  killSwitchActive: boolean;
  blocked: boolean;
  disarmed: boolean;
  stopped: boolean;
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
    tradesToday: number;
    dailyLossUsd: number;
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
  roundStatus: LiveTestRoundStatus;
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

const DEFAULT_ROLLOUT_POSTURE: RolloutPosture = "micro_live";

const state: MutableControlState = {
  armed: false,
  blocked: false,
  degraded: false,
  manualRearmRequired: false,
  roundStatus: "idle",
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

function isLiveTestModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.LIVE_TEST_MODE).toLowerCase() === "true";
}

function isTerminalRoundStatus(status: LiveTestRoundStatus): boolean {
  return status === "stopped" || status === "completed" || status === "failed";
}

function clearRoundTerminalFields(): void {
  state.roundStartedAt = undefined;
  state.roundStoppedAt = undefined;
  state.roundCompletedAt = undefined;
  state.stopReason = undefined;
  state.failureReason = undefined;
}

function markRoundTransition(
  nextStatus: LiveTestRoundStatus,
  actor: string,
  nowIso: string,
  detail?: string
): void {
  state.roundStatus = nextStatus;
  state.lastTransitionAt = nowIso;
  state.lastTransitionBy = actor;
  if (nextStatus === "preflighted") {
    clearRoundTerminalFields();
    state.blocked = false;
    state.degraded = false;
    state.manualRearmRequired = false;
    state.armed = false;
    setReason("micro_live_disarmed", detail ?? "Live-test round preflighted.", nowIso);
    return;
  }

  if (nextStatus === "running") {
    state.roundStartedAt = state.roundStartedAt ?? nowIso;
    state.blocked = false;
    state.degraded = false;
    state.manualRearmRequired = false;
    state.reasonCode = undefined;
    state.reasonDetail = undefined;
    state.lastReasonAt = undefined;
    return;
  }

  if (nextStatus === "stopped") {
    state.roundStoppedAt = nowIso;
    state.stopReason = detail;
    state.armed = false;
    state.blocked = true;
    state.manualRearmRequired = true;
    state.degraded = true;
    setReason("micro_live_killed", detail ?? "Live-test round stopped.", nowIso);
    return;
  }

  if (nextStatus === "completed") {
    state.roundCompletedAt = nowIso;
    state.stopReason = detail;
    state.armed = false;
    state.blocked = true;
    state.manualRearmRequired = false;
    state.degraded = false;
    setReason("micro_live_disarmed", detail ?? "Live-test round completed.", nowIso);
    return;
  }

  state.failureReason = detail;
  state.roundStoppedAt = undefined;
  state.roundCompletedAt = undefined;
  state.armed = false;
  state.blocked = true;
  state.degraded = true;
  state.manualRearmRequired = true;
  setReason("micro_live_config_invalid", detail ?? "Live-test round failed.", nowIso);
}

function refuseRoundTransition(
  nextStatus: LiveTestRoundStatus,
  actor: string,
  detail: string
): { success: false; message: string; snapshot: MicroLiveControlSnapshot } {
  const nowIso = new Date().toISOString();
  markRoundTransition("failed", actor, nowIso, detail);
  return {
    success: false,
    message: `Live-test round transition to '${nextStatus}' denied: ${detail}`,
    snapshot: getMicroLiveControlSnapshot(),
  };
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

function readRolloutPosture(
  executionMode: ExecutionMode
): RolloutSnapshot {
  const raw = process.env.ROLLOUT_POSTURE?.trim();
  const configured = raw != null && raw.length > 0;

  if (!configured) {
    return {
      posture: executionMode === "live" ? DEFAULT_ROLLOUT_POSTURE : "paper_only",
      configured: false,
      valid: true,
    };
  }

  const normalized = raw.toLowerCase();
  if (
    normalized === "paper_only" ||
    normalized === "micro_live" ||
    normalized === "staged_live_candidate" ||
    normalized === "paused_or_rolled_back"
  ) {
    return {
      posture: normalized as RolloutPosture,
      configured: true,
      valid: true,
    };
  }

  return {
    posture: "paused_or_rolled_back",
    configured: true,
    valid: false,
    reasonCode: "micro_live_config_invalid",
    reasonDetail: `Invalid rollout posture '${raw}'. Expected paper_only, micro_live, staged_live_candidate, or paused_or_rolled_back.`,
    lastReasonAt: new Date().toISOString(),
  };
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

function evaluatePosture(executionMode: ExecutionMode, rollout: RolloutSnapshot): LiveControlPosture {
  if (executionMode !== "live") {
    return "live_unavailable";
  }
  if (!rollout.valid) {
    return "live_blocked";
  }
  if (rollout.posture === "paper_only" || rollout.posture === "paused_or_rolled_back") {
    return "live_blocked";
  }
  if (isKillSwitchHalted()) {
    return "live_killed";
  }
  if (state.blocked || isTerminalRoundStatus(state.roundStatus)) {
    return "live_blocked";
  }
  if (
    rollout.posture === "staged_live_candidate" &&
    (!state.armed || state.degraded || state.manualRearmRequired)
  ) {
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
  const rollout = readRolloutPosture(executionMode);
  return {
    allowed: false,
    refusal: {
      code,
      stage,
      detail,
      at,
      operatorActionRequired,
      posture: evaluatePosture(executionMode, rollout),
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
  const liveTestMode = isLiveTestModeEnabled();
  const killSwitch = getKillSwitchState();
  const capsConfig = readCaps(process.env);
  const caps = capsConfig.valid ? capsConfig.caps : DEFAULT_CAPS;
  const rollout = readRolloutPosture(executionMode);
  const now = Date.now();
  cleanupCounters(now, caps);
  const dailyLossState = getDailyLossState();

  return {
    mode: executionMode,
    liveTestMode,
    roundStatus: state.roundStatus,
    roundStartedAt: state.roundStartedAt,
    roundStoppedAt: state.roundStoppedAt,
    roundCompletedAt: state.roundCompletedAt,
    stopReason: state.stopReason,
    failureReason: state.failureReason,
    lastTransitionAt: state.lastTransitionAt,
    lastTransitionBy: state.lastTransitionBy,
    posture: evaluatePosture(executionMode, rollout),
    rolloutPosture: rollout.posture,
    rolloutConfigured: rollout.configured,
    rolloutConfigValid: rollout.valid,
    rolloutReasonCode: rollout.reasonCode,
    rolloutReasonDetail: rollout.reasonDetail,
    rolloutLastReasonAt: rollout.lastReasonAt,
    executionMode,
    liveEnabled,
    armed: state.armed,
    killSwitchActive: killSwitch.halted,
    blocked: state.blocked || isTerminalRoundStatus(state.roundStatus),
    disarmed: !state.armed,
    stopped: state.roundStatus === "stopped" || state.roundStatus === "completed" || state.roundStatus === "failed",
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
      tradesToday: state.recentTradeAtMs.length,
      dailyLossUsd: dailyLossState.lossUsd,
      lastExecutionAt: state.lastExecutionAtMs ? new Date(state.lastExecutionAtMs).toISOString() : undefined,
    },
  };
}

export function armMicroLive(actor = "operator_api"): { success: boolean; message: string; snapshot: MicroLiveControlSnapshot } {
  const executionMode = readExecutionMode(process.env);
  const nowIso = new Date().toISOString();
  const rollout = readRolloutPosture(executionMode);

  if (executionMode !== "live") {
    return {
      success: false,
      message: "Arm denied: deployment is not in live mode.",
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  if (isLiveTestModeEnabled() && isTerminalRoundStatus(state.roundStatus)) {
    markRoundTransition("failed", actor, nowIso, `Arm denied: live-test round is ${state.roundStatus}. Reset is required first.`);
    return {
      success: false,
      message: `Arm denied: live-test round is ${state.roundStatus}. Reset is required first.`,
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  if (!rollout.valid || rollout.posture === "paper_only" || rollout.posture === "paused_or_rolled_back") {
    state.blocked = true;
    state.manualRearmRequired = true;
    setReason(
      rollout.reasonCode ?? "micro_live_blocked",
      rollout.reasonDetail ?? `Arm denied: rollout posture '${rollout.posture}' does not permit live operation.`,
      nowIso
    );
    return {
      success: false,
      message: `Arm denied: rollout posture '${rollout.posture}' does not permit live operation.`,
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
  markRoundTransition("stopped", "operator_kill_switch", nowIso, reason);
  state.lastOperatorAction = "kill";
  state.lastOperatorActionAt = nowIso;
  state.degraded = true;
  triggerKillSwitch(reason);
  return {
    success: true,
    message: "Micro-live kill switch activated.",
    snapshot: getMicroLiveControlSnapshot(),
  };
}

export function resetKilledMicroLive(actor = "operator_api"): { success: boolean; message: string; snapshot: MicroLiveControlSnapshot } {
  const nowIso = new Date().toISOString();
  if (isLiveTestModeEnabled() && !isTerminalRoundStatus(state.roundStatus) && state.roundStatus !== "idle") {
    return refuseRoundTransition(
      "preflighted",
      actor,
      `Reset denied while live-test round status is ${state.roundStatus}. Stop or fail the round before resetting.`
    );
  }

  state.armed = false;
  state.degraded = false;
  state.manualRearmRequired = false;
  state.lastOperatorAction = "reset_kill";
  state.lastOperatorActionAt = nowIso;
  if (isLiveTestModeEnabled()) {
    markRoundTransition("preflighted", actor, nowIso, `Kill state reset by ${actor}; live-test round returned to preflighted.`);
  }
  setReason("micro_live_disarmed", `Kill state reset by ${actor}; manual re-arm required.`, nowIso);
  return {
    success: true,
    message: "Kill state cleared for micro-live control; runtime remains disarmed.",
    snapshot: getMicroLiveControlSnapshot(),
  };
}

export function preflightLiveTestRound(actor = "bootstrap"): { success: boolean; message: string; snapshot: MicroLiveControlSnapshot } {
  const nowIso = new Date().toISOString();
  if (!isLiveTestModeEnabled()) {
    return {
      success: true,
      message: "Live-test mode is disabled; preflight is a no-op.",
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  if (state.roundStatus === "running") {
    return refuseRoundTransition("preflighted", actor, "Preflight denied while live-test round is already running.");
  }

  if (state.roundStatus === "preflighted") {
    return {
      success: true,
      message: "Live-test round already preflighted.",
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  markRoundTransition("preflighted", actor, nowIso, "Live-test round preflighted.");
  return {
    success: true,
    message: "Live-test round preflighted.",
    snapshot: getMicroLiveControlSnapshot(),
  };
}

export function startLiveTestRound(actor = "runtime_start"): { success: boolean; message: string; snapshot: MicroLiveControlSnapshot } {
  const nowIso = new Date().toISOString();
  if (!isLiveTestModeEnabled()) {
    return {
      success: true,
      message: "Live-test mode is disabled; start is a no-op.",
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  if (isTerminalRoundStatus(state.roundStatus)) {
    return refuseRoundTransition("running", actor, `Start denied while live-test round is ${state.roundStatus}. Reset is required first.`);
  }

  if (state.roundStatus === "idle") {
    markRoundTransition("preflighted", actor, nowIso, "Live-test round auto-preflighted for startup.");
  }

  if (state.roundStatus === "running") {
    return {
      success: true,
      message: "Live-test round already running.",
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  if (state.roundStatus !== "preflighted") {
    return refuseRoundTransition("running", actor, `Start denied while live-test round is ${state.roundStatus}.`);
  }

  markRoundTransition("running", actor, nowIso, "Live-test round started.");
  return {
    success: true,
    message: "Live-test round started.",
    snapshot: getMicroLiveControlSnapshot(),
  };
}

export function stopLiveTestRound(
  reason = "operator_emergency_stop",
  actor = "operator_api"
): { success: boolean; message: string; snapshot: MicroLiveControlSnapshot } {
  const nowIso = new Date().toISOString();
  if (!isLiveTestModeEnabled()) {
    return {
      success: true,
      message: "Live-test mode is disabled; stop is a no-op.",
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  if (state.roundStatus === "stopped") {
    return {
      success: true,
      message: "Live-test round already stopped.",
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  if (state.roundStatus === "completed" || state.roundStatus === "failed") {
    return refuseRoundTransition("stopped", actor, `Stop denied while live-test round is ${state.roundStatus}. Reset is required first.`);
  }

  markRoundTransition("stopped", actor, nowIso, reason);
  state.armed = false;
  state.lastOperatorAction = "kill";
  state.lastOperatorActionAt = nowIso;
  setReason("micro_live_killed", reason, nowIso);
  return {
    success: true,
    message: "Live-test round stopped.",
    snapshot: getMicroLiveControlSnapshot(),
  };
}

export function completeLiveTestRound(
  reason = "runtime_stop",
  actor = "runtime_stop"
): { success: boolean; message: string; snapshot: MicroLiveControlSnapshot } {
  const nowIso = new Date().toISOString();
  if (!isLiveTestModeEnabled()) {
    return {
      success: true,
      message: "Live-test mode is disabled; completion is a no-op.",
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  if (state.roundStatus === "completed") {
    return {
      success: true,
      message: "Live-test round already completed.",
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  if (state.roundStatus === "failed") {
    return refuseRoundTransition("completed", actor, "Completion denied while live-test round is failed. Reset is required first.");
  }

  markRoundTransition("completed", actor, nowIso, reason);
  return {
    success: true,
    message: "Live-test round completed.",
    snapshot: getMicroLiveControlSnapshot(),
  };
}

export function resetLiveTestRound(actor = "operator_api"): { success: boolean; message: string; snapshot: MicroLiveControlSnapshot } {
  const nowIso = new Date().toISOString();
  if (!isLiveTestModeEnabled()) {
    return {
      success: true,
      message: "Live-test mode is disabled; reset is a no-op.",
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  if (state.roundStatus === "running") {
    return refuseRoundTransition("preflighted", actor, "Reset denied while live-test round is running.");
  }

  if (state.roundStatus === "preflighted" || state.roundStatus === "idle") {
    return {
      success: true,
      message: "Live-test round already safe to start.",
      snapshot: getMicroLiveControlSnapshot(),
    };
  }

  markRoundTransition("preflighted", actor, nowIso, `Live-test round reset by ${actor}.`);
  state.reasonCode = undefined;
  state.reasonDetail = undefined;
  state.lastReasonAt = undefined;
  return {
    success: true,
    message: "Live-test round reset to preflighted.",
    snapshot: getMicroLiveControlSnapshot(),
  };
}

export function evaluateMicroLiveIntent(intent: TradeIntent): LiveControlDecision {
  const executionMode = readExecutionMode(process.env);
  if (intent.executionMode !== "live") {
    return { allowed: true };
  }

  const rollout = readRolloutPosture(executionMode);
  if (executionMode !== "live") {
    return refuse(
      executionMode,
      "live_not_enabled",
      "preflight",
      "Live intent rejected because deployment is not in live mode.",
      false
    );
  }

  if (!rollout.valid) {
    state.blocked = true;
    state.degraded = true;
    state.manualRearmRequired = true;
    return refuse(
      executionMode,
      rollout.reasonCode ?? "micro_live_config_invalid",
      "preflight",
      rollout.reasonDetail ?? "Live intent rejected because rollout posture configuration is invalid.",
      true
    );
  }

  if (rollout.posture === "paper_only") {
    return refuse(
      executionMode,
      "micro_live_blocked",
      "preflight",
      "Live intent rejected because rollout posture is paper_only.",
      true
    );
  }

  if (rollout.posture === "paused_or_rolled_back") {
    return refuse(
      executionMode,
      "micro_live_blocked",
      "preflight",
      "Live intent rejected because rollout posture is paused_or_rolled_back.",
      true
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

  if (rollout.posture === "staged_live_candidate" && (!state.armed || state.degraded || state.manualRearmRequired)) {
    return refuse(
      executionMode,
      "micro_live_blocked",
      "preflight",
      "Live intent rejected because staged_live_candidate posture is not ready for live operation.",
      true
    );
  }

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

  if (isLiveTestModeEnabled() && state.roundStatus !== "running") {
    return refuse(
      executionMode,
      "micro_live_blocked",
      "preflight",
      `Live intent rejected because live-test round is ${state.roundStatus}; running state is required.`,
      true
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
  state.roundStatus = "idle";
  state.roundStartedAt = undefined;
  state.roundStoppedAt = undefined;
  state.roundCompletedAt = undefined;
  state.stopReason = undefined;
  state.failureReason = undefined;
  state.lastTransitionAt = undefined;
  state.lastTransitionBy = undefined;
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
