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
    const runtimeTruth = readSrc("server/runtime-truth.ts");

    expect(runtimeCycleRepo).toContain("Primary canonical decision-history artifact");
    expect(runtimeCycleRepo).toContain("decisionEnvelope?: DecisionEnvelope");
    expect(runtimeCycleRepo).toContain("sole canonical decision-history truth");
    expect(runtimeCycleRepo).toContain("decisionHistoryRole: RuntimeDecisionHistoryRole");
    expect(runtimeCycleRepo).toContain("Provenance/support context only, not canonical decision history.");
    expect(actionLog).toContain("action logs are derived support only");
    expect(actionLog).toContain("Canonical decision history is the runtime cycle summary `decisionEnvelope`; action logs are never canonical truth.");
    expect(runtimeTruth).toContain("Derived projection of canonical runtime cycle summaries for visibility endpoints.");
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
          "Sidecar-safe replay/enrichment surface; Provenance/support context only, not canonical decision history.",
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
          "Derived runtime visibility projection; embedded recent cycle records may be canonical, but this container is not canonical decision history.",
          "Derived KPI/runtime projection; embedded recent cycle records may be canonical, but this container is not canonical decision history.",
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
        path: "server/runtime-truth.ts",
        classification: "derived projection/support",
        why: "Runtime history helpers project canonical cycle summaries into snapshot shape and do not define decision truth.",
        markers: [
          "Derived projection of canonical runtime cycle summaries for visibility endpoints.",
          "This helper does not create decision truth; it only relays `recentHistory`.",
        ],
      },
      {
        path: "runtime/dry-run-runtime.ts",
        classification: "derived projection/support",
        why: "Replay helpers expose audit/reconstruction views, but the replay container is not canonical decision history.",
        markers: [
          "Derived runtime-summary projection; embedded cycle records may be canonical, but the container is not canonical decision history.",
          "Derived replay artifact; the relayed summary may be canonical, but the replay container is not canonical decision history.",
          "Derived replay view for audit/reconstruction; never upgrades the container into canonical decision history.",
        ],
      },
      {
        path: "server/routes/health.ts",
        classification: "derived projection/support",
        why: "Health exposes a visibility projection, not canonical decision history, even when it carries embedded recent cycles.",
        markers: [
          "Derived health projection only; embedded runtime cycle summaries remain canonical records when present.",
        ],
      },
      {
        path: "server/routes/control.ts",
        classification: "derived projection/support",
        why: "Control status and runtime-status are projection containers over runtime visibility, not canonical decision history.",
        markers: [
          "These are derived control/provenance projections; embedded runtime snapshots may contain canonical cycle records, but the containers are not canonical decision history.",
          "Derived control/status projection; embedded runtime snapshots are visibility context, not canonical decision history.",
          "Derived control/history projection; provenance/support context only.",
        ],
      },
      {
        path: "server/routes/kpi-advisory.ts",
        classification: "derived projection/support",
        why: "Advisory comparisons are read-only projections over canonical decision envelopes.",
        markers: [
          "Derived advisory projection only; canonical decision history remains the runtime cycle summary record.",
        ],
      },
      {
        path: "core/contracts/journal.ts",
        classification: "append-only evidence / provenance context",
        why: "Journal entries are append-only evidence, not the canonical decision-history record.",
        markers: [
          "Append-only evidence / provenance context only; never canonical decision history.",
          "Journal entry - append-only audit log.",
        ],
      },
      {
        path: "persistence/journal-repository.ts",
        classification: "append-only evidence / provenance context",
        why: "Journal persistence remains a fail-closed audit trail and does not claim canonical decision truth.",
        markers: [
          "Append-only evidence / provenance context only; never canonical decision history.",
          "Append-only evidence only; canonical decision history lives in runtime cycle summaries.",
        ],
      },
      {
        path: "agents/journal.agent.ts",
        classification: "append-only evidence / provenance context",
        why: "The journal agent relays append-only evidence and does not define canonical decision history.",
        markers: [
          "Journal agent - append-only evidence relay.",
          "PROPOSED - integrates with ActionLogger and JournalWriter.",
        ],
      },
      {
        path: "persistence/incident-repository.ts",
        classification: "append-only evidence / provenance context",
        why: "Incident records are append-only operational evidence, not canonical decision history.",
        markers: [
          "Incident repository - append-only operational evidence.",
          "Derived provenance/support context only; never canonical decision history.",
        ],
      },
      {
        path: "observability/incidents.ts",
        classification: "append-only evidence / provenance context",
        why: "Incident recording is operational provenance, not a canonical decision-history source.",
        markers: [
          "Append-only provenance context only; never canonical decision history.",
          "Incident counters + runtime incident recorder.",
        ],
      },
      {
        path: "persistence/execution-repository.ts",
        classification: "append-only evidence / provenance context",
        why: "Execution evidence is replay/audit support, not a competing decision-history source.",
        markers: [
          "Append-only evidence / provenance context only; never canonical decision history.",
          "Execution repository - stores execution and refusal evidence for replay/audit.",
        ],
      },
      {
        path: "mcp/manifest.ts",
        classification: "safe prompt-plane surface",
        why: "The MCP manifest is intentionally prompt/resource-plane only and exposes no authority modules.",
        markers: [
          "MCP prompt/resource-plane manifest.",
          "Concrete but intentionally partial: prompt/resource metadata only, zero tools, zero mutators.",
          "Wave 5-02 adds a bounded sidecar-to-MCP bridge; bridged resources remain read-only and non-authoritative.",
          "MCP posture: prompt/resource-plane-only",
          "safe prompt-plane surface",
          "safe read-only resource-plane surface",
          "safe derived replay resource",
          "safe append-only evidence/provenance resource",
          "safe sidecar observational resource",
          "safe sidecar replay/enrichment resource",
          "safe sidecar watchlist-oriented resource",
          "bot://mcp/replay-semantics",
          "bot://mcp/journal-provenance",
          "bot://mcp/sidecar-observation",
          "bot://mcp/sidecar/posture",
          "bot://mcp/sidecar/surface-map",
          "bot://mcp/sidecar/trend-reversal-monitor-runner",
          "bot://mcp/sidecar/shadow-artifact-chain",
          "bot://mcp/sidecar/sidecar-worker-loop",
          "MCP_SIDECAR_BRIDGE_RESOURCES",
        ],
      },
      {
        path: "mcp/sidecar-bridge.ts",
        classification: "safe sidecar-to-MCP bridge surface",
        why: "The sidecar bridge is a bounded, read-only migration layer from sidecar packaging into MCP resources.",
        markers: [
          "Sidecar-to-MCP bridge.",
          "Small, bounded, read-only bridge from sidecar.exposure.v1 into the MCP resource plane.",
          "Observational, replay/enrichment, or watchlist-only. Non-authoritative and fail-closed.",
          "mcp.sidecar-bridge.v1",
          "MCP_SIDECAR_BRIDGE_MANIFEST",
          "MCP_SIDECAR_BRIDGE_RESOURCES",
          "bot://mcp/sidecar/posture",
          "bot://mcp/sidecar/surface-map",
          "bot://mcp/sidecar/trend-reversal-monitor-runner",
          "bot://mcp/sidecar/shadow-artifact-chain",
          "bot://mcp/sidecar/sidecar-worker-loop",
        ],
      },
      {
        path: "mcp/server.ts",
        classification: "safe prompt-plane surface",
        why: "The MCP server skeleton is structurally real but intentionally narrow and non-authoritative.",
        markers: [
          "MCP server skeleton.",
          "prompt/resource plane only, zero tools, zero mutators, fail-closed.",
          "MCP skeleton is prompt/resource-plane only",
        ],
      },
      {
        path: "mcp/bootstrap.ts",
        classification: "safe prompt-plane surface",
        why: "The MCP bootstrap surface is intentionally partial and only instantiates the prompt/resource plane.",
        markers: [
          "MCP bootstrap surface.",
          "prompt/resource-plane only, zero tools, fail-closed.",
        ],
      },
      {
        path: "runtime/sidecar/sidecar-exposure.ts",
        classification: "safe enrichment/replay/watchlist sidecar surface",
        why: "Sidecar packaging is explicit, bounded, and non-authoritative.",
        markers: [
          "Sidecar exposure taxonomy.",
          "Sidecars are observational, enrichment/replay, or watchlist-only.",
          "Non-authoritative: no execution, approval, policy, risk, governance, control, signer, or canonical decision-history ownership.",
          "sidecar.exposure.v1",
          "safe observational sidecar surface",
          "safe enrichment/replay/watchlist sidecar surface",
        ],
      },
      {
        path: "runtime/sidecar/worker-loop.ts",
        classification: "safe observational sidecar surface",
        why: "The sidecar worker loop is observational and replay-safe only.",
        markers: [
          "Sidecar worker loop.",
          "Observational, enrichment/watchlist-oriented only; non-authoritative and replay-safe.",
          "No execution, approval, control, signer, policy, risk, or canonical decision-history authority.",
        ],
      },
      {
        path: "intelligence/forensics/trend-reversal-monitor-runner.ts",
        classification: "safe observational sidecar surface",
        why: "The trend-reversal monitor runner is sidecar-safe and non-authoritative.",
        markers: [
          "Trend reversal monitor runner.",
          "Sidecar-safe observational runner: replay/enrichment/watchlist only, never authority-canonical.",
          "Emits observations, not approvals, blocks, or control decisions.",
        ],
      },
    ] as const;
    const allowedClassifications = [
      "canonical decision-history",
      "derived projection/support",
      "append-only evidence / provenance context",
      "shadow/provenance context",
      "compatibility residue / non-canonical",
      "safe prompt-plane surface",
      "safe read-only resource-plane surface",
      "safe observational sidecar surface",
      "safe enrichment/replay/watchlist sidecar surface",
      "safe sidecar-to-MCP bridge surface",
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
