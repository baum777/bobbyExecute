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
}

export interface KpiSummaryResponse {
  botStatus: "running" | "paused" | "stopped";
  riskScore: number;
  chaosPassRate: number;
  dataQuality: number;
  lastDecisionAt: string | null;
  tradesToday: number;
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
