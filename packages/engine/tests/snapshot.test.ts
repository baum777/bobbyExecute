import { describe, it, expect, vi } from "vitest";
import { DexScreenerAdapter, DexPaprikaAdapter } from "@bobby/adapters";
import { executeReducedModeRun } from "../src/index.js";
import { generatePairs, generateDPTokens } from "./fixtures.js";

describe("Golden Artifact Snapshot", () => {
  it("produces stable schema keys and structures", async () => {
    const ds = new DexScreenerAdapter();
    const dp = new DexPaprikaAdapter();

    vi.spyOn(ds, "fetchTrendingSolanaPairs").mockResolvedValue(generatePairs(25));
    vi.spyOn(dp, "fetchSolanaTrending").mockResolvedValue(generateDPTokens(25));
    vi.spyOn(dp, "fetchSolanaTopVolume").mockResolvedValue(generateDPTokens(25, 25));

    const run = await executeReducedModeRun(ds, dp, { mode: "dry" });

    expect(run).toHaveProperty("run_id");
    expect(run).toHaveProperty("mode", "dry");
    expect(run).toHaveProperty("started_at");
    expect(run).toHaveProperty("completed_at");
    expect(run).toHaveProperty("duration_ms");
    expect(run).toHaveProperty("config");
    expect(run).toHaveProperty("universe");
    expect(run).toHaveProperty("tokens");
    expect(run).toHaveProperty("ecosystem");
    expect(run).toHaveProperty("transparency");
    expect(run).toHaveProperty("rankings");
    expect(run).toHaveProperty("low_confidence");
    expect(run).toHaveProperty("notes");

    expect(run.config).toHaveProperty("max_unique_tokens");
    expect(run.config).toHaveProperty("min_unique_tokens");

    for (const t of run.tokens) {
      expect(t).toHaveProperty("normalized");
      expect(t).toHaveProperty("structural");
      expect(t).toHaveProperty("social");
      expect(t).toHaveProperty("risk");
      expect(t).toHaveProperty("divergence");
      expect(t).toHaveProperty("reasoning");
      expect(t.reasoning.bullets).toHaveLength(3);
      expect(t.social.data_status).toBe("disabled");
    }

    expect(run.rankings.top_structural.length).toBeGreaterThan(0);

    const scores = run.rankings.top_structural.map((t) => t.structural_score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }

    expect(run.ecosystem).toHaveProperty("market_structure");
    expect(run.ecosystem).toHaveProperty("narrative_dominance");
    expect(run.ecosystem).toHaveProperty("liquidity_regime");
  });
});
