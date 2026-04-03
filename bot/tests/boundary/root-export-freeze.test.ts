import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SRC_ROOT = resolve(process.cwd(), "src");

const ROOT_EXPORT_SURFACE = [
  { specifier: "./core/clock.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/engine.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/determinism/hash.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/determinism/canonicalize.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/contracts/riskbreakdown.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/contracts/agent.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/contracts/dataquality.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/contracts/decision-envelope.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/contracts/decision.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/contracts/decisionresult.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/contracts/intent.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/contracts/journal.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/contracts/market.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/contracts/pattern.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/contracts/trade.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/contracts/wallet.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/contracts/cqd.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/normalize/normalizer.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/validate/cross-source-validator.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./governance/policy-engine.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./governance/tool-permissions.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./governance/guardrails.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./governance/circuit-breaker.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./governance/kill-switch.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./config/safety.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./governance/daily-loss-tracker.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./governance/review-gates.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./governance/chaos-gate.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./observability/action-log.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./observability/trace-id.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/config/rpc.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./adapters/rpc-verify/client.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./adapters/http-resilience.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./adapters/adapters-with-cb.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./storage/idempotency-store.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./storage/inmemory-kv.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./eventbus/index.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./journal-writer/index.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./config-loader/index.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./observability/health.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./observability/metrics.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./observability/incidents.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./chaos/index.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./patterns/pattern-engine.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./server/index.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./adapters/dexscreener/client.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./adapters/dexscreener/types.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./adapters/dexscreener/mapper.js", classification: "canonical/survivor", disposition: "keep" },
  { specifier: "./core/tool-router.js", classification: "compatibility-only legacy", disposition: "remove-later" },
  { specifier: "./core/orchestrator.js", classification: "compatibility-only legacy", disposition: "remove-later" },
  { specifier: "./core/contracts/index.js", classification: "compatibility-only legacy", disposition: "remove-later" },
  { specifier: "./core/intelligence/mci-bci-formulas.js", classification: "compatibility-only legacy", disposition: "remove-later" },
  { specifier: "./core/universe/token-universe-builder.js", classification: "compatibility-only legacy", disposition: "remove-later" },
  { specifier: "./memory/index.js", classification: "compatibility-only legacy", disposition: "remove-later" },
  { specifier: "./core/contracts/scorecard.js", classification: "compatibility-only legacy", disposition: "remove-later" },
  { specifier: "./core/contracts/signalpack.js", classification: "compatibility-only legacy", disposition: "remove-later" },
  { specifier: "./core/contracts/tokenuniverse.js", classification: "compatibility-only legacy", disposition: "remove-later" },
] as const;

const LEGACY_ROOT_SPECIFIERS = ROOT_EXPORT_SURFACE.filter(
  (entry) => entry.disposition === "remove-later"
).map((entry) => entry.specifier);

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

function parseExportSpecifiers(text: string): string[] {
  const exports: string[] = [];
  const pattern = /export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    exports.push(match[1]);
    match = pattern.exec(text);
  }
  return exports;
}

function findImporters(specifierPattern: RegExp): string[] {
  return walkTsFiles(SRC_ROOT)
    .filter((filePath) =>
      parseImports(readFileSync(filePath, "utf8")).some((specifier) => specifierPattern.test(specifier))
    )
    .map(toRel)
    .sort();
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

describe("package root export freeze", () => {
  it("keeps the root surface canonical-only and blocks legacy re-export creep", () => {
    const rootIndex = readSrc("index.ts");
    const actual = [...new Set(parseExportSpecifiers(rootIndex))].sort();
    const expected = [...new Set(
      ROOT_EXPORT_SURFACE.filter((entry) => entry.classification === "canonical/survivor")
        .map((entry) => entry.specifier)
    )].sort();

    expect(actual).toEqual(expected);
    expect(rootIndex).not.toMatch(/export\s+\*\s+from\s+"\.\/core\/contracts\/index\.js";/);

    for (const specifier of LEGACY_ROOT_SPECIFIERS) {
      expect(rootIndex, `${specifier} must not be re-exported from the package root`).not.toContain(specifier);
    }
  });

  it("keeps production src off the package root barrel", () => {
    expect(findImporters(/^(?:\.\.\/)+index\.js$|^@bot\/index\.js$/)).toEqual([]);
  });
});
