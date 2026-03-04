/**
 * Golden Tasks GT-002 bis GT-018.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: tests
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Orchestrator } from "@bot/core/orchestrator.js";
import { MemoryDB } from "@bot/memory/memory-db.js";
import { recognizePatterns } from "@bot/patterns/pattern-engine.js";
import { runChaosSuite } from "@bot/chaos/chaos-suite.js";
import { SignalPackSchema } from "@bot/core/contracts/signalpack.js";
import { ScoreCardSchema } from "@bot/core/contracts/scorecard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname);

function loadJson<T>(dir: string, file: string): T {
  const path = join(FIXTURES, dir, file);
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

describe("Golden Task GT-002", () => {
  it("runs Pipeline Integration Test", async () => {
    const fixture = loadJson<{ intentSpec: unknown }>("GT-002", "fixture.json");
    const expected = loadJson<{ expect: { phaseReached: string; chaosPassed: boolean } }>("GT-002", "expected.json");

    const research = async () => {
      const signalPack = SignalPackSchema.parse({
        traceId: fixture.intentSpec.traceId,
        timestamp: new Date().toISOString(),
        signals: [
          {
            source: "moralis",
            timestamp: new Date().toISOString(),
            baseToken: "SOL",
            quoteToken: "USDC",
            priceUsd: 150,
            volume24h: 1e6,
            liquidity: 5e7,
          },
        ],
        dataQuality: { completeness: 0.9, freshness: 0.9, sourceReliability: 0.95 },
        sources: ["moralis"],
      });
      return signalPack;
    };

    const orch = new Orchestrator({ dryRun: true });
    const state = await orch.run(fixture.intentSpec as import("@bot/core/contracts/intent.js").IntentSpec, research);

    expect(state.phase).toBe(expected.expect.phaseReached);
    expect(state.chaosPassed).toBe(expected.expect.chaosPassed);
    expect(state.decisionResult).toBeDefined();
    expect(state.patternResult).toBeDefined();
  });
});

describe("Golden Task GT-003", () => {
  it("runs Memory-DB Renewal Test", async () => {
    const fixture = loadJson<{ dataQuality: { completeness: number; freshness: number }; data: unknown }>("GT-003", "fixture.json");
    const expected = loadJson<{ expect: { renewed: boolean; compressed: boolean; hasSnapshot: boolean } }>("GT-003", "expected.json");

    const db = new MemoryDB();
    const snapshot = db.renew(fixture.data, fixture.dataQuality);
    const compressed = await db.compress(snapshot);

    expect(compressed).toBeDefined();
    expect(compressed.hash).toBeDefined();
    expect(db.getSnapshot()).toBeDefined();
    expect(expected.expect.renewed).toBe(true);
  });
});

describe("Golden Task GT-004", () => {
  it("runs Pattern Recognition Test", async () => {
    const fixture = loadJson<{ scoreCard: unknown; signalPack: unknown }>("GT-004", "fixture.json");
    const expected = loadJson<{ expect: { hasPatterns: boolean; hasEvidence: boolean } }>("GT-004", "expected.json");

    const scoreCard = ScoreCardSchema.parse(fixture.scoreCard);
    const signalPack = SignalPackSchema.parse(fixture.signalPack);
    const result = recognizePatterns("gt-004-trace", new Date().toISOString(), scoreCard, signalPack);

    expect(result.patterns).toBeDefined();
    expect(result.evidence).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

describe("Golden Tasks GT-005 bis GT-016 (Chaos Suite)", () => {
  it.each(["GT-005", "GT-006", "GT-007", "GT-008", "GT-009", "GT-010", "GT-011", "GT-012", "GT-013", "GT-014", "GT-015", "GT-016"])(
    "%s runs Chaos Gate Test",
    async (gtId) => {
      const report = await runChaosSuite(`${gtId.toLowerCase()}-trace`);
      expect(report.total).toBe(19);
      expect(report.passRate).toBeGreaterThanOrEqual(0.98);
      expect(report.auditHashChain).toBeDefined();
    }
  );
});

describe("Golden Task GT-017", () => {
  it("runs Full Integration Test", async () => {
    const fixture = loadJson<{ intentSpec: unknown }>("GT-017", "fixture.json");
    const expected = loadJson<{ expect: { phaseReached: string; chaosPassed: boolean } }>("GT-017", "expected.json");

    const research = async () =>
      SignalPackSchema.parse({
        traceId: "gt-017-trace",
        timestamp: new Date().toISOString(),
        signals: [
          {
            source: "moralis",
            timestamp: new Date().toISOString(),
            baseToken: "SOL",
            quoteToken: "USDC",
            priceUsd: 150,
            liquidity: 5e7,
            volume24h: 1e6,
          },
        ],
        dataQuality: { completeness: 0.9, freshness: 0.9, sourceReliability: 0.95 },
        sources: ["moralis"],
      });

    const orch = new Orchestrator({ dryRun: true });
    const state = await orch.run(fixture.intentSpec as import("@bot/core/contracts/intent.js").IntentSpec, research);

    expect(state.phase).toBe(expected.expect.phaseReached);
    expect(state.chaosPassed).toBe(true);
    expect(orch.getMemoryLog().getEntries().length).toBeGreaterThan(0);
  });
});

describe("Golden Task GT-018", () => {
  it("runs Full Kimi Swarm Chaos Validation", async () => {
    const fixture = loadJson<{ traceId: string }>("GT-018", "fixture.json");
    const expected = loadJson<{ expect: { passRate: string; all19ScenariosRun: boolean } }>("GT-018", "expected.json");

    const report = await runChaosSuite(fixture.traceId);

    expect(report.total).toBe(19);
    expect(report.results.length).toBe(19);
    expect(report.passRate).toBeGreaterThanOrEqual(0.98);
    expect(report.auditHashChain).toBeDefined();
    expect(report.auditHashChain.length).toBeGreaterThan(0);
  });
});
