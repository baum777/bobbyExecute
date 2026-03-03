/**
 * Permission enforcement and review gate.
 * EXTRACTED from OrchestrAI_Labs packages/governance/src/policies/enforcement.ts
 */
import type { AgentProfile, Permission, ReviewPolicy } from "../core/contracts/agent.js";

export class EnforcementError extends Error {
  constructor(
    message: string,
    public readonly code: "PERMISSION_DENIED" | "REVIEW_REQUIRED"
  ) {
    super(message);
    this.name = "EnforcementError";
  }
}

export type EnforcementResult =
  | { ok: true; mode: "allow" | "draft_only"; reason?: string }
  | { ok: false; code: "PERMISSION_DENIED" | "REVIEW_REQUIRED"; reason: string };

export function hasPermission(profile: AgentProfile, perm: Permission): boolean {
  return profile.permissions.includes(perm);
}

export function enforcePermission(
  profile: AgentProfile,
  perm: Permission
): void {
  if (!hasPermission(profile, perm)) {
    throw new EnforcementError(`Permission denied: ${perm}`, "PERMISSION_DENIED");
  }
}

export function enforceReviewGate(
  profile: AgentProfile,
  intendedPermission: Permission
): EnforcementResult {
  const rp: ReviewPolicy = profile.reviewPolicy;

  if (rp.mode === "none") return { ok: true, mode: "allow" };
  if (rp.mode === "draft_only") return { ok: true, mode: "draft_only" };

  if (
    rp.mode === "required" &&
    rp.requiresHumanFor.includes(intendedPermission)
  ) {
    return {
      ok: false,
      code: "REVIEW_REQUIRED",
      reason: `Human review required for: ${intendedPermission}`,
    };
  }

  return { ok: true, mode: "allow" };
}
