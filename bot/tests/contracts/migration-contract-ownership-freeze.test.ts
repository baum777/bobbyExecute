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
    expect(runtimeCycleRepo).toContain("sole canonical decision-history truth");
    expect(runtimeCycleRepo).toContain("Provenance/support context only, not canonical decision history.");
    expect(actionLog).toContain("action logs are derived support only");
    expect(actionLog).toContain("Canonical decision history is the runtime cycle summary `decisionEnvelope`; action logs are never canonical truth.");
  });

  it("keeps decision-history surfaces classified as canonical, derived, and provenance context only", () => {
    const surfaces = [
      {
        path: "persistence/runtime-cycle-summary-repository.ts",
        classification: "canonical decision-history",
        why: "Runtime cycle summaries are the sole canonical decision-history home.",
        markers: [
          "Primary canonical decision-history artifact for this cycle; sole canonical decision-history truth for persistence/projection semantics.",
          "Provenance/support context only, not canonical decision history.",
          "decisionEnvelope?: DecisionEnvelope",
        ],
      },
      {
        path: "runtime/shadow-artifact-chain.ts",
        classification: "shadow/provenance context",
        why: "Shadow parity artifacts are derived-only provenance and never canonical decision history.",
        markers: [
          "Derived-only parity scaffold; never authority-canonical.",
          "Provenance/support context only, not canonical decision history.",
        ],
      },
      {
        path: "runtime/authority-artifact-chain.ts",
        classification: "shadow/provenance context",
        why: "Authority artifact-chain summaries are provenance/support context and not the canonical decision-history record.",
        markers: [
          "Provenance/support context only, not canonical decision history.",
          "delegates authority to legacy scoring/signal modules.",
        ],
      },
      {
        path: "observability/action-log.ts",
        classification: "derived projection/support",
        why: "Action logs are derived audit support only and never canonical decision history.",
        markers: [
          "action logs are derived support only",
          "Canonical decision history is the runtime cycle summary `decisionEnvelope`; action logs are never canonical truth.",
        ],
      },
      {
        path: "server/contracts/kpi.ts",
        classification: "derived projection/support",
        why: "KPI decisions are runtime-summary projections or legacy action-log projections, not a competing truth source.",
        markers: [
          "canonical = runtime cycle summary `decisionEnvelope` only.",
          "derived = action log projection only (legacy compatibility only).",
          "Present when provenanceKind is canonical and sourced from the runtime cycle summary `decisionEnvelope`.",
          "Optional second provider output when `compare=true`; never merged into truth or canonical decision history.",
        ],
      },
      {
        path: "server/routes/kpi.ts",
        classification: "derived projection/support",
        why: "KPI routes project canonical cycle summaries and legacy action-log support, but do not define decision truth.",
        markers: [
          "Canonical projection: runtime cycle summary `decisionEnvelope` only.",
          "Legacy derived projection: action log support only, never canonical decision history.",
        ],
      },
      {
        path: "core/contracts/journal.ts",
        classification: "derived projection/support",
        why: "Journal entries are append-only audit support, not the canonical decision-history record.",
        markers: [
          "Derived audit support only; never canonical decision history.",
          "Journal entry - append-only audit log.",
        ],
      },
      {
        path: "persistence/journal-repository.ts",
        classification: "derived projection/support",
        why: "Journal persistence remains a fail-closed audit trail and does not claim canonical decision truth.",
        markers: [
          "Derived audit trail only; never canonical decision history.",
          "Derived audit log only; canonical decision history lives in runtime cycle summaries.",
        ],
      },
    ] as const;
    const allowedClassifications = [
      "canonical decision-history",
      "derived projection/support",
      "shadow/provenance context",
      "compatibility residue / non-canonical",
    ] as const;

    for (const surface of surfaces) {
      const text = readSrc(surface.path);
      expect(surface.why, `${surface.path} must state why it is non-canonical`).toBeTruthy();
      expect(allowedClassifications).toContain(surface.classification);
      for (const marker of surface.markers) {
        expect(text, `${surface.path} is missing marker: ${marker}`).toContain(marker);
      }
    }
  });
});
