/**
 * Onchain Trading Bot - main entry point.
 * Version: 1.1.0 | Owner: Kimi Swarm | Last Updated: 2026-03-05
 * Changes: Added DexScreenerAdapter exports for Milestone 1
 */
export { Clock, SystemClock, FakeClock } from "./core/clock.js";
export { ToolRouter } from "./core/tool-router.js";
export { Engine } from "./core/engine.js";
export { Orchestrator } from "./core/orchestrator.js";
export { hashDecision, hashResult } from "./core/determinism/hash.js";
export { canonicalize } from "./core/determinism/canonicalize.js";

export * from "./core/contracts/index.js";
export { RiskBreakdownSchema } from "./core/contracts/riskbreakdown.js";
export { buildTokenUniverse, type UniverseBuilderConfig, type RawTokenInput } from "./core/universe/token-universe-builder.js";
export { normalizeToTokenV1 } from "./core/normalize/normalizer.js";
export {
  validateCrossSource,
  hasDiscrepancy,
  type ValidationResult,
} from "./core/validate/cross-source-validator.js";
export * from "./core/intelligence/mci-bci-formulas.js";
export * from "./governance/policy-engine.js";
export * from "./governance/tool-permissions.js";
export * from "./governance/guardrails.js";
export * from "./governance/circuit-breaker.js";
export * from "./governance/kill-switch.js";
export {
  getLiveTestConfig,
  assertLiveTestPrerequisites,
  type LiveTestConfig,
} from "./config/safety.js";
export {
  createDailyLossTracker,
  isDailyLimitReached,
  getDailyLossState,
  type DailyLossTrackerInterface,
} from "./governance/daily-loss-tracker.js";
export * from "./governance/review-gates.js";
export * from "./governance/chaos-gate.js";
export * from "./observability/action-log.js";
export { createTraceId, createMemoryTraceId, type CreateTraceIdOptions } from "./observability/trace-id.js";
export { isLiveTradingEnabled, assertLiveTradingRequiresRealRpc } from "./config/safety.js";
export { getRpcMode, getRpcUrl } from "./core/config/rpc.js";
export {
  createRpcClient,
  StubRpcClient,
  type RpcClient,
  type RpcClientConfig,
} from "./adapters/rpc-verify/client.js";
export { resilientFetch, type ResilientFetchOptions } from "./adapters/http-resilience.js";
export {
  createAdaptersWithCircuitBreaker,
  ADAPTER_IDS,
  type AdaptersWithCbConfig,
  type AdaptersWithCbResult,
} from "./adapters/adapters-with-cb.js";
export * from "./storage/idempotency-store.js";
export { InMemoryIdempotencyStore } from "./storage/inmemory-kv.js";
export * from "./eventbus/index.js";
export * from "./journal-writer/index.js";
export * from "./config-loader/index.js";
export * from "./memory/index.js";
export { checkHealth, type HealthReport } from "./observability/health.js";
export { recordLatency, getP95 } from "./observability/metrics.js";
export { incrementIncident, getIncidentCount } from "./observability/incidents.js";
export * from "./chaos/index.js";
export * from "./patterns/pattern-engine.js";
export { createServer, type ServerConfig } from "./server/index.js";

// Milestone 1: DexScreenerAdapter exports
export * from "./adapters/dexscreener/client.js";
export * from "./adapters/dexscreener/types.js";
export * from "./adapters/dexscreener/mapper.js";

// Optional LLM helpers are not re-exported here; use the dedicated package subpath if needed.
