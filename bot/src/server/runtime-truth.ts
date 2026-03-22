import type { RuntimeSnapshot } from "../runtime/dry-run-runtime.js";

export function buildRuntimeReadiness(runtime?: RuntimeSnapshot): {
  posture: "healthy_for_posture" | "degraded_but_safe_in_paper" | "blocked_for_live" | "manual_review_required";
  liveAllowed: boolean;
  paperSafe: boolean;
  liveTestMode: boolean;
  rolloutPosture: "paper_only" | "micro_live" | "staged_live_candidate" | "paused_or_rolled_back";
  rolloutConfigured: boolean;
  rolloutConfigValid: boolean;
  roundStatus: "idle" | "preflighted" | "running" | "stopped" | "completed" | "failed";
  roundStartedAt?: string;
  roundStoppedAt?: string;
  roundCompletedAt?: string;
  stopReason?: string;
  failureReason?: string;
  blocked: boolean;
  disarmed: boolean;
  stopped: boolean;
  lastTransitionAt?: string;
  canArmMicroLive: boolean;
  canUseStagedLiveCandidate: boolean;
  blockers: Array<{
    code: string;
    scope: "startup" | "paper" | "micro_live" | "staged_live_candidate";
    message: string;
  }>;
  reason?: string;
} | undefined {
  const liveControl = runtime?.liveControl;
  if (!runtime || !liveControl) {
    return undefined;
  }

  const paperSafe = runtime.mode !== "live" || runtime.paperModeActive === true;
  const liveAllowed =
    liveControl.posture === "live_armed" &&
    liveControl.blocked !== true &&
    liveControl.killSwitchActive !== true &&
    liveControl.rolloutConfigValid !== false;
  const reason = liveControl.rolloutReasonDetail ?? liveControl.reasonDetail ?? liveControl.lastGuardrailRefusal?.detail;
  const blockers: Array<{
    code: string;
    scope: "startup" | "paper" | "micro_live" | "staged_live_candidate";
    message: string;
  }> = [];

  if (runtime.status === "error") {
    blockers.push({
      code: "runtime_error",
      scope: "startup",
      message: "Runtime requires manual review before deployment can proceed.",
    });
  }

  if (liveControl.rolloutConfigValid === false) {
    blockers.push({
      code: liveControl.rolloutReasonCode ?? "rollout_config_invalid",
      scope: "startup",
      message: liveControl.rolloutReasonDetail ?? "Rollout posture configuration is invalid.",
    });
  }

  if (liveControl.rolloutPosture === "paper_only") {
    blockers.push({
      code: "rollout_paper_only",
      scope: "micro_live",
      message: "Micro-live is not allowed while rollout posture is paper_only.",
    });
  }

  if (liveControl.rolloutPosture === "staged_live_candidate" && runtime.degradedState?.active === true) {
    blockers.push({
      code: "staged_candidate_degraded",
      scope: "staged_live_candidate",
      message: "Staged-live candidate requires a non-degraded runtime.",
    });
  }

  if (liveControl.rolloutPosture === "paused_or_rolled_back" || liveControl.blocked || liveControl.killSwitchActive) {
    blockers.push({
      code: liveControl.killSwitchActive ? "kill_switch_active" : liveControl.blocked ? "live_control_blocked" : "rollout_paused_or_rolled_back",
      scope: "micro_live",
      message: liveControl.killSwitchActive
        ? "Live is blocked because the kill switch is active."
        : liveControl.blocked
          ? "Live is blocked by control posture."
          : "Live is blocked by rollout posture.",
    });
  }

  if (liveControl.roundStatus === "stopped" || liveControl.roundStatus === "completed" || liveControl.roundStatus === "failed") {
    blockers.push({
      code: `live_round_${liveControl.roundStatus}`,
      scope: "micro_live",
      message:
        liveControl.roundStatus === "failed"
          ? "Live-test round failed and requires reset before resuming."
          : "Live-test round is terminal and requires reset before resuming.",
    });
  }

  if (runtime.adapterHealth?.degraded === true) {
    blockers.push({
      code: "adapter_degraded",
      scope: "micro_live",
      message: "Live is not eligible while adapter health is degraded.",
    });
  }

  const canArmMicroLive =
    liveControl.liveEnabled === true &&
    liveControl.rolloutConfigValid !== false &&
    liveControl.rolloutPosture !== "paper_only" &&
    liveControl.rolloutPosture !== "paused_or_rolled_back" &&
    liveControl.killSwitchActive !== true &&
    liveControl.blocked !== true &&
    liveControl.roundStatus !== "failed" &&
    liveControl.roundStatus !== "stopped" &&
    liveControl.roundStatus !== "completed" &&
    runtime.status !== "error" &&
    runtime.adapterHealth?.degraded !== true;

  const canUseStagedLiveCandidate =
    liveControl.liveEnabled === true &&
    liveControl.rolloutConfigValid !== false &&
    liveControl.rolloutPosture === "staged_live_candidate" &&
    liveControl.killSwitchActive !== true &&
    liveControl.blocked !== true &&
    runtime.status !== "error" &&
    runtime.adapterHealth?.degraded !== true &&
    runtime.degradedState?.active !== true;

  if (runtime.status === "error" || liveControl.rolloutConfigValid === false) {
    return {
      posture: "manual_review_required",
      liveAllowed: false,
      paperSafe,
      liveTestMode: liveControl.liveTestMode,
      rolloutPosture: liveControl.rolloutPosture,
      rolloutConfigured: liveControl.rolloutConfigured,
      rolloutConfigValid: liveControl.rolloutConfigValid,
      roundStatus: liveControl.roundStatus,
      roundStartedAt: liveControl.roundStartedAt,
      roundStoppedAt: liveControl.roundStoppedAt,
      roundCompletedAt: liveControl.roundCompletedAt,
      stopReason: liveControl.stopReason,
      failureReason: liveControl.failureReason,
      blocked: liveControl.blocked,
      disarmed: liveControl.disarmed,
      stopped: liveControl.stopped,
      lastTransitionAt: liveControl.lastTransitionAt,
      canArmMicroLive,
      canUseStagedLiveCandidate,
      blockers,
      reason: reason ?? "Runtime requires manual review.",
    };
  }

  if (
    liveControl.rolloutPosture === "paper_only" ||
    liveControl.rolloutPosture === "paused_or_rolled_back" ||
    liveControl.posture === "live_blocked"
  ) {
    return {
      posture: "blocked_for_live",
      liveAllowed: false,
      paperSafe,
      liveTestMode: liveControl.liveTestMode,
      rolloutPosture: liveControl.rolloutPosture,
      rolloutConfigured: liveControl.rolloutConfigured,
      rolloutConfigValid: liveControl.rolloutConfigValid,
      roundStatus: liveControl.roundStatus,
      roundStartedAt: liveControl.roundStartedAt,
      roundStoppedAt: liveControl.roundStoppedAt,
      roundCompletedAt: liveControl.roundCompletedAt,
      stopReason: liveControl.stopReason,
      failureReason: liveControl.failureReason,
      blocked: liveControl.blocked,
      disarmed: liveControl.disarmed,
      stopped: liveControl.stopped,
      lastTransitionAt: liveControl.lastTransitionAt,
      canArmMicroLive,
      canUseStagedLiveCandidate,
      blockers,
      reason: reason ?? "Live operation is currently blocked by rollout or control posture.",
    };
  }

  if (runtime.degradedState?.active === true || runtime.adapterHealth?.degraded === true || liveControl.blocked) {
    return {
      posture: "degraded_but_safe_in_paper",
      liveAllowed,
      paperSafe,
      liveTestMode: liveControl.liveTestMode,
      rolloutPosture: liveControl.rolloutPosture,
      rolloutConfigured: liveControl.rolloutConfigured,
      rolloutConfigValid: liveControl.rolloutConfigValid,
      roundStatus: liveControl.roundStatus,
      roundStartedAt: liveControl.roundStartedAt,
      roundStoppedAt: liveControl.roundStoppedAt,
      roundCompletedAt: liveControl.roundCompletedAt,
      stopReason: liveControl.stopReason,
      failureReason: liveControl.failureReason,
      blocked: liveControl.blocked,
      disarmed: liveControl.disarmed,
      stopped: liveControl.stopped,
      lastTransitionAt: liveControl.lastTransitionAt,
      canArmMicroLive,
      canUseStagedLiveCandidate,
      blockers,
      reason: reason ?? "Runtime is degraded but remains reviewable for paper mode.",
    };
  }

  return {
    posture: "healthy_for_posture",
    liveAllowed,
    paperSafe,
    liveTestMode: liveControl.liveTestMode,
    rolloutPosture: liveControl.rolloutPosture,
    rolloutConfigured: liveControl.rolloutConfigured,
    rolloutConfigValid: liveControl.rolloutConfigValid,
    roundStatus: liveControl.roundStatus,
    roundStartedAt: liveControl.roundStartedAt,
    roundStoppedAt: liveControl.roundStoppedAt,
    roundCompletedAt: liveControl.roundCompletedAt,
    stopReason: liveControl.stopReason,
    failureReason: liveControl.failureReason,
    blocked: liveControl.blocked,
    disarmed: liveControl.disarmed,
    stopped: liveControl.stopped,
    lastTransitionAt: liveControl.lastTransitionAt,
    canArmMicroLive,
    canUseStagedLiveCandidate,
    blockers,
    reason,
  };
}

export function buildRuntimeHistory(runtime?: RuntimeSnapshot) {
  return runtime?.recentHistory;
}
