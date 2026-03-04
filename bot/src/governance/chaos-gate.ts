/**
 * Chaos-Gate - Hartes Gate vor Memory-DB/Trading-Change.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: governance | Last Updated: 2026-03-04
 */
import { runChaosSuite, shouldAbort, ChaosGateError } from "../chaos/chaos-suite.js";

const MIN_PASS_RATE = 0.98;

/**
 * Führt Chaos-Suite aus. Bei Fail in Kategorie 5 oder <98% Pass-Rate → Abort + Escalation.
 */
export async function runChaosGate(traceId: string): Promise<{ passed: boolean; report: Awaited<ReturnType<typeof runChaosSuite>> }> {
  const report = await runChaosSuite(traceId);

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
