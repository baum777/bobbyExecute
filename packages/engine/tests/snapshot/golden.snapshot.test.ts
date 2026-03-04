import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { DexPaprikaAdapterImpl, DexScreenerAdapterImpl, HttpClient } from "@reducedmode/adapters";
import { InMemoryRunStore, ReducedModeEngine } from "../../src/index.js";

describe("ReducedMode V1 Snapshot", () => {
  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it("produces stable golden artifact shape and ordering", async () => {
    nock.disableNetConnect();
    nock("https://api.dexscreener.com").get("/latest/dex/search").query(true).reply(500, {});
    nock("https://api.dexscreener.com").get("/token-profiles/latest/v1").query(true).reply(500, {});
    nock("https://api.dexpaprika.com").get("/v1/solana/trending").query(true).reply(500, {});
    nock("https://api.dexpaprika.com").get("/v1/solana/featured").query(true).reply(500, {});
    nock("https://api.dexpaprika.com").get("/v1/solana/top-volume").query(true).reply(500, {});
    nock("https://api.dexpaprika.com").get("/v1/solana/volumes").query(true).reply(500, {});

    const http = new HttpClient({
      retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, jitterMs: 0 },
      defaultTimeoutMs: 500,
    });
    const engine = new ReducedModeEngine({
      store: new InMemoryRunStore(),
      dexscreener: new DexScreenerAdapterImpl(http),
      dexpaprika: new DexPaprikaAdapterImpl(http),
      config: {
        MIN_UNIQUE_TOKENS: 5,
        MAX_UNIQUE_TOKENS: 10,
        MAX_RECOVERY_ATTEMPTS: 1,
      },
    });

    const run = await engine.run({ mode: "dry", maxTokens: 10 });
    const sanitized = sanitizeDynamicFields(run);

    expect(Object.keys(sanitized)).toEqual([
      "version",
      "run_id",
      "generated_at",
      "mode",
      "status",
      "low_confidence_analysis",
      "config",
      "transparency",
      "sections",
      "tokens",
      "top_structural",
      "top_fragile",
      "notes",
    ]);

    const contracts = sanitized.tokens.map((token: { token: { contract_address: string } }) => token.token.contract_address);
    expect(contracts).toEqual([...contracts].sort((a, b) => a.localeCompare(b)));
    expect(sanitized).toMatchSnapshot();
  });
});

function sanitizeDynamicFields(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((value) => sanitizeDynamicFields(value));
  }
  if (!input || typeof input !== "object") return input;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key === "run_id") {
      out[key] = "<run_id>";
      continue;
    }
    if (key === "generated_at" || key === "fetched_at") {
      out[key] = "<timestamp>";
      continue;
    }
    out[key] = sanitizeDynamicFields(value);
  }
  return out;
}
