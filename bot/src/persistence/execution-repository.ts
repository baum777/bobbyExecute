/**
 * Execution repository - stores execution records for replay/audit.
 * Normalized planning package: best-effort persistence.
 */
import type { ExecutionReport } from "../core/contracts/trade.js";

const inMemoryStore: ExecutionReport[] = [];

/**
 * Append execution record. Best-effort - does not block on failure.
 */
export function appendExecutionRecord(record: ExecutionReport): void {
  inMemoryStore.push({ ...record });
}

/**
 * Get execution records by trade intent ID.
 */
export function getExecutionByTradeIntentId(
  tradeIntentId: string
): ExecutionReport[] {
  return inMemoryStore.filter((r) => r.tradeIntentId === tradeIntentId);
}

/**
 * Get recent execution records (last N).
 */
export function getRecentExecutions(limit = 100): ExecutionReport[] {
  return inMemoryStore.slice(-limit);
}
