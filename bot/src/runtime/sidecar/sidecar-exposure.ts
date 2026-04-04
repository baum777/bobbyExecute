/**
 * Sidecar exposure taxonomy.
 * Sidecars are observational, enrichment/replay, or watchlist-only.
 * Non-authoritative: no execution, approval, policy, risk, governance, control, signer, or canonical decision-history ownership.
 */

export const SIDECAR_PACKAGE_VERSION = "sidecar.exposure.v1" as const;

export type SidecarSurfaceClassification =
  | "safe observational sidecar surface"
  | "safe enrichment/replay/watchlist sidecar surface";

export interface SidecarSurfaceDescriptor {
  kind: "sidecar";
  classification: SidecarSurfaceClassification;
  name: string;
  title: string;
  description: string;
  sourceModule: string;
  allowedOutputs: readonly string[];
  forbiddenOutputs: readonly string[];
}

export interface SidecarExposureManifest {
  version: typeof SIDECAR_PACKAGE_VERSION;
  surfaces: readonly SidecarSurfaceDescriptor[];
}

export const SIDECAR_ALLOWED_OUTPUT_THEMES = [
  "observational",
  "enrichment",
  "replay",
  "watchlist",
] as const;

export const SIDECAR_FORBIDDEN_OUTPUT_THEMES = [
  "approval",
  "blocking authority",
  "authority",
  "execution",
  "signer",
  "policy",
  "risk",
  "governance",
  "control mutation",
  "persistence mutation",
  "canonical decision history ownership",
  "canonicaldecisionhistory",
  "authority shell",
] as const;

export const SIDECAR_ALLOWED_SOURCE_MODULES = [
  "intelligence/forensics/trend-reversal-monitor-runner.ts",
  "runtime/shadow-artifact-chain.ts",
  "runtime/sidecar/worker-loop.ts",
] as const;

export const SIDECAR_FORBIDDEN_MODULE_PATTERNS = [
  /(^|\/)core\/engine\.ts$/,
  /(^|\/)core\/decision\/decision-coordinator\.ts$/,
  /(^|\/)core\/orchestrator\.ts$/,
  /(^|\/)core\/tool-router\.ts$/,
  /(^|\/)runtime\/authority-artifact-chain\.ts$/,
  /(^|\/)runtime\/controller\.ts$/,
  /(^|\/)runtime\/create-runtime\.ts$/,
  /(^|\/)runtime\/dry-run-runtime\.ts$/,
  /(^|\/)runtime\/live-runtime\.ts$/,
  /(^|\/)execution\//,
  /(^|\/)signer\//,
  /(^|\/)governance\//,
  /(^|\/)policy\//,
  /(^|\/)risk\//,
  /(^|\/)control\//,
  /(^|\/)persistence\//,
  /(^|\/)adapters\//,
  /(^|\/)server\/routes\//,
  /(^|\/)observability\/action-log\.ts$/,
  /(^|\/)memory\//,
  /(^|\/)journal-writer\//,
  /(^|\/)core\/contracts\/index\.ts$/,
  /(^|\/)core\/intelligence\/mci-bci-formulas\.ts$/,
  /(^|\/)core\/universe\/token-universe-builder\.ts$/,
  /(^|\/)core\/contracts\/scorecard\.ts$/,
  /(^|\/)core\/contracts\/signalpack\.ts$/,
  /(^|\/)core\/contracts\/tokenuniverse\.ts$/,
] as const;

export const SIDECAR_SURFACES: readonly SidecarSurfaceDescriptor[] = [
  {
    kind: "sidecar",
    classification: "safe observational sidecar surface",
    name: "trend-reversal-monitor-runner",
    title: "Trend Reversal Monitor Runner",
    description:
      "Observational sidecar runner that emits bounded trend-reversal observations from watchlist candidates; non-authoritative and replay-safe.",
    sourceModule: "intelligence/forensics/trend-reversal-monitor-runner.ts",
    allowedOutputs: [
      "checkedCandidates",
      "emittedObservations",
    ],
    forbiddenOutputs: [...SIDECAR_FORBIDDEN_OUTPUT_THEMES],
  },
  {
    kind: "sidecar",
    classification: "safe enrichment/replay/watchlist sidecar surface",
    name: "shadow-artifact-chain",
    title: "Runtime Shadow Artifact Chain",
    description:
      "Derived replay/enrichment sidecar scaffold that compares observed runtime artifacts; non-authoritative and never canonical decision history.",
    sourceModule: "runtime/shadow-artifact-chain.ts",
    allowedOutputs: [
      "artifactMode",
      "derivedOnly",
      "nonAuthoritative",
      "parity",
      "artifacts",
    ],
    forbiddenOutputs: [...SIDECAR_FORBIDDEN_OUTPUT_THEMES],
  },
  {
    kind: "sidecar",
    classification: "safe observational sidecar surface",
    name: "sidecar-worker-loop",
    title: "Sidecar Worker Loop",
    description:
      "Watchlist-oriented sidecar loop that accepts discovery candidates and emits bounded monitor observations; observational only.",
    sourceModule: "runtime/sidecar/worker-loop.ts",
    allowedOutputs: [
      "discoveredCandidates",
      "acceptedCandidates",
      "prunedCandidates",
      "monitorResult.checkedCandidates",
      "monitorResult.emittedObservations",
    ],
    forbiddenOutputs: [...SIDECAR_FORBIDDEN_OUTPUT_THEMES],
  },
] as const;

export const SIDECAR_EXPOSURE_MANIFEST: SidecarExposureManifest = {
  version: SIDECAR_PACKAGE_VERSION,
  surfaces: SIDECAR_SURFACES,
};

function assertNotForbiddenModule(sourceModule: string, context: string): void {
  const allowedSourceModule = sourceModule as (typeof SIDECAR_ALLOWED_SOURCE_MODULES)[number];
  if (!SIDECAR_ALLOWED_SOURCE_MODULES.includes(allowedSourceModule)) {
    throw new Error(`SIDECAR_FORBIDDEN_MODULE:${context}:${sourceModule}`);
  }

  for (const pattern of SIDECAR_FORBIDDEN_MODULE_PATTERNS) {
    if (pattern.test(sourceModule)) {
      throw new Error(`SIDECAR_FORBIDDEN_MODULE:${context}:${sourceModule}`);
    }
  }
}

export function assertSidecarExposureOnly(manifest: SidecarExposureManifest): void {
  if (manifest.version !== SIDECAR_PACKAGE_VERSION) {
    throw new Error(`SIDECAR_INVALID_VERSION:${manifest.version}`);
  }
  if (manifest.surfaces.length === 0) {
    throw new Error("SIDECAR_SURFACES_MISSING");
  }

  for (const surface of manifest.surfaces) {
    if (surface.kind !== "sidecar") {
      throw new Error(`SIDECAR_INVALID_SURFACE_KIND:${surface.name}`);
    }
    if (
      surface.classification !== "safe observational sidecar surface" &&
      surface.classification !== "safe enrichment/replay/watchlist sidecar surface"
    ) {
      throw new Error(`SIDECAR_INVALID_SURFACE_CLASSIFICATION:${surface.name}`);
    }
    if (surface.allowedOutputs.length === 0) {
      throw new Error(`SIDECAR_ALLOWED_OUTPUTS_MISSING:${surface.name}`);
    }
    if (surface.forbiddenOutputs.length === 0) {
      throw new Error(`SIDECAR_FORBIDDEN_OUTPUTS_MISSING:${surface.name}`);
    }
    if (surface.allowedOutputs.some((output) => output.trim().length === 0)) {
      throw new Error(`SIDECAR_EMPTY_ALLOWED_OUTPUT:${surface.name}`);
    }
    if (surface.forbiddenOutputs.some((output) => output.trim().length === 0)) {
      throw new Error(`SIDECAR_EMPTY_FORBIDDEN_OUTPUT:${surface.name}`);
    }
    if (
      surface.allowedOutputs.some((output) =>
        SIDECAR_FORBIDDEN_OUTPUT_THEMES.some((forbidden) =>
          output.toLowerCase().includes(forbidden.toLowerCase())
        )
      )
    ) {
      throw new Error(`SIDECAR_FORBIDDEN_OUTPUT_PRESENT:${surface.name}`);
    }

    assertNotForbiddenModule(surface.sourceModule, `surface:${surface.name}`);
  }
}
