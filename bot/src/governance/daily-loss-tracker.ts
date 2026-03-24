/**
 * Wave 8 P0: Daily loss tracking - halt when limit reached.
 */
import type { Clock } from "../core/clock.js";
import { SystemClock } from "../core/clock.js";
import { triggerKillSwitch } from "./kill-switch.js";
import { getLiveTestConfig } from "../config/safety.js";
import type { DailyLossRepository } from "../persistence/daily-loss-repository.js";

export interface DailyLossState {
  dateKey: string;
  tradesCount: number;
  lossUsd: number;
}

let state: DailyLossState = {
  dateKey: "",
  tradesCount: 0,
  lossUsd: 0,
};
let repository: DailyLossRepository | undefined;

export function configureDailyLossRepository(nextRepository?: DailyLossRepository): void {
  repository = nextRepository;
}

export async function loadDailyLossState(nextRepository?: DailyLossRepository): Promise<DailyLossState> {
  const repo = nextRepository ?? repository;
  if (!repo) {
    return getDailyLossState();
  }

  const loaded = repo.loadSync();
  if (loaded) {
    state = { ...loaded };
  }
  return getDailyLossState();
}

export function hydrateDailyLossState(nextState: DailyLossState): void {
  state = { ...nextState };
  persistDailyLossState();
}

function persistDailyLossState(): void {
  if (!repository) {
    return;
  }

  const snapshot = getDailyLossState();
  if (typeof repository.saveSync === "function") {
    repository.saveSync(snapshot);
    return;
  }

  void repository.save(snapshot);
}

/** Reset for tests. */
export function resetDailyLossState(): void {
  state = { dateKey: "", tradesCount: 0, lossUsd: 0 };
  persistDailyLossState();
}

function toDateKey(clock: Clock): string {
  const d = clock.now();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Check if daily limit reached (trades or loss). Resets state at midnight UTC.
 */
export function isDailyLimitReached(clock?: Clock): boolean {
  return checkLimit(clock);
}

function checkLimit(clock?: Clock): boolean {
  const c = clock ?? new SystemClock();
  const key = toDateKey(c);
  if (state.dateKey !== key) {
    state = { dateKey: key, tradesCount: 0, lossUsd: 0 };
    persistDailyLossState();
    return false;
  }
  const config = getLiveTestConfig();
  if (!config.enabled) return false;
  if (state.tradesCount >= config.maxTradesPerDay) return true;
  if (state.lossUsd >= config.maxDailyLossUsd) return true;
  return false;
}

export interface DailyLossTrackerInterface {
  isLimitReached(): boolean;
  recordTrade(lossUsd: number): void;
}

/**
 * Create DailyLossTracker for Engine.
 */
export function createDailyLossTracker(clock?: Clock): DailyLossTrackerInterface {
  const c = clock ?? new SystemClock();
  return {
    isLimitReached: () => checkLimit(c),
    recordTrade: (lossUsd: number) => recordTrade(lossUsd, c),
  };
}

/**
 * Record a completed trade. Call after verify passed.
 */
export function recordTrade(lossUsd: number, clock?: Clock): void {
  const c = clock ?? new SystemClock();
  const key = toDateKey(c);
  if (state.dateKey !== key) {
    state = { dateKey: key, tradesCount: 0, lossUsd: 0 };
  }
  state.tradesCount++;
  if (lossUsd > 0) state.lossUsd += lossUsd;

  const config = getLiveTestConfig();
  if (config.enabled && state.lossUsd >= config.maxDailyLossUsd) {
    triggerKillSwitch(`Daily loss limit reached: ${state.lossUsd.toFixed(2)} USD >= ${config.maxDailyLossUsd} USD`);
  }
  persistDailyLossState();
}

/**
 * Get current daily state (for dashboard/KPI).
 */
export function getDailyLossState(clock?: Clock): DailyLossState {
  const c = clock ?? new SystemClock();
  const key = toDateKey(c);
  if (state.dateKey !== key) {
    return { dateKey: key, tradesCount: 0, lossUsd: 0 };
  }
  return { ...state };
}
