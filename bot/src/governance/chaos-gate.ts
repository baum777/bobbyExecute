/**
 * Chaos-Gate - Hartes Gate vor Memory-DB/Trading-Change.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: governance | Last Updated: 2026-03-04
 * Wave 5 P2: Timeout protection - abort if suite exceeds limit.
 */
import { runChaosSuite, shouldAbort, ChaosGateError, type ChaosContext } from "../chaos/chaos-suite.js";

const MIN_PASS_RATE = 0.98;
const CHAOS_GATE_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Chaos gate timeout: ${ms}ms exceeded`)), ms)
    ),
  ]);
}

/**
 * Führt Chaos-Suite aus. Bei Fail in Kategorie 5 oder <98% Pass-Rate → Abort + Escalation.
 * Wave 5: Timeout protection - throws if suite exceeds CHAOS_GATE_TIMEOUT_MS.
 */
export async function runChaosGate(
  traceId: string,
  ctx?: ChaosContext
): Promise<{ passed: boolean; report: Awaited<ReturnType<typeof runChaosSuite>> }> {
  const report = await withTimeout(runChaosSuite(traceId, ctx), CHAOS_GATE_TIMEOUT_MS);

  if (report.passRate < MIN_PASS_RATE) {
    throw new ChaosGateError(
      `Chaos-Gate FAIL: Pass-Rate ${(report.passRate * 100).toFixed(1)}% < ${MIN_PASS_RATE * 100}%`,
      report
    );
  }

  if (shouldAbort(report)) {
    throw new ChaosGateError(
      "Chaos-Gate FAIL: Kategorie 5 Failure - Sofortiger Abort + Escalation",
      report
    );
  }

  return { passed: true, report };
}

export { CHAOS_GATE_TIMEOUT_MS };
