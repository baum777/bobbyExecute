import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SRC_ROOT = resolve(process.cwd(), "src");
const TEST_ROOT = resolve(process.cwd(), "tests");
const SCORECARD_SOURCE = resolve(SRC_ROOT, "core/contracts/scorecard.ts");
const SCORECARD_SOURCE_JS = SCORECARD_SOURCE.replace(/\.ts$/, ".js");
const SIGNALPACK_SOURCE = resolve(SRC_ROOT, "core/contracts/signalpack.ts");
const SIGNALPACK_SOURCE_JS = SIGNALPACK_SOURCE.replace(/\.ts$/, ".js");

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

describe("orchestrator legacy contract contraction", () => {
  it("removes the orchestrator and decision projection from scorecard and signalpack owners", () => {
    const scorecardImporters = findImporters(SRC_ROOT, [SCORECARD_SOURCE, SCORECARD_SOURCE_JS]);
    const signalpackImporters = findImporters(SRC_ROOT, [SIGNALPACK_SOURCE, SIGNALPACK_SOURCE_JS]);

    expect(scorecardImporters).not.toContain("core/orchestrator.ts");
    expect(scorecardImporters).not.toContain("core/decision/decision-result-derivation.ts");
    expect(signalpackImporters).not.toContain("core/orchestrator.ts");

    expect(readFileSync(resolve(SRC_ROOT, "core/orchestrator.ts"), "utf8")).not.toContain(
      "./contracts/scorecard.js"
    );
    expect(readFileSync(resolve(SRC_ROOT, "core/orchestrator.ts"), "utf8")).not.toContain(
      "./contracts/signalpack.js"
    );
    expect(readFileSync(resolve(SRC_ROOT, "core/decision/decision-result-derivation.ts"), "utf8")).not.toContain(
      "../contracts/scorecard.js"
    );
  });

  it("keeps the remaining scorecard and signalpack residue test-only where still justified", () => {
    const scorecardTestImporters = findImporters(TEST_ROOT, [SCORECARD_SOURCE, SCORECARD_SOURCE_JS]);
    const signalpackTestImporters = findImporters(TEST_ROOT, [SIGNALPACK_SOURCE, SIGNALPACK_SOURCE_JS]);

    expect(scorecardTestImporters).toEqual([
      "contracts/contracts-bootstrap.test.ts",
      "golden-tasks/golden-tasks-extended.test.ts",
    ]);
    expect(signalpackTestImporters).toEqual([
      "contracts/contracts-bootstrap.test.ts",
      "golden-tasks/golden-tasks-extended.test.ts",
    ]);
  });
});
