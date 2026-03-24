/**
 * Wave 6 P0: Kill switch - emergency halt. Manual reset required.
 */
import type { KillSwitchRepository } from "../persistence/kill-switch-repository.js";

export interface KillSwitchState {
  halted: boolean;
  reason?: string;
  triggeredAt?: string;
}

let state: KillSwitchState = { halted: false };
let repository: KillSwitchRepository | undefined;

export function configureKillSwitchRepository(nextRepository?: KillSwitchRepository): void {
  repository = nextRepository;
}

export async function loadKillSwitchState(nextRepository?: KillSwitchRepository): Promise<KillSwitchState> {
  const repo = nextRepository ?? repository;
  if (!repo) {
    return getKillSwitchState();
  }

  const loaded = repo.loadSync();
  if (loaded) {
    state = { ...loaded };
  }
  return getKillSwitchState();
}

export function hydrateKillSwitchState(nextState: KillSwitchState): void {
  state = { ...nextState };
  persistKillSwitchState();
}

function persistKillSwitchState(): void {
  if (!repository) {
    return;
  }

  const snapshot = getKillSwitchState();
  if (typeof repository.saveSync === "function") {
    repository.saveSync(snapshot);
    return;
  }

  void repository.save(snapshot);
}

/**
 * Trigger emergency stop. Halt all trading. Requires manual reset.
 */
export function triggerKillSwitch(reason?: string): void {
  state = {
    halted: true,
    reason: reason ?? "emergency-stop",
    triggeredAt: new Date().toISOString(),
  };
  persistKillSwitchState();
}

/**
 * Reset kill switch. Must be called explicitly by operator.
 */
export function resetKillSwitch(): void {
  state = { halted: false };
  persistKillSwitchState();
}

/**
 * Check if halt is active.
 */
export function isKillSwitchHalted(): boolean {
  return state.halted;
}

/**
 * Get current state (for dashboard/API).
 */
export function getKillSwitchState(): KillSwitchState {
  return { ...state };
}
