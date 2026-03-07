/**
 * Health service - system health report for API.
 * Re-exports from health.ts for normalized layer.
 */
import { checkHealth, type HealthReport, type HealthStatus } from "./health.js";

export { checkHealth };
export type { HealthReport, HealthStatus };

/** Alias for SystemHealthReport per plan */
export type SystemHealthReport = HealthReport;
