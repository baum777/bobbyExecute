/**
 * Wave 6 P0: Kill switch - emergency halt. Manual reset required.
 */
export interface KillSwitchState {
  halted: boolean;
  reason?: string;
  triggeredAt?: string;
}

let state: KillSwitchState = { halted: false };

/**
 * Trigger emergency stop. Halt all trading. Requires manual reset.
 */
export function triggerKillSwitch(reason?: string): void {
  state = {
    halted: true,
    reason: reason ?? "emergency-stop",
    triggeredAt: new Date().toISOString(),
  };
}

/**
 * Reset kill switch. Must be called explicitly by operator.
 */
export function resetKillSwitch(): void {
  state = { halted: false };
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
