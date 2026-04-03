import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const BOT_ROOT = existsSync(resolve(process.cwd(), "bot", "src"))
  ? resolve(process.cwd(), "bot")
  : process.cwd();
const SRC_ROOT = resolve(BOT_ROOT, "src");
const TEST_ROOT = resolve(BOT_ROOT, "tests");

type ZeroAuthorityClass =
  | "compatibility-only non-authoritative"
  | "test-only non-authoritative"
  | "bridge/support-only non-authoritative"
  | "dead/remove-later";
type Disposition = "keep" | "freeze" | "remove-later";

interface DirectSubpathSurface {
  path: string;
  zeroAuthorityClass: ZeroAuthorityClass;
  disposition: Disposition;
  whyNonAuthoritative: string;
  markers: string[];
  patterns: RegExp[];
  allowedImporters: string[];
}

const DIRECT_SUBPATH_SURFACES: DirectSubpathSurface[] = [
  {
    path: "core/orchestrator.ts",
    zeroAuthorityClass: "compatibility-only non-authoritative",
    disposition: "freeze",
    whyNonAuthoritative:
      "Legacy orchestrator bridge retained only for migration and test compatibility; it does not own runtime authority or canonical decision history.",
    markers: [
      "Zero-authority residue only.",
      "no canonical decision-history authority.",
    ],
    patterns: [/\/core\/orchestrator\.js$/],
    allowedImporters: [
      "tests/e2e/determinism.test.ts",
      "tests/e2e/fail-closed.test.ts",
      "tests/e2e/full-pipeline.test.ts",
      "tests/golden-tasks/golden-tasks-extended.test.ts",
      "tests/integration/decision-envelope-convergence.test.ts",
      "tests/storage/idempotency.test.ts",
      "tests/unit/orchestrator-authority.test.ts",
    ],
  },
  {
    path: "core/tool-router.ts",
    zeroAuthorityClass: "dead/remove-later",
    disposition: "remove-later",
    whyNonAuthoritative:
      "No current callers remain; this is a dead legacy entry surface kept only for removal sequencing.",
    markers: [
      "Zero-authority residue only.",
      "no new production callers, no canonical decision-history authority.",
    ],
    patterns: [/\/core\/tool-router\.js$/],
    allowedImporters: [],
  },
  {
    path: "memory/index.ts",
    zeroAuthorityClass: "dead/remove-later",
    disposition: "remove-later",
    whyNonAuthoritative:
      "No current callers remain; this barrel is retained only as a remove-later compatibility stub.",
    markers: [
      "Zero-authority residue only.",
      "Retained temporarily for migration/test support only; no new production callers.",
    ],
    patterns: [/\/memory\/index\.js$/],
    allowedImporters: [],
  },
  {
    path: "memory/memory-db.ts",
    zeroAuthorityClass: "bridge/support-only non-authoritative",
    disposition: "freeze",
    whyNonAuthoritative:
      "Support-only persistence bridge used by the legacy orchestrator and explicit tests; it does not determine runtime authority.",
    markers: [
      "Zero-authority residue only.",
      "no canonical decision-history authority.",
    ],
    patterns: [/\/memory\/memory-db\.js$/],
    allowedImporters: [
      "src/core/orchestrator.ts",
      "tests/golden-tasks/golden-tasks-extended.test.ts",
      "tests/memory/memory-db-flush.test.ts",
    ],
  },
  {
    path: "memory/log-append.ts",
    zeroAuthorityClass: "bridge/support-only non-authoritative",
    disposition: "freeze",
    whyNonAuthoritative:
      "Support-only journaling bridge used by the legacy orchestrator path; it does not produce canonical decision authority.",
    markers: [
      "Zero-authority residue only.",
      "no canonical decision-history authority.",
    ],
    patterns: [/\/memory\/log-append\.js$/],
    allowedImporters: ["src/core/orchestrator.ts"],
  },
  {
    path: "signals/signal-engine.ts",
    zeroAuthorityClass: "test-only non-authoritative",
    disposition: "freeze",
    whyNonAuthoritative:
      "Test/parity-only surface retained for migration coverage; it is not part of the runtime authority path.",
    markers: [
      "Zero-authority residue only.",
      "Not part of the canonical BobbyExecute v2 authority path.",
    ],
    patterns: [/\/signals\/signal-engine\.js$/],
    allowedImporters: [
      "tests/integration/decision-path-convergence.test.ts",
      "tests/migration/parity-harness.ts",
      "tests/unit/runtime-truthfulness.test.ts",
    ],
  },
  {
    path: "scoring/scoring-engine.ts",
    zeroAuthorityClass: "test-only non-authoritative",
    disposition: "freeze",
    whyNonAuthoritative:
      "Test/parity-only surface retained for migration coverage; it is not part of the runtime authority path.",
    markers: [
      "Zero-authority residue only.",
      "Not part of the canonical BobbyExecute v2 authority path.",
    ],
    patterns: [/\/scoring\/scoring-engine\.js$/],
    allowedImporters: [
      "tests/integration/decision-path-convergence.test.ts",
      "tests/migration/parity-harness.ts",
      "tests/unit/runtime-truthfulness.test.ts",
    ],
  },
  {
    path: "core/contracts/index.ts",
    zeroAuthorityClass: "dead/remove-later",
    disposition: "remove-later",
    whyNonAuthoritative:
      "No current callers remain; this barrel is retained only as a remove-later compatibility stub.",
    markers: [
      "Zero-authority residue only.",
      "Not part of the canonical BobbyExecute v2 authority path.",
    ],
    patterns: [/\/core\/contracts\/index\.js$/],
    allowedImporters: [],
  },
  {
    path: "core/intelligence/mci-bci-formulas.ts",
    zeroAuthorityClass: "bridge/support-only non-authoritative",
    disposition: "freeze",
    whyNonAuthoritative:
      "Legacy formula bridge retained for deterministic parity and compatibility; it does not define runtime authority or decision history.",
    markers: [
      "Zero-authority residue only.",
      "no canonical decision-history authority.",
    ],
    patterns: [/\/core\/intelligence\/mci-bci-formulas\.js$/],
    allowedImporters: [
      "src/scoring/scoring-engine.ts",
      "tests/contracts/contracts-bootstrap.test.ts",
      "tests/intelligence/hybrid-weights.test.ts",
    ],
  },
  {
    path: "core/universe/token-universe-builder.ts",
    zeroAuthorityClass: "test-only non-authoritative",
    disposition: "freeze",
    whyNonAuthoritative:
      "Test/parity-only universe bridge retained for migration coverage; it does not define runtime authority.",
    markers: [
      "Zero-authority residue only.",
      "Legacy non-surviving lineage; not canonical future path.",
    ],
    patterns: [/\/core\/universe\/token-universe-builder\.js$/],
    allowedImporters: [
      "tests/core/universe-builder.test.ts",
      "tests/migration/parity-harness.ts",
    ],
  },
  {
    path: "core/contracts/scorecard.ts",
    zeroAuthorityClass: "bridge/support-only non-authoritative",
    disposition: "freeze",
    whyNonAuthoritative:
      "Compatibility contract consumed by deterministic builders and bridge modules; it does not author runtime authority decisions.",
    markers: [
      "Zero-authority residue only.",
      "Compatibility-only legacy contract surface; not part",
      "Legacy non-surviving lineage; not canonical future path.",
    ],
    patterns: [/\/core\/contracts\/scorecard\.js$/],
    allowedImporters: [
      "src/patterns/pattern-engine.ts",
      "src/scoring/scoring-engine.ts",
      "src/signals/signal-engine.ts",
      "tests/contracts/contracts-bootstrap.test.ts",
      "tests/fixtures/decision-envelope.fixtures.ts",
      "tests/golden-tasks/golden-tasks-extended.test.ts",
    ],
  },
  {
    path: "core/contracts/signalpack.ts",
    zeroAuthorityClass: "bridge/support-only non-authoritative",
    disposition: "freeze",
    whyNonAuthoritative:
      "Compatibility contract consumed by deterministic builders and bridge modules; it does not author runtime authority decisions.",
    markers: [
      "Zero-authority residue only.",
      "Compatibility-only legacy contract surface; not part",
      "Legacy non-surviving lineage; not canonical future path.",
    ],
    patterns: [/\/core\/contracts\/signalpack\.js$/],
    allowedImporters: [
      "src/patterns/pattern-engine.ts",
      "src/scoring/scoring-engine.ts",
      "tests/contracts/contracts-bootstrap.test.ts",
      "tests/e2e/determinism.test.ts",
      "tests/e2e/fail-closed.test.ts",
      "tests/e2e/full-pipeline.test.ts",
      "tests/fixtures/decision-envelope.fixtures.ts",
      "tests/golden-tasks/golden-tasks-extended.test.ts",
      "tests/integration/decision-path-convergence.test.ts",
      "tests/migration/parity-harness.ts",
      "tests/unit/orchestrator-authority.test.ts",
      "tests/unit/runtime-truthfulness.test.ts",
    ],
  },
  {
    path: "core/contracts/tokenuniverse.ts",
    zeroAuthorityClass: "bridge/support-only non-authoritative",
    disposition: "freeze",
    whyNonAuthoritative:
      "Compatibility contract consumed by deterministic quality/build helpers; it does not author runtime authority decisions.",
    markers: [
      "Zero-authority residue only.",
      "Compatibility-only legacy contract surface; not part",
      "Legacy non-surviving lineage; not canonical future path.",
    ],
    patterns: [/\/core\/contracts\/tokenuniverse\.js$/],
    allowedImporters: [
      "src/adapters/dexscreener/mapper.ts",
      "src/intelligence/quality/build-data-quality.ts",
      "tests/contracts/tokenuniverse.test.ts",
      "tests/core/universe-builder.test.ts",
    ],
  },
];

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
  return relative(BOT_ROOT, absPath).replaceAll("\\", "/");
}

function readBotFile(relPath: string): string {
  return readFileSync(resolve(BOT_ROOT, relPath), "utf8");
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

function resolveRelativeImport(fromAbsPath: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const candidateBase = resolve(dirname(fromAbsPath), specifier);
  const candidates = [
    candidateBase,
    candidateBase.replace(/\.js$/u, ".ts"),
    candidateBase.replace(/\.js$/u, ".tsx"),
    resolve(candidateBase, "index.ts"),
    resolve(candidateBase, "index.tsx"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function findImporters(patterns: RegExp[]): string[] {
  const matcher = patterns.map((pattern) => new RegExp(pattern.source, pattern.flags));

  return [...walkTsFiles(SRC_ROOT), ...walkTsFiles(TEST_ROOT)]
    .filter((filePath) => {
      const imports = parseImports(readFileSync(filePath, "utf8"));
      return imports.some((specifier) => matcher.some((pattern) => pattern.test(specifier)));
    })
    .map(toRel)
    .sort();
}

function collectReachableSourceFiles(
  entrypoints: string[],
  stopFiles: Set<string> = new Set()
): string[] {
  const reachable = new Set<string>();
  const queue = entrypoints.map((relPath) => resolve(BOT_ROOT, relPath));

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || reachable.has(current)) {
      continue;
    }

    reachable.add(current);
    const relPath = toRel(current);
    if (stopFiles.has(relPath)) {
      continue;
    }

    for (const specifier of parseImports(readFileSync(current, "utf8"))) {
      const resolved = resolveRelativeImport(current, specifier);
      if (resolved && resolved.startsWith(SRC_ROOT)) {
        queue.push(resolved);
      }
    }
  }

  return [...reachable].map(toRel).sort();
}

function importViolations(relPath: string, legacyPatterns: RegExp[]): string[] {
  const imports = parseImports(readBotFile(relPath));
  return imports.filter((specifier) => legacyPatterns.some((pattern) => pattern.test(specifier)));
}

describe("direct-subpath legacy entry surface freeze", () => {
  it("keeps retained legacy entry surfaces explicitly marked", () => {
    for (const entry of DIRECT_SUBPATH_SURFACES) {
      const fileText = readBotFile(`src/${entry.path}`);
      for (const marker of entry.markers) {
        expect(fileText, `${entry.path} is missing marker: ${marker}`).toContain(marker);
      }
      expect(entry.whyNonAuthoritative, `${entry.path} must explain why it is non-authoritative`).toBeTruthy();
    }
  });

  it("keeps the direct-subpath caller inventory frozen", () => {
    for (const entry of DIRECT_SUBPATH_SURFACES) {
      const currentImporters = findImporters(entry.patterns);
      expect(
        currentImporters,
        `${entry.path} caller inventory drift (${entry.zeroAuthorityClass}, ${entry.disposition})`
      ).toEqual(entry.allowedImporters);
    }
  });

  it("keeps retained legacy residues out of the runtime authority boundary and canonical decision history", () => {
    const authorityBoundaryFiles = [
      "src/core/engine.ts",
      "src/core/decision/decision-coordinator.ts",
      "src/runtime/authority-artifact-chain.ts",
      "src/runtime/controller.ts",
      "src/runtime/create-runtime.ts",
      "src/runtime/dry-run-runtime.ts",
      "src/runtime/live-runtime.ts",
      "src/runtime/paper-runtime.ts",
      "src/runtime/runtime-config-manager.ts",
      "src/risk/risk-engine.ts",
      "src/execution/execution-engine.ts",
      "src/governance/policy-engine.ts",
      "src/persistence/runtime-cycle-summary-repository.ts",
    ];
    const bridgeSupportStopFiles = new Set<string>(["src/intelligence/quality/build-data-quality.ts"]);
    const legacyPatterns = DIRECT_SUBPATH_SURFACES.flatMap((entry) => entry.patterns);
    const reachable = collectReachableSourceFiles(authorityBoundaryFiles, bridgeSupportStopFiles);

    for (const relPath of reachable) {
      if (bridgeSupportStopFiles.has(relPath)) {
        expect(relPath).toBe("src/intelligence/quality/build-data-quality.ts");
        continue;
      }

      const violations = importViolations(relPath, legacyPatterns);
      expect(
        violations,
        `${relPath} must not re-enter retained legacy direct subpaths through the authority boundary`
      ).toEqual([]);
    }

    const runtimeSummaryRepository = readBotFile("src/persistence/runtime-cycle-summary-repository.ts");
    expect(runtimeSummaryRepository).toContain("Primary canonical decision-history artifact");
    expect(runtimeSummaryRepository).toContain("Canonical upstream authority chain after PR-M1-02 cutover.");
    expect(runtimeSummaryRepository).toContain(
      "Shadow-only deterministic parity scaffold; derived support only and never authority-canonical."
    );
    expect(runtimeSummaryRepository).toContain("decisionEnvelope");
    expect(runtimeSummaryRepository).not.toContain("core/orchestrator.ts");
    expect(runtimeSummaryRepository).not.toContain("core/tool-router.ts");
    expect(runtimeSummaryRepository).not.toContain("memory/memory-db.ts");
    expect(runtimeSummaryRepository).not.toContain("memory/log-append.ts");
    expect(runtimeSummaryRepository).not.toContain("signals/signal-engine.ts");
    expect(runtimeSummaryRepository).not.toContain("scoring/scoring-engine.ts");
    expect(runtimeSummaryRepository).not.toContain("core/intelligence/mci-bci-formulas.ts");
    expect(runtimeSummaryRepository).not.toContain("core/universe/token-universe-builder.ts");
    expect(runtimeSummaryRepository).not.toContain("core/contracts/scorecard.ts");
    expect(runtimeSummaryRepository).not.toContain("core/contracts/signalpack.ts");
    expect(runtimeSummaryRepository).not.toContain("core/contracts/tokenuniverse.ts");
  });
});
