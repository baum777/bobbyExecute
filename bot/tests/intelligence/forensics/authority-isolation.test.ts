import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "..", "..", "..", "src");

async function readSrc(rel: string): Promise<string> {
  return readFile(join(srcRoot, rel), "utf8");
}

const FORBIDDEN_FORENSICS_PATTERN =
  /intelligence\/forensics|signal_pack\.v1|trend_reversal_monitor_input\.v1|buildSignalPackV1|buildTrendReversalMonitorInputV1/;

describe("forensics foundation stays out of authority paths", () => {
  const authorityFiles = [
    "core/engine.ts",
    "core/orchestrator.ts",
    "governance/policy-engine.ts",
    "patterns/pattern-engine.ts",
    "core/decision/decision-result-derivation.ts",
    "core/contracts/scorecard.ts",
    "core/contracts/pattern.ts",
    "agents/execution.agent.ts",
    "agents/signal.agent.ts",
    "index.ts",
  ];

  for (const rel of authorityFiles) {
    it(`${rel} does not import the forensics foundation`, async () => {
      const text = await readSrc(rel);
      expect(text).not.toMatch(FORBIDDEN_FORENSICS_PATTERN);
    });
  }
});
