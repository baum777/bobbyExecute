/**
 * Metrics service - typed interface for latency and counters.
 * Re-exports from metrics.ts for normalized layer.
 */
import {
  recordLatency,
  getP95,
  getAllP95,
  persistMetricsSnapshot,
  loadMetricsHistory,
  type MetricsSnapshot,
} from "./metrics.js";

export { recordLatency, getP95, getAllP95, persistMetricsSnapshot, loadMetricsHistory };
export type { MetricsSnapshot };

/**
 * Get P95 latency by name. Returns undefined if no data.
 */
export function getP95Latency(name: string): number | undefined {
  return getP95(name);
}
