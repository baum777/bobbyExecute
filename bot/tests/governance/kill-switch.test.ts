/**
 * Wave 6: Kill switch - trigger, reset, isHalted.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  triggerKillSwitch,
  resetKillSwitch,
  isKillSwitchHalted,
  getKillSwitchState,
} from "../../src/governance/kill-switch.js";

describe("Kill switch (Wave 6)", () => {
  afterEach(() => {
    resetKillSwitch();
  });

  it("is not halted by default", () => {
    expect(isKillSwitchHalted()).toBe(false);
  });

  it("halts when triggered", () => {
    triggerKillSwitch("test");
    expect(isKillSwitchHalted()).toBe(true);
    const state = getKillSwitchState();
    expect(state.halted).toBe(true);
    expect(state.reason).toBe("test");
    expect(state.triggeredAt).toBeDefined();
  });

  it("requires manual reset to clear", () => {
    triggerKillSwitch();
    expect(isKillSwitchHalted()).toBe(true);
    resetKillSwitch();
    expect(isKillSwitchHalted()).toBe(false);
    expect(getKillSwitchState().halted).toBe(false);
  });
});
