import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertSidecarExposureOnly,
  SIDECAR_ALLOWED_OUTPUT_THEMES,
  SIDECAR_ALLOWED_SOURCE_MODULES,
  SIDECAR_EXPOSURE_MANIFEST,
  SIDECAR_FORBIDDEN_MODULE_PATTERNS,
  SIDECAR_FORBIDDEN_OUTPUT_THEMES,
} from "../../src/runtime/sidecar/sidecar-exposure.js";

const SRC_ROOT = resolve(process.cwd(), "src");

describe("sidecar exposure boundary", () => {
  it("keeps the sidecar package explicit, bounded, and non-authoritative", () => {
    expect(SIDECAR_EXPOSURE_MANIFEST.version).toBe("sidecar.exposure.v1");
    expect(SIDECAR_EXPOSURE_MANIFEST.surfaces).toHaveLength(3);
    expect(SIDECAR_EXPOSURE_MANIFEST.surfaces.map((surface) => surface.name)).toEqual([
      "trend-reversal-monitor-runner",
      "shadow-artifact-chain",
      "sidecar-worker-loop",
    ]);
    expect(SIDECAR_EXPOSURE_MANIFEST.surfaces.map((surface) => surface.sourceModule)).toEqual([
      "intelligence/forensics/trend-reversal-monitor-runner.ts",
      "runtime/shadow-artifact-chain.ts",
      "runtime/sidecar/worker-loop.ts",
    ]);

    for (const surface of SIDECAR_EXPOSURE_MANIFEST.surfaces) {
      expect(surface.kind).toBe("sidecar");
      expect(surface.allowedOutputs.length).toBeGreaterThan(0);
      expect(surface.forbiddenOutputs).toEqual([...SIDECAR_FORBIDDEN_OUTPUT_THEMES]);
      expect(SIDECAR_ALLOWED_SOURCE_MODULES).toContain(surface.sourceModule as never);

      for (const output of surface.allowedOutputs) {
        expect(output).toMatch(/\S/);
        for (const forbidden of SIDECAR_FORBIDDEN_OUTPUT_THEMES) {
          expect(output.toLowerCase(), `${surface.name} must not expose forbidden theme ${forbidden}`).not.toContain(
            forbidden.toLowerCase()
          );
        }
      }
    }

    expect(SIDECAR_ALLOWED_OUTPUT_THEMES).toEqual([
      "observational",
      "enrichment",
      "replay",
      "watchlist",
    ]);

    expect(() => assertSidecarExposureOnly(SIDECAR_EXPOSURE_MANIFEST)).not.toThrow();
  });

  it("fails closed when forbidden authority-sensitive or broad surfaces are injected", () => {
    expect(() =>
      assertSidecarExposureOnly({
        ...SIDECAR_EXPOSURE_MANIFEST,
        surfaces: [
          ...SIDECAR_EXPOSURE_MANIFEST.surfaces,
          {
            ...SIDECAR_EXPOSURE_MANIFEST.surfaces[0],
            sourceModule: "runtime/live-runtime.ts",
          },
        ],
      })
    ).toThrow(/SIDECAR_FORBIDDEN_MODULE/);

    expect(() =>
      assertSidecarExposureOnly({
        ...SIDECAR_EXPOSURE_MANIFEST,
        surfaces: [
          ...SIDECAR_EXPOSURE_MANIFEST.surfaces,
          {
            ...SIDECAR_EXPOSURE_MANIFEST.surfaces[0],
            allowedOutputs: ["approval"],
          },
        ],
      })
    ).toThrow(/SIDECAR_FORBIDDEN_OUTPUT_PRESENT/);
  });

  it("keeps the package root unextended for sidecar packaging", () => {
    const rootIndex = readFileSync(resolve(SRC_ROOT, "index.ts"), "utf8");
    expect(rootIndex).not.toContain("./runtime/sidecar/");
  });
});
