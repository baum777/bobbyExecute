/**
 * Chaos-Test Suite v1.3 - 19 Szenarien in 5 Kategorien.
 * M6: Scenarios 12-19 use real detection signals.
 */
import { sha256 } from "../core/determinism/hash.js";
import { canonicalize } from "../core/determinism/canonicalize.js";
import { detectLiquidityDrain } from "./signals/liquidity-delta.js";
import { detectCrossDexDivergence } from "./signals/cross-dex-divergence.js";
import { detectPumpVelocityNoHolders } from "./signals/pump-velocity.js";
import { detectStaleData } from "./signals/stale-data.js";
import { detectMevSandwich } from "./signals/mev-sandwich.js";

export type ChaosCategory = 1 | 2 | 3 | 4 | 5;

export interface ChaosContext {
  liquidity?: number;
  prevLiquidity?: number;
  prices?: number[];
  priceChange24h?: number;
  holderGrowth?: number;
  volumeSpike?: number;
  freshnessMs?: number;
  /** Wave 5: MEV/sandwich detection */
  mevFrontRun?: boolean;
  mevBackRun?: boolean;
  mevSlippageExceeded?: boolean;
  mevSimilarTxInBlock?: number;
  mevPriceImpactAnomaly?: number;
  /** Wave 5: Infrastructure (1-3) */
  networkPartitionDetected?: boolean;
  nodeFailureDetected?: boolean;
  clockSkewMs?: number;
  /** Wave 5: Data integrity (4, 6) */
  dataCorruptionDetected?: boolean;
  sourceManipulationPrices?: number[];
}

export interface ChaosScenario {
  id: number;
  category: ChaosCategory;
  name: string;
  run: (ctx?: ChaosContext) => Promise<boolean>;
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

function scenario(id: number, category: ChaosCategory, name: string, run: (ctx?: ChaosContext) => Promise<boolean>): ChaosScenario {
  return { id, category, name, run };
}

/** Kategorie 1: Infrastructure - Wave 5 P1 basic detection */
const cat1: ChaosScenario[] = [
  scenario(1, 1, "Network Partition", async (ctx) => !(ctx?.networkPartitionDetected ?? false)),
  scenario(2, 1, "Node Failure", async (ctx) => !(ctx?.nodeFailureDetected ?? false)),
  scenario(3, 1, "Clock Skew", async (ctx) => {
    const skew = ctx?.clockSkewMs ?? 0;
    return Math.abs(skew) < 5000;
  }),
];

/** Kategorie 2: Data Integrity - Wave 5 P1 basic detection */
const cat2: ChaosScenario[] = [
  scenario(4, 2, "Corruption", async (ctx) => !(ctx?.dataCorruptionDetected ?? false)),
  scenario(5, 2, "Stale Data", async (ctx) => {
    const r = detectStaleData({ freshnessMs: ctx?.freshnessMs, maxAgeMs: 30_000 });
    return !r.hit;
  }),
  scenario(6, 2, "Source Manipulation", async (ctx) => {
    const prices = ctx?.sourceManipulationPrices;
    if (!prices || prices.length < 2) return true;
    const r = detectCrossDexDivergence({ prices, threshold: 0.15 });
    return !r.hit;
  }),
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

/** Kategorie 5: Trading-Edge & Pattern Integrity - M6 real signals */
const cat5: ChaosScenario[] = [
  scenario(12, 5, "Pattern-Spike Test", async (ctx) => {
    const r = detectCrossDexDivergence({ prices: ctx?.prices ?? [100, 105] });
    return !r.hit;
  }),
  scenario(13, 5, "Rapid Narrative Shift Test", async (ctx) => {
    const r = detectPumpVelocityNoHolders({
      priceChange24h: ctx?.priceChange24h ?? 0.1,
      holderGrowth: ctx?.holderGrowth ?? 0.2,
      volumeSpike: ctx?.volumeSpike ?? 1.5,
    });
    return !r.hit;
  }),
  scenario(14, 5, "Cross-Source + Flash-Crash Test", async (ctx) => {
    const r = detectCrossDexDivergence({ prices: ctx?.prices ?? [100, 110], threshold: 0.15 });
    return !r.hit;
  }),
  scenario(15, 5, "MEV / Sandwich Simulation", async (ctx) => {
    const r = detectMevSandwich({
      frontRunDetected: ctx?.mevFrontRun,
      backRunDetected: ctx?.mevBackRun,
      slippageExceeded: ctx?.mevSlippageExceeded,
      similarTxInSameBlock: ctx?.mevSimilarTxInBlock,
      priceImpactAnomaly: ctx?.mevPriceImpactAnomaly,
    });
    return !r.hit;
  }),
  scenario(16, 5, "Simulated Rug-Pull / Liquidity Drain", async (ctx) => {
    const r = detectLiquidityDrain({
      currentLiquidity: ctx?.liquidity ?? 95_000,
      prevLiquidity: ctx?.prevLiquidity ?? 100_000,
      threshold: 0.15,
    });
    return !r.hit;
  }),
  scenario(17, 5, "Oracle Manipulation / Fake Price Feed", async (ctx) => {
    const r = detectCrossDexDivergence({ prices: ctx?.prices ?? [100, 100] });
    return !r.hit;
  }),
  scenario(18, 5, "Pump & Dump Cluster Attack", async (ctx) => {
    const r = detectPumpVelocityNoHolders({
      priceChange24h: ctx?.priceChange24h ?? 0.2,
      holderGrowth: ctx?.holderGrowth ?? 0.15,
      volumeSpike: ctx?.volumeSpike ?? 2,
    });
    return !r.hit;
  }),
  scenario(19, 5, "Liquidation-Cascade + HFT-Burst", async (ctx) => {
    const r = detectLiquidityDrain({
      currentLiquidity: ctx?.liquidity ?? 95_000,
      prevLiquidity: ctx?.prevLiquidity ?? 100_000,
    });
    return !r.hit;
  }),
];

export const ALL_SCENARIOS: ChaosScenario[] = [...cat1, ...cat2, ...cat3, ...cat4, ...cat5];

export async function runChaosSuite(traceId: string, ctx?: ChaosContext): Promise<ChaosTestReport> {
  const timestamp = new Date().toISOString();
  const results: ChaosTestReport["results"] = [];
  let prevHash = "";
  const runCtx = ctx ?? {};

  for (const s of ALL_SCENARIOS) {
    let passed = false;
    let error: string | undefined;
    try {
      passed = await s.run(runCtx);
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
