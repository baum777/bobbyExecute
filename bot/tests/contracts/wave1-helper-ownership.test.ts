import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), "src", rel), "utf8");
}

function walkFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(root, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

describe("wave 1 helper ownership", () => {
  it("keeps canonicalization and hashing owned by core/determinism", () => {
    const srcRoot = resolve(process.cwd(), "src");
    const srcFiles = walkFiles(srcRoot).map((abs) => abs.slice(srcRoot.length + 1).replaceAll("\\", "/"));

    expect(srcFiles.filter((file) => file.endsWith("canonicalize.ts"))).toEqual([
      "core/determinism/canonicalize.ts",
    ]);
    expect(srcFiles.filter((file) => file.endsWith("hash.ts"))).toEqual([
      "core/determinism/hash.ts",
    ]);

    expect(readSrc("core/determinism/canonicalize.ts")).toContain("export function canonicalize");
    expect(readSrc("core/determinism/hash.ts")).toContain("export function hashDecision");
    expect(readSrc("core/determinism/hash.ts")).toContain("export function hashResult");

    expect(readSrc("discovery/source-observation.ts")).toContain('from "../core/determinism/hash.js"');
    expect(readSrc("discovery/discovery-evidence.ts")).toContain('from "../core/determinism/hash.js"');
    expect(readSrc("discovery/source-observation.ts")).not.toContain("createHash(");
    expect(readSrc("discovery/discovery-evidence.ts")).not.toContain("createHash(");

    expect(srcFiles.filter((file) => file.startsWith("intelligence/forensics/") && file.endsWith("hash.ts"))).toEqual([]);
    expect(srcFiles.filter((file) => file.startsWith("intelligence/forensics/") && file.endsWith("canonicalize.ts"))).toEqual([]);
    expect(srcFiles.filter((file) => file.startsWith("intelligence/forensics/") && file.endsWith("deterministic.ts"))).toEqual([
      "intelligence/forensics/deterministic.ts",
    ]);
  });

  it("keeps intelligence quality and cqd wrappers thin and re-export based", () => {
    const quality = readSrc("intelligence/quality/contracts/data-quality.v1.ts");
    const cqd = readSrc("intelligence/cqd/contracts/cqd.snapshot.v1.ts");
    const qualityIndex = readSrc("intelligence/quality/index.ts");
    const qualityBuilder = readSrc("intelligence/quality/build-data-quality.ts");
    const cqdIndex = readSrc("intelligence/cqd/index.ts");
    const cqdBuilder = readSrc("intelligence/cqd/build-cqd.ts");
    const forensicsDeterministic = readSrc("intelligence/forensics/deterministic.ts");
    const forensicsBuilder = readSrc("intelligence/forensics/build-signal-pack.ts");
    const forensicsMarketStructure = readSrc("intelligence/forensics/market-structure.ts");
    const forensicsHolderFlow = readSrc("intelligence/forensics/holder-flow-snapshot.ts");
    const forensicsManipulationFlags = readSrc("intelligence/forensics/manipulation-flags.ts");
    const forensicsIndex = readSrc("intelligence/forensics/index.ts");
    const forensicsContracts = readSrc("intelligence/forensics/contracts/signal-pack.v1.ts");

    expect(quality).toContain('from "../../../core/contracts/dataquality.js"');
    expect(quality).not.toContain("z.object(");
    expect(cqd).toContain('from "../../../core/contracts/cqd.js"');
    expect(cqd).not.toContain("z.object(");
    expect(qualityIndex).toContain('export { buildDataQualityV1, type BuildDataQualityV1Input } from "./build-data-quality.js";');
    expect(qualityIndex).toContain('export * from "./contracts/index.js";');
    expect(qualityIndex).not.toContain("z.object(");
    expect(cqdIndex).toContain('export { buildCQDSnapshotV1, type BuildCQDSnapshotV1Input } from "./build-cqd.js";');
    expect(cqdIndex).toContain('export * from "./contracts/index.js";');
    expect(cqdIndex).not.toContain("z.object(");
    expect(qualityBuilder).toContain('from "../../core/determinism/hash.js"');
    expect(qualityBuilder).toContain('from "../../core/validate/cross-source-validator.js"');
    expect(qualityBuilder).toContain('from "../../core/contracts/dataquality.js"');
    expect(qualityBuilder).not.toContain("createHash(");
    expect(qualityBuilder).not.toContain("FRESHNESS_DEGRADED_MS");
    expect(qualityBuilder).not.toContain("FRESHNESS_STALE_MS");
    expect(cqdBuilder).toContain('from "../../core/determinism/hash.js"');
    expect(cqdBuilder).toContain('from "../../core/contracts/cqd.js"');
    expect(cqdBuilder).toContain('from "../../core/contracts/dataquality.js"');
    expect(cqdBuilder).toContain('from "../../core/validate/cross-source-validator.js"');
    expect(cqdBuilder).not.toContain("createHash(");
    expect(cqdBuilder).not.toContain("Date.now(");
    expect(cqdBuilder).not.toContain("canonicalize(");

    expect(forensicsDeterministic).toContain('from "../../core/determinism/hash.js"');
    expect(forensicsDeterministic).not.toContain("createHash(");
    expect(forensicsBuilder).toContain('from "./deterministic.js"');
    expect(forensicsBuilder).not.toContain("createHash(");
    expect(forensicsMarketStructure).toContain('from "./build-signal-pack.js"');
    expect(forensicsHolderFlow).toContain('from "./build-signal-pack.js"');
    expect(forensicsManipulationFlags).toContain('from "./build-signal-pack.js"');
    expect(forensicsMarketStructure).not.toContain("createHash(");
    expect(forensicsHolderFlow).not.toContain("createHash(");
    expect(forensicsManipulationFlags).not.toContain("createHash(");
    expect(forensicsIndex).toContain('export * from "./contracts/index.js";');
    expect(forensicsIndex).toContain("buildSignalPackV1");
    expect(forensicsContracts).toContain("SignalPackV1Schema");
    expect(forensicsContracts).not.toContain("createHash(");
  });
});
