/**
 * KPI API contracts for Wave 3 - Runtime Visibility & Dashboard Bridge.
 * Matches readiness--waves.md §6.
 */
export interface HealthResponse {
  status: "OK" | "DEGRADED" | "FAIL";
  uptimeMs: number;
  version: string;
  /** Runtime-reported bot state when available from bootstrap wiring. */
  botStatus?: "running" | "paused" | "stopped";
  killSwitch?: { halted: boolean; reason?: string; triggeredAt?: string };
  runtime?: {
    status: "idle" | "running" | "paused" | "stopped" | "error";
    mode: "dry" | "paper" | "live";
    paperModeActive: boolean;
    cycleInFlight: boolean;
    counters: {
      cycleCount: number;
      decisionCount: number;
      executionCount: number;
      blockedCount: number;
      errorCount: number;
    };
    lastCycleAt?: string;
    lastDecisionAt?: string;
    lastBlockedReason?: string;
    lastEngineStage?: string;
    lastIntakeOutcome?: "ok" | "stale" | "adapter_error" | "invalid" | "kill_switch_halted";
  };
}

export interface KpiSummaryResponse {
  botStatus: "running" | "paused" | "stopped";
  riskScore: number;
  chaosPassRate: number;
  dataQuality: number;
  lastDecisionAt: string | null;
  tradesToday: number;
  runtime?: {
    mode: "dry" | "paper" | "live";
    paperModeActive: boolean;
    status: "idle" | "running" | "paused" | "stopped" | "error";
    cycleCount: number;
    decisionCount: number;
    executionCount: number;
    blockedCount: number;
    errorCount: number;
    lastDecisionAt?: string;
    lastIntakeOutcome?: "ok" | "stale" | "adapter_error" | "invalid" | "kill_switch_halted";
  };
}

export interface KpiDecision {
  id: string;
  timestamp: string;
  action: "allow" | "block" | "abort";
  token: string;
  confidence: number;
  reasons: string[];
}

export interface KpiDecisionsResponse {
  decisions: KpiDecision[];
}

export interface KpiAdapter {
  id: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  lastSuccessAt: string;
  consecutiveFailures: number;
}

export interface KpiAdaptersResponse {
  adapters: KpiAdapter[];
}

export interface KpiMetricsResponse {
  p95LatencyMs: Record<string, number>;
}
