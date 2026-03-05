import { describe, it, expect, vi } from "vitest";
import { DexScreenerAdapter, DexPaprikaAdapter } from "@bobby/adapters";
import { executeReducedModeRun } from "../src/index.js";
import { generatePairs, generateDPTokens } from "./fixtures.js";

describe("Golden Artifact Snapshot", () => {
  it("produces stable schema keys and structures", async () => {
    const ds = new DexScreenerAdapter();
    const dp = new DexPaprikaAdapter();
    vi.spyOn(ds, "fetchTrendingPairs").mockResolvedValue({ ok: true, data: generatePairs(25), source: "dexscreener" });
    vi.spyOn(dp, "fetchPairsMix").mockResolvedValue({
      trending: { ok: true, data: generateDPTokens(25), source: "dexpaprika" },
      volume: { ok: true, data: generateDPTokens(25, 25), source: "dexpaprika" },
    });

    const run = await executeReducedModeRun(ds, dp, { mode: "dry" });

    expect(run).toHaveProperty("run_id");
    expect(run).toHaveProperty("mode", "dry");
    expect(run).toHaveProperty("config");
    expect(run).toHaveProperty("universe");
    expect(run).toHaveProperty("tokens");
    expect(run).toHaveProperty("ecosystem");
    expect(run).toHaveProperty("transparency");
    expect(run).toHaveProperty("rankings");
    expect(run).toHaveProperty("low_confidence");
    expect(run).toHaveProperty("notes");

    for (const t of run.tokens) {
      expect(t.reasoning.bullets).toHaveLength(3);
      expect(t.reasoning.bullets[0]).toContain("completeness=");
      expect(t.reasoning.bullets[1]).toContain("structural_score=");
      expect(t.reasoning.bullets[2]).toContain("overall_risk=");
      expect(t.social.data_status).toBe("disabled");
    }

    const scores = run.rankings.top_structural.map((t) => t.structural_score);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
  });
});
