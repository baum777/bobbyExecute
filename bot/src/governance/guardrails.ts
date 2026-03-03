/**
 * Guardrails for trade execution.
 * EXTRACTED from OrchestrAI_Labs packages/skills/src/guardrails/skill-guardrails.ts
 * MAPPED for onchain trading - strategies with side effects require review.
 */
import type { AgentProfile, Permission } from "../core/contracts/agent.js";

export interface GuardrailCheckResult {
  allowed: boolean;
  reason?: string;
  blockReason?: string;
}

export interface TradeGuardrailContext {
  hasSideEffects: boolean;
  reviewPolicyMode: "none" | "draft_only" | "required";
  requiredPermissions: string[];
}

export function checkFeatureEnabled(enabled: boolean): GuardrailCheckResult {
  if (!enabled) {
    return {
      allowed: false,
      reason: "feature_disabled",
      blockReason: "Trading execution is disabled (DRY_RUN or feature flag)",
    };
  }
  return { allowed: true };
}

export function checkPermissions(
  profile: AgentProfile,
  required: string[]
): GuardrailCheckResult {
  const missing = required.filter(
    (p) => !profile.permissions.includes(p as Permission)
  );
  if (missing.length > 0) {
    return {
      allowed: false,
      reason: "permission_denied",
      blockReason: `Missing required permissions: ${missing.join(", ")}`,
    };
  }
  return { allowed: true };
}

export function checkSideEffectsReviewGate(
  hasSideEffects: boolean,
  reviewPolicyMode: "none" | "draft_only" | "required"
): GuardrailCheckResult {
  if (hasSideEffects && reviewPolicyMode === "none") {
    return {
      allowed: false,
      reason: "review_required_for_side_effects",
      blockReason:
        "Trade execution with real swaps must have reviewPolicy.mode !== none",
    };
  }
  return { allowed: true };
}

/**
 * Runs all guardrail checks before trade execution.
 */
export function runTradeGuardrails(
  profile: AgentProfile,
  ctx: TradeGuardrailContext
): GuardrailCheckResult {
  const sideEffectsCheck = checkSideEffectsReviewGate(
    ctx.hasSideEffects,
    ctx.reviewPolicyMode
  );
  if (!sideEffectsCheck.allowed) return sideEffectsCheck;

  const permCheck = checkPermissions(profile, ctx.requiredPermissions);
  if (!permCheck.allowed) return permCheck;

  return { allowed: true };
}
