import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MODULES = [
  {
    path: "src/intelligence/universe/index.ts",
    specifier: "@bot/intelligence/universe/index.js",
    exportCount: 2,
    expectedExports: [
      "UniverseBuildResultSchema",
      "UniverseCoverageStateSchema",
      "UniverseSourceCoverageEntrySchema",
      "buildUniverseResult",
    ],
  },
  {
    path: "src/intelligence/quality/index.ts",
    specifier: "@bot/intelligence/quality/index.js",
    exportCount: 2,
    expectedExports: [
      "DataQualityStatusSchema",
      "DataQualityV1Schema",
      "buildDataQualityV1",
    ],
  },
  {
    path: "src/intelligence/cqd/index.ts",
    specifier: "@bot/intelligence/cqd/index.js",
    exportCount: 2,
    expectedExports: [
      "CQDSnapshotV1Schema",
      "buildCQDSnapshotV1",
    ],
  },
  {
    path: "src/intelligence/forensics/index.ts",
    specifier: "@bot/intelligence/forensics/index.js",
    exportCount: 2,
    expectedExports: [
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
      "buildHolderFlowSnapshotV1",
      "buildManipulationFlagsV1",
      "buildMarketStructureV1",
      "buildSignalPackV1",
      "buildTrendReversalMonitorInputV1",
    ],
  },
] as const;

describe("intelligence module barrels", () => {
  it("contain the expected narrow export statements", () => {
    for (const { path, exportCount } of MODULES) {
      const contents = readFileSync(resolve(process.cwd(), path), "utf8").trim().split("\n");
      const exportLines = contents.filter((line) => line.trim().startsWith("export *") || line.trim().startsWith("export {"));

      expect(exportLines).toHaveLength(exportCount);
      expect(new Set(exportLines).size).toBe(exportLines.length);
    }
  });

  it("only expose the expected runtime symbols", async () => {
    for (const { specifier, expectedExports } of MODULES) {
      const module = await import(specifier);
      expect(Object.keys(module).sort()).toEqual([...expectedExports].sort());
    }
  });
});
