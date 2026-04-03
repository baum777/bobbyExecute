import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SRC_ROOT = resolve(process.cwd(), "src");

function walkTsFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const full = resolve(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkTsFiles(full));
      continue;
    }
    if (full.endsWith(".ts")) {
      files.push(full);
    }
  }

  return files;
}

function toRel(absPath: string): string {
  return absPath.slice(SRC_ROOT.length + 1).replaceAll("\\", "/");
}

function readSrc(relPath: string): string {
  return readFileSync(resolve(SRC_ROOT, relPath), "utf8");
}

function findConstOwners(symbol: string): string[] {
  const declarationPattern = new RegExp(`(?:export\\s+)?const\\s+${symbol}\\b`);
  return walkTsFiles(SRC_ROOT)
    .filter((filePath) => declarationPattern.test(readFileSync(filePath, "utf8")))
    .map(toRel)
    .sort();
}

describe("migration contract ownership freeze", () => {
  it("keeps one owner file per frozen schema concept", () => {
    const expectedOwners: Record<string, string> = {
      DataQualityV1Schema: "core/contracts/dataquality.ts",
      CQDSnapshotV1Schema: "core/contracts/cqd.ts",
      UniverseBuildResultSchema: "intelligence/universe/contracts/universe-build-result.ts",
      ConstructedSignalSetV1Schema: "intelligence/signals/contracts/constructed-signal-set.v1.ts",
      ScoreCardV1Schema: "intelligence/scoring/contracts/score-card.v1.ts",
      DecisionEnvelopeSchema: "core/contracts/decision-envelope.ts",
    };

    for (const [symbol, owner] of Object.entries(expectedOwners)) {
      expect(findConstOwners(symbol), `${symbol} owner drift`).toEqual([owner]);
    }
  });

  it("keeps DataQuality and CQD wrappers thin and explicitly transitional", () => {
    const qualityWrapper = readSrc("intelligence/quality/contracts/data-quality.v1.ts");
    const cqdWrapper = readSrc("intelligence/cqd/contracts/cqd.snapshot.v1.ts");

    expect(qualityWrapper).toContain("Transitional wrapper");
    expect(qualityWrapper).toContain("Ownership freeze (PR-M0-01)");
    expect(qualityWrapper).toContain('from "../../../core/contracts/dataquality.js"');
    expect(qualityWrapper).not.toContain("z.object(");

    expect(cqdWrapper).toContain("Transitional wrapper");
    expect(cqdWrapper).toContain("Ownership freeze (PR-M0-01)");
    expect(cqdWrapper).toContain('from "../../../core/contracts/cqd.js"');
    expect(cqdWrapper).not.toContain("z.object(");
  });

  it("marks legacy overlapping contract families as deprecated in-place", () => {
    expect(readSrc("core/contracts/scorecard.ts")).toContain("@deprecated migration target");
    expect(readSrc("core/contracts/signalpack.ts")).toContain("@deprecated migration target");
    expect(readSrc("core/contracts/tokenuniverse.ts")).toContain("@deprecated migration target");
  });

  it("keeps decision-history truth explicit: cycle summaries canonical, action logs derived", () => {
    const runtimeCycleRepo = readSrc("persistence/runtime-cycle-summary-repository.ts");
    const actionLog = readSrc("observability/action-log.ts");

    expect(runtimeCycleRepo).toContain("Primary canonical decision-history artifact");
    expect(runtimeCycleRepo).toContain("decisionEnvelope?: DecisionEnvelope");
    expect(actionLog).toContain("action logs are derived support only");
    expect(actionLog).toContain("Canonical decision history is the runtime cycle summary `decisionEnvelope`");
  });
});
