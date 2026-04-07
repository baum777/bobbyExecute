import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readDoc(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("operator release gate runbook", () => {
  it("links release decisions to real operator surfaces and incident procedures", () => {
    const doc = readDoc("../../../docs/06_journal_replay/operator-release-gate-and-incident-runbook.md");
    expect(doc).toContain("GET /control/release-gate");
    expect(doc).toContain("GET /control/status");
    expect(doc).toContain("GET /health");
    expect(doc).toContain("npm --prefix bot run live:preflight");
    expect(doc).toContain("npm --prefix bot run recovery:worker-state");
    expect(doc).toContain("POST /control/emergency-stop");
    expect(doc).toContain("POST /control/halt");
    expect(doc).toContain("POST /control/live-promotion/:id/rollback");
    expect(doc).toContain("paper_safe");
    expect(doc).toContain("micro_live");
    expect(doc).toContain("constrained_live");
    expect(doc).toContain("blocked");
  });

  it("ties the preflight runbook to the release-gate checklist doc", () => {
    const doc = readDoc("../../../docs/06_journal_replay/staging-live-preflight-runbook.md");
    expect(doc).toContain("operator-release-gate-and-incident-runbook.md");
    expect(doc).toContain("GET /control/release-gate");
    expect(doc).toContain("GET /control/status");
    expect(doc).toContain("GET /health");
  });
});
