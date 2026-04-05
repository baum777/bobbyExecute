import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SRC_ROOT = resolve(process.cwd(), "src");
const TEST_ROOT = resolve(process.cwd(), "tests");
const SCORECARD_SOURCE = resolve(SRC_ROOT, "core/contracts/scorecard.ts");
const SCORECARD_SOURCE_JS = SCORECARD_SOURCE.replace(/\.ts$/, ".js");
const SIGNALPACK_SOURCE = resolve(SRC_ROOT, "core/contracts/signalpack.ts");
const SIGNALPACK_SOURCE_JS = SIGNALPACK_SOURCE.replace(/\.ts$/, ".js");
const PATTERN_ENGINE_SOURCE = resolve(SRC_ROOT, "patterns/pattern-engine.ts");
const PATTERN_ENGINE_SOURCE_JS = PATTERN_ENGINE_SOURCE.replace(/\.ts$/, ".js");
const SIGNAL_ENGINE_SOURCE = resolve(SRC_ROOT, "signals/signal-engine.ts");
const SIGNAL_ENGINE_SOURCE_JS = SIGNAL_ENGINE_SOURCE.replace(/\.ts$/, ".js");

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

function toRel(root: string, absPath: string): string {
  return absPath.slice(root.length + 1).replaceAll("\\", "/");
}

function parseImports(text: string): string[] {
  const imports: string[] = [];
  const pattern = /from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    imports.push(match[1]);
    match = pattern.exec(text);
  }
  return imports;
}

function resolveImportTarget(filePath: string, specifier: string): string | null {
  if (specifier.startsWith("@bot/")) {
    const relative = specifier.slice("@bot/".length).replace(/\.js$/, ".ts");
    return resolve(SRC_ROOT, relative);
  }

  if (specifier.startsWith(".")) {
    const normalized = specifier.endsWith(".js") ? specifier.replace(/\.js$/, ".ts") : specifier;
    const resolved = resolve(dirname(filePath), normalized);
    if (resolved.endsWith(".ts") || resolved.endsWith(".js")) {
      return resolved;
    }
    if (statExists(`${resolved}.ts`)) {
      return `${resolved}.ts`;
    }
    if (statExists(`${resolved}.js`)) {
      return `${resolved}.js`;
    }
    return null;
  }

  return null;
}

function statExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function findImporters(root: string, targetPaths: string[]): string[] {
  return walkTsFiles(root)
    .filter((filePath) => {
      const imports = parseImports(readFileSync(filePath, "utf8"));
      return imports.some((specifier) => {
        const resolved = resolveImportTarget(filePath, specifier);
        return resolved !== null && targetPaths.includes(resolved);
      });
    })
    .map((filePath) => toRel(root, filePath))
    .sort();
}

describe("mci-bci legacy contract contraction", () => {
  it("removes the formulas bridge from the legacy scorecard and signalpack owners", () => {
    const scorecardImporters = findImporters(SRC_ROOT, [SCORECARD_SOURCE, SCORECARD_SOURCE_JS]);
    const signalpackImporters = findImporters(SRC_ROOT, [SIGNALPACK_SOURCE, SIGNALPACK_SOURCE_JS]);
    const patternEngineText = readFileSync(PATTERN_ENGINE_SOURCE, "utf8");
    const signalEngineText = readFileSync(SIGNAL_ENGINE_SOURCE, "utf8");

    expect(scorecardImporters).not.toContain("core/intelligence/mci-bci-formulas.ts");
    expect(scorecardImporters).not.toContain("scoring/scoring-engine.ts");
    expect(scorecardImporters).not.toContain("patterns/pattern-engine.ts");
    expect(scorecardImporters).not.toContain("signals/signal-engine.ts");
    expect(signalpackImporters).not.toContain("core/intelligence/mci-bci-formulas.ts");
    expect(signalpackImporters).not.toContain("scoring/scoring-engine.ts");
    expect(signalpackImporters).not.toContain("patterns/pattern-engine.ts");
    expect(signalpackImporters).not.toContain("signals/signal-engine.ts");

    expect(readFileSync(resolve(SRC_ROOT, "core/intelligence/mci-bci-formulas.ts"), "utf8")).not.toContain(
      "../contracts/scorecard.js"
    );
    expect(readFileSync(resolve(SRC_ROOT, "core/intelligence/mci-bci-formulas.ts"), "utf8")).not.toContain(
      "../contracts/signalpack.js"
    );
    expect(readFileSync(resolve(SRC_ROOT, "scoring/scoring-engine.ts"), "utf8")).not.toContain(
      "../core/contracts/scorecard.js"
    );
    expect(readFileSync(resolve(SRC_ROOT, "scoring/scoring-engine.ts"), "utf8")).not.toContain(
      "../core/contracts/signalpack.js"
    );
    expect(patternEngineText).toContain("../core/intelligence/mci-bci-formulas.js");
    expect(patternEngineText).not.toContain("../core/contracts/scorecard.js");
    expect(patternEngineText).not.toContain("../core/contracts/signalpack.js");
    expect(signalEngineText).toContain("../core/intelligence/mci-bci-formulas.js");
    expect(signalEngineText).not.toContain("../core/contracts/scorecard.js");
  });

  it("keeps the legacy scorecard and signalpack residue test-only where still justified", () => {
    const scorecardTestImporters = findImporters(TEST_ROOT, [SCORECARD_SOURCE, SCORECARD_SOURCE_JS]);
    const signalpackTestImporters = findImporters(TEST_ROOT, [SIGNALPACK_SOURCE, SIGNALPACK_SOURCE_JS]);

    const patternImporters = findImporters(SRC_ROOT, [PATTERN_ENGINE_SOURCE, PATTERN_ENGINE_SOURCE_JS]);
    const patternTestImporters = findImporters(TEST_ROOT, [PATTERN_ENGINE_SOURCE, PATTERN_ENGINE_SOURCE_JS]);
    const signalImporters = findImporters(SRC_ROOT, [SIGNAL_ENGINE_SOURCE, SIGNAL_ENGINE_SOURCE_JS]);
    const signalTestImporters = findImporters(TEST_ROOT, [SIGNAL_ENGINE_SOURCE, SIGNAL_ENGINE_SOURCE_JS]);

    expect(scorecardTestImporters).toEqual([
      "contracts/contracts-bootstrap.test.ts",
      "golden-tasks/golden-tasks-extended.test.ts",
    ]);
    expect(signalpackTestImporters).toEqual([
      "contracts/contracts-bootstrap.test.ts",
      "golden-tasks/golden-tasks-extended.test.ts",
    ]);
    expect(scorecardTestImporters).not.toContain("core/intelligence/mci-bci-formulas.ts");
    expect(signalpackTestImporters).not.toContain("core/intelligence/mci-bci-formulas.ts");
    expect(scorecardTestImporters).not.toContain("scoring/scoring-engine.ts");
    expect(signalpackTestImporters).not.toContain("scoring/scoring-engine.ts");

    expect(patternImporters).toEqual(["core/orchestrator.ts", "index.ts"]);
    expect(patternTestImporters).toEqual([
      "golden-tasks/golden-tasks-extended.test.ts",
      "integration/decision-path-convergence.test.ts",
    ]);

    expect(signalImporters).toEqual([]);
    expect(signalTestImporters).toEqual([
      "integration/decision-path-convergence.test.ts",
      "migration/parity-harness.ts",
      "unit/runtime-truthfulness.test.ts",
    ]);
  });
});
