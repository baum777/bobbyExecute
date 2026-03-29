import type { Config } from "../config/config-schema.js";
import type { RuntimeController } from "./controller.js";
import { createExecutionHandler } from "../agents/execution.agent.js";
import { createLiveRuntime, type LiveRuntimeDeps } from "./live-runtime.js";
import { createPaperRuntime, type PaperRuntimeDeps } from "./paper-runtime.js";
import { assertLiveTradingPrerequisites, parseRolloutPostureConfig } from "../config/safety.js";
import { createCanonicalDecisionAuthority } from "../core/decision/index.js";

export type RuntimeDeps = PaperRuntimeDeps & LiveRuntimeDeps;

export function assertLiveEligibility(config: Config, runtimeDeps: RuntimeDeps = {}): void {
  if (config.executionMode !== "live") {
    return;
  }

  assertLiveTradingPrerequisites(config);

  if (config.runtimePolicyAuthority !== "ts-env") {
    throw new Error("LIVE_BOOT_ABORTED_RUNTIME_POLICY_AMBIGUOUS");
  }

  const rolloutPosture = parseRolloutPostureConfig();
  if (rolloutPosture === "paper_only" || rolloutPosture === "paused_or_rolled_back") {
    throw new Error(`rollout posture '${process.env.ROLLOUT_POSTURE?.trim() ?? rolloutPosture}' does not permit live deployment`);
  }

  const executionHandlerFactory = runtimeDeps.executionHandlerFactory ?? createExecutionHandler;
  if (executionHandlerFactory === createExecutionHandler) {
    if (!runtimeDeps.signTransaction) {
      throw new Error("LIVE_BOOT_ABORTED_EXECUTION_SIGNER_UNAVAILABLE");
    }
  }

  for (const [name, repo] of [
    ["kill-switch", runtimeDeps.killSwitchRepository],
    ["live-control", runtimeDeps.liveControlRepository],
    ["daily-loss", runtimeDeps.dailyLossRepository],
    ["idempotency", runtimeDeps.idempotencyRepository],
  ] as const) {
    if (repo && repo.kind !== "file") {
      throw new Error(`LIVE_BOOT_ABORTED_IN_MEMORY_SAFETY_REPOSITORY:${name}`);
    }
  }
}

export async function createRuntime(config: Config, runtimeDeps: RuntimeDeps = {}): Promise<RuntimeController> {
  const decisionCoordinator = runtimeDeps.decisionCoordinator ?? createCanonicalDecisionAuthority();
  const normalizedDeps = {
    ...runtimeDeps,
    decisionCoordinator,
  };

  if (config.executionMode === "live") {
    assertLiveEligibility(config, normalizedDeps);
    return createLiveRuntime(config, normalizedDeps);
  }

  return createPaperRuntime(config, normalizedDeps);
}
