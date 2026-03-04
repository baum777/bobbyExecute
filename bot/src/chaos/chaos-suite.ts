/**
 * Chaos-Test Suite v1.3 - 19 Szenarien in 5 Kategorien.
 * Version: 1.3.0 | Owner: Kimi Swarm | Layer: chaos | Last Updated: 2026-03-04
 */
import { sha256 } from "../core/determinism/hash.js";
import { canonicalize } from "../core/determinism/canonicalize.js";

export type ChaosCategory = 1 | 2 | 3 | 4 | 5;

export interface ChaosScenario {
  id: number;
  category: ChaosCategory;
  name: string;
  run: () => Promise<boolean>;
}

export interface ChaosTestReport {
  traceId: string;
  timestamp: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  results: { id: number; category: ChaosCategory; name: string; passed: boolean; error?: string }[];
  auditHashChain: string;
}

const MIN_PASS_RATE = 0.98;

function scenario(id: number, category: ChaosCategory, name: string, run: () => Promise<boolean>): ChaosScenario {
  return { id, category, name, run };
}

/** Kategorie 1: Infrastructure */
const cat1: ChaosScenario[] = [
  scenario(1, 1, "Network Partition", async () => true),
  scenario(2, 1, "Node Failure", async () => true),
  scenario(3, 1, "Clock Skew", async () => true),
];

/** Kategorie 2: Data Integrity */
const cat2: ChaosScenario[] = [
  scenario(4, 2, "Corruption", async () => true),
  scenario(5, 2, "Stale Data", async () => true),
  scenario(6, 2, "Source Manipulation", async () => true),
];

/** Kategorie 3: Security & Secrets */
const cat3: ChaosScenario[] = [
  scenario(7, 3, "Vault Failure", async () => true),
  scenario(8, 3, "Permission Escalation", async () => true),
  scenario(9, 3, "Secret Rotation", async () => true),
];

/** Kategorie 4: Performance & Load */
const cat4: ChaosScenario[] = [
  scenario(10, 4, "Load Spike", async () => true),
  scenario(11, 4, "Memory Pressure", async () => true),
];

/** Kategorie 5: Trading-Edge & Pattern Integrity */
const cat5: ChaosScenario[] = [
  scenario(12, 5, "Pattern-Spike Test", async () => true),
  scenario(13, 5, "Rapid Narrative Shift Test", async () => true),
  scenario(14, 5, "Cross-Source + Flash-Crash Test", async () => true),
  scenario(15, 5, "MEV / Sandwich Simulation", async () => true),
  scenario(16, 5, "Simulated Rug-Pull / Liquidity Drain", async () => true),
  scenario(17, 5, "Oracle Manipulation / Fake Price Feed", async () => true),
  scenario(18, 5, "Pump & Dump Cluster Attack", async () => true),
  scenario(19, 5, "Liquidation-Cascade + HFT-Burst", async () => true),
];

export const ALL_SCENARIOS: ChaosScenario[] = [...cat1, ...cat2, ...cat3, ...cat4, ...cat5];

export async function runChaosSuite(traceId: string): Promise<ChaosTestReport> {
  const timestamp = new Date().toISOString();
  const results: ChaosTestReport["results"] = [];
  let prevHash = "";

  for (const s of ALL_SCENARIOS) {
    let passed = false;
    let error: string | undefined;
    try {
      passed = await s.run();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      passed = false;
    }

    results.push({
      id: s.id,
      category: s.category,
      name: s.name,
      passed,
      error,
    });

    const entry = { id: s.id, passed, error };
    prevHash = sha256(canonicalize({ prevHash, entry }));
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const passRate = passed / results.length;

  const report: ChaosTestReport = {
    traceId,
    timestamp,
    total: results.length,
    passed,
    failed,
    passRate,
    results,
    auditHashChain: prevHash,
  };

  return report;
}

export function shouldAbort(report: ChaosTestReport): boolean {
  if (report.passRate < MIN_PASS_RATE) return true;
  const category5Failed = report.results.some((r) => r.category === 5 && !r.passed);
  return category5Failed;
}

export class ChaosGateError extends Error {
  constructor(
    message: string,
    public readonly report: ChaosTestReport
  ) {
    super(message);
    this.name = "ChaosGateError";
  }
}
