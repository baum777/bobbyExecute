export type HealthStatus = 'OK' | 'DEGRADED' | 'FAIL';
export type BotStatus = 'running' | 'paused' | 'stopped';
export type AdapterStatus = 'healthy' | 'degraded' | 'down';
export type DecisionAction = 'allow' | 'block' | 'abort';

export interface KillSwitchState {
  halted: boolean;
  reason?: string;
  triggeredAt?: string;
}

export interface HealthResponse {
  status: HealthStatus;
  uptimeMs: number;
  version: string;
  killSwitch?: KillSwitchState;
}

export interface SummaryResponse {
  botStatus: BotStatus;
  riskScore: number;
  chaosPassRate: number;
  dataQuality: number;
  lastDecisionAt: string | null;
  tradesToday: number;
}

export interface Adapter {
  id: string;
  status: AdapterStatus;
  latencyMs: number;
  lastSuccessAt: string;
  consecutiveFailures: number;
}

export interface AdaptersResponse {
  adapters: Adapter[];
}

export interface Decision {
  id: string;
  timestamp: string;
  action: DecisionAction;
  token: string;
  confidence: number;
  reasons: string[];
}

export interface DecisionsResponse {
  decisions: Decision[];
}

export interface MetricsResponse {
  p95LatencyMs: Record<string, number>;
}

export interface MarketResponse {
  mci: { value: number | null; reason: string | null };
  bci: { value: number | null; reason: string | null };
  hybrid: { value: number | null; reason: string | null };
}

export interface EmergencyStopResponse {
  success: boolean;
  message: string;
  state: KillSwitchState;
}

export interface ResetResponse {
  success: boolean;
  message: string;
  state: { halted: boolean };
}
