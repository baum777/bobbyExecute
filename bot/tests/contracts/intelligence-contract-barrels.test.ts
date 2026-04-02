import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BARREL_MODULES = [
  {
    path: "src/discovery/contracts/index.ts",
    specifier: "@bot/discovery/contracts/index.js",
    exportCount: 3,
  },
  {
    path: "src/intelligence/context/contracts/index.ts",
    specifier: "@bot/intelligence/context/contracts/index.js",
    exportCount: 1,
  },
  {
    path: "src/intelligence/cqd/contracts/index.ts",
    specifier: "@bot/intelligence/cqd/contracts/index.js",
    exportCount: 1,
  },
  {
    path: "src/intelligence/quality/contracts/index.ts",
    specifier: "@bot/intelligence/quality/contracts/index.js",
    exportCount: 1,
  },
  {
    path: "src/intelligence/universe/contracts/index.ts",
    specifier: "@bot/intelligence/universe/contracts/index.js",
    exportCount: 1,
  },
  {
    path: "src/intelligence/forensics/contracts/index.ts",
    specifier: "@bot/intelligence/forensics/contracts/index.js",
    exportCount: 3,
  },
];

const EXPECTED_EXPORTS: Record<string, string[]> = {
  "src/discovery/contracts/index.ts": [
    "CandidateTokenSchema",
    "CandidateTokenPrioritySchema",
    "assertCandidateToken",
    "DiscoveryEvidenceSchema",
    "DiscoveryEvidenceStatusSchema",
    "createDiscoveryEvidenceRef",
    "SourceObservationChainSchema",
    "SourceObservationSchema",
    "SourceObservationSourceSchema",
    "SourceObservationStatusSchema",
    "assertSourceObservation",
  ],
  "src/intelligence/context/contracts/index.ts": [
    "ContextPackV1Schema",
  ],
  "src/intelligence/cqd/contracts/index.ts": [
    "CQDSnapshotV1Schema",
  ],
  "src/intelligence/quality/contracts/index.ts": [
    "DataQualityStatusSchema",
    "DataQualityV1Schema",
  ],
  "src/intelligence/universe/contracts/index.ts": [
    "UniverseBuildResultSchema",
    "UniverseCoverageStateSchema",
    "UniverseSourceCoverageEntrySchema",
  ],
  "src/intelligence/forensics/contracts/index.ts": [
    "SignalPackCoverageStatusSchema",
    "SignalPackHolderFlowSchema",
    "SignalPackLiquiditySchema",
    "SignalPackManipulationFlagsSchema",
    "SignalPackMarketStructureSchema",
    "SignalPackSourceCoverageEntrySchema",
    "SignalPackV1Schema",
    "SignalPackVolatilitySchema",
    "SignalPackVolumeSchema",
    "TrendReversalMonitorInputAvailabilitySchema",
    "TrendReversalMonitorInputV1Schema",
    "TrendReversalObservationStateSchema",
    "TrendReversalObservationV1Schema",
    "TrendReversalStructureContextSchema",
    "assertSignalPackV1",
    "assertTrendReversalMonitorInputV1",
    "assertTrendReversalObservationV1",
  ],
};

describe("intelligence contract barrels", () => {
  it("contain the expected export surfaces without duplicate export statements", () => {
    for (const { path, exportCount } of BARREL_MODULES) {
      const contents = readFileSync(resolve(process.cwd(), path), "utf8")
        .trim()
        .split("\n");
      const exportLines = contents.filter((line) => line.trim().startsWith("export *"));

      expect(exportLines).toHaveLength(exportCount);
      expect(new Set(exportLines).size).toBe(exportLines.length);
      for (const line of exportLines) {
        expect(line.trim()).toMatch(/^export \* from "\.\/.+\.js";$/);
      }
    }
  });

  it("only expose the expected pre-authority contract symbols", async () => {
    for (const { path, specifier } of BARREL_MODULES) {
      const module = await import(specifier);
      expect(Object.keys(module).sort()).toEqual(EXPECTED_EXPORTS[path].sort());
    }
  });
});
