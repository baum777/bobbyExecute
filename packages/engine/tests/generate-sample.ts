import { DexScreenerAdapter, DexPaprikaAdapter } from "@bobby/adapters";
import { executeReducedModeRun } from "../src/index.js";
import { generatePairs, generateDPTokens } from "./fixtures.js";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const ds = new DexScreenerAdapter();
  const dp = new DexPaprikaAdapter();

  ds.fetchTrendingSolanaPairs = async () => generatePairs(25);
  dp.fetchSolanaTrending = async () => generateDPTokens(25);
  dp.fetchSolanaTopVolume = async () => generateDPTokens(25, 25);

  const run = await executeReducedModeRun(ds, dp, { mode: "dry" });

  const outPath = join(__dirname, "../../..", "docs/reducedmode-v1/examples/run.sample.json");
  writeFileSync(outPath, JSON.stringify(run, null, 2) + "\n");
  console.log(`Wrote ${outPath} (${run.tokens.length} tokens)`);
}

main().catch(console.error);
