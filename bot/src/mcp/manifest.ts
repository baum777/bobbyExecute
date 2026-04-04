/**
 * MCP prompt/resource-plane manifest.
 * Concrete but intentionally partial: prompt/resource metadata only, zero tools, zero mutators.
 * Wave 5-02 adds a bounded sidecar-to-MCP bridge; bridged resources remain read-only and non-authoritative.
 * No runtime authority, execution, signer, policy, risk, or control wiring is exposed here.
 */

import { MCP_SIDECAR_BRIDGE_MANIFEST, MCP_SIDECAR_BRIDGE_RESOURCES, assertMcpSidecarBridgeOnly } from "./sidecar-bridge.js";

export const MCP_POSTURE = "prompt/resource-plane-only" as const;

export type McpPromptClassification = "safe prompt-plane surface";

export type McpResourceClassification =
  | "safe read-only resource-plane surface"
  | "safe derived replay resource"
  | "safe append-only evidence/provenance resource"
  | "safe sidecar observational resource"
  | "safe sidecar replay/enrichment resource"
  | "safe sidecar watchlist-oriented resource";

export type McpSurfaceClassification = McpPromptClassification | McpResourceClassification;

export interface McpPromptDescriptor {
  classification: McpPromptClassification;
  kind: "prompt";
  name: string;
  title: string;
  description: string;
  sourceModule: string;
  inputSchema: readonly {
    readonly name: string;
    readonly description: string;
    readonly required: boolean;
  }[];
  template: readonly string[];
}

export interface McpResourceDescriptor {
  classification: McpResourceClassification;
  kind: "resource";
  uri: string;
  title: string;
  description: string;
  mimeType: "text/plain";
  sourceModule: string;
  content: string;
}

export interface McpServerManifest {
  posture: typeof MCP_POSTURE;
  version: "mcp.skeleton.v1";
  prompts: readonly McpPromptDescriptor[];
  resources: readonly McpResourceDescriptor[];
  tools: readonly [];
}

export const MCP_FORBIDDEN_MODULE_PATTERNS = [
  /(^|\/)core\/engine\.ts$/,
  /(^|\/)core\/orchestrator\.ts$/,
  /(^|\/)core\/tool-router\.ts$/,
  /(^|\/)runtime\//,
  /(^|\/)execution\//,
  /(^|\/)signer\//,
  /(^|\/)governance\//,
  /(^|\/)policy\//,
  /(^|\/)risk\//,
  /(^|\/)control\//,
  /(^|\/)memory\//,
  /(^|\/)journal-writer\//,
  /(^|\/)persistence\//,
  /(^|\/)adapters\//,
  /(^|\/)server\/routes\//,
  /(^|\/)observability\/action-log\.ts$/,
] as const;

export const MCP_SAFE_PROMPTS: readonly McpPromptDescriptor[] = [
  {
    classification: "safe prompt-plane surface",
    kind: "prompt",
    name: "readonly-decision-audit",
    title: "Read-only Decision Audit",
    description:
      "Read-only prompt metadata for auditing canonical decision envelopes. No trade suggestions, overrides, policy changes, or control mutations.",
    sourceModule: "mcp/manifest.ts",
    inputSchema: [
      {
        name: "decisionEnvelopeJson",
        description: "Canonical decision-envelope JSON supplied by the caller for read-only review.",
        required: true,
      },
      {
        name: "responseFormat",
        description: "Preferred output format for the read-only audit response.",
        required: false,
      },
    ],
    template: [
      "You are a read-only auditor.",
      "Explain the supplied canonical decision envelope only.",
      "Do not suggest trades, overrides, policy changes, or runtime control actions.",
      "Do not invent facts beyond the supplied JSON.",
    ],
  },
  {
    classification: "safe prompt-plane surface",
    kind: "prompt",
    name: "provenance-taxonomy-review",
    title: "Provenance Taxonomy Review",
    description:
      "Read-only prompt metadata for reviewing canonical-record, derived-projection, and append-only provenance semantics.",
    sourceModule: "mcp/manifest.ts",
    inputSchema: [
      {
        name: "surfaceName",
        description: "Name of the surface being classified.",
        required: true,
      },
      {
        name: "surfaceText",
        description: "Optional surface text or descriptor snippet to review.",
        required: false,
      },
    ],
    template: [
      "You are a read-only provenance reviewer.",
      "Classify the supplied surface using the canonical record / derived projection / append-only evidence taxonomy.",
      "Do not suggest code changes, authority changes, or runtime mutations.",
    ],
  },
  {
    classification: "safe prompt-plane surface",
    kind: "prompt",
    name: "runtime-summary-semantics-review",
    title: "Runtime Summary Semantics Review",
    description:
      "Read-only prompt metadata for reviewing runtime-cycle-summary, replay, and journal semantics without changing authority.",
    sourceModule: "mcp/manifest.ts",
    inputSchema: [
      {
        name: "summaryKind",
        description: "Kind of runtime summary or replay surface being reviewed.",
        required: true,
      },
      {
        name: "embeddedRecordKind",
        description: "Optional embedded record kind when the container relays canonical records.",
        required: false,
      },
    ],
    template: [
      "You are a read-only runtime summary reviewer.",
      "Explain whether the surface is a canonical record, derived projection, or append-only evidence container.",
      "Do not infer authority, control, or mutation rights from the container.",
    ],
  },
] as const;

export const MCP_SAFE_RESOURCES: readonly McpResourceDescriptor[] = [
  {
    classification: "safe read-only resource-plane surface",
    kind: "resource",
    uri: "bot://mcp/posture",
    title: "MCP Posture",
    description:
      "Read-only posture metadata for the prompt/resource-plane-only MCP skeleton.",
    mimeType: "text/plain",
    sourceModule: "mcp/manifest.ts",
    content:
      "MCP posture: prompt/resource-plane-only. Zero tools. No execution, signer, policy, risk, governance, or control exposure. Sidecar bridge resources remain read-only and non-authoritative.",
  },
  {
    classification: "safe read-only resource-plane surface",
    kind: "resource",
    uri: "bot://mcp/surface-map",
    title: "MCP Surface Map",
    description:
      "Read-only inventory of safe prompt-plane and resource-plane MCP surfaces for this slice.",
    mimeType: "text/plain",
    sourceModule: "mcp/manifest.ts",
    content:
      "Safe prompt-plane surfaces: readonly-decision-audit, provenance-taxonomy-review, runtime-summary-semantics-review. Safe resource-plane surfaces: bot://mcp/posture, bot://mcp/surface-map, bot://mcp/canonical-decision-history, bot://mcp/provenance-taxonomy, bot://mcp/runtime-cycle-summary-schema, bot://mcp/replay-semantics, bot://mcp/journal-provenance, bot://mcp/sidecar-observation, bot://mcp/sidecar/posture, bot://mcp/sidecar/surface-map, bot://mcp/sidecar/trend-reversal-monitor-runner, bot://mcp/sidecar/shadow-artifact-chain, bot://mcp/sidecar/sidecar-worker-loop. Resource classes: safe read-only, safe derived replay, safe append-only evidence/provenance, safe sidecar observational, safe sidecar replay/enrichment, safe sidecar watchlist-oriented. Zero tools.",
  },
  {
    classification: "safe read-only resource-plane surface",
    kind: "resource",
    uri: "bot://mcp/canonical-decision-history",
    title: "Canonical Decision History",
    description:
      "Read-only metadata describing that runtime cycle summary decisionEnvelope records are the sole canonical decision-history truth.",
    mimeType: "text/plain",
    sourceModule: "mcp/manifest.ts",
    content:
      "Canonical decision history lives only in runtime cycle summary records via decisionEnvelope. Server/KPI/control/health/replay/journal surfaces are derived or provenance containers and do not become canonical by embedding records.",
  },
  {
    classification: "safe read-only resource-plane surface",
    kind: "resource",
    uri: "bot://mcp/provenance-taxonomy",
    title: "Provenance Taxonomy",
    description:
      "Read-only taxonomy metadata for canonical record, derived projection, append-only evidence, and compatibility residue semantics.",
    mimeType: "text/plain",
    sourceModule: "mcp/manifest.ts",
    content:
      "Taxonomy: canonical record = runtime cycle summary decisionEnvelope; derived projection = containers relaying canonical records; append-only evidence = journal/replay/incident/execution stores; compatibility residue = legacy-only surfaces not canonical.",
  },
  {
    classification: "safe read-only resource-plane surface",
    kind: "resource",
    uri: "bot://mcp/runtime-cycle-summary-schema",
    title: "Runtime Cycle Summary Schema",
    description:
      "Read-only schema-like metadata for the canonical runtime cycle summary record and its non-canonical containers.",
    mimeType: "text/plain",
    sourceModule: "mcp/manifest.ts",
    content:
      "RuntimeCycleSummary fields include decisionEnvelope, decisionHistoryRole, shadowArtifactChain, authorityArtifactChain, incidentIds, and derived visibility/provenance fields. The container is canonical only when it is the runtime cycle summary record itself.",
  },
  {
    classification: "safe derived replay resource",
    kind: "resource",
    uri: "bot://mcp/replay-semantics",
    title: "Replay Semantics",
    description:
      "Read-only replay metadata for derived reconstruction and audit views, not canonical decision history.",
    mimeType: "text/plain",
    sourceModule: "mcp/manifest.ts",
    content:
      "Derived replay view only. Replay containers are audit and reconstruction surfaces. A relayed canonical runtime cycle summary may remain canonical, but the replay container itself is not canonical decision history and does not control runtime state.",
  },
  {
    classification: "safe append-only evidence/provenance resource",
    kind: "resource",
    uri: "bot://mcp/journal-provenance",
    title: "Journal Provenance",
    description:
      "Read-only journal metadata for append-only evidence and provenance views, not canonical decision history.",
    mimeType: "text/plain",
    sourceModule: "mcp/manifest.ts",
    content:
      "Append-only evidence/provenance view only. Journal entries support audit and reconstruction, but they are never canonical decision history and they do not provide mutation, execution, policy, or control authority.",
  },
  {
    classification: "safe sidecar observational resource",
    kind: "resource",
    uri: "bot://mcp/sidecar-observation",
    title: "Sidecar Observation",
    description:
      "Read-only sidecar observational metadata for non-authoritative worker-loop outputs.",
    mimeType: "text/plain",
    sourceModule: "mcp/manifest.ts",
    content:
      "Sidecar observational view only. The sidecar bridge exposes discoveredCandidates, acceptedCandidates, prunedCandidates, and monitorResult as bounded observational outputs. These outputs are non-authoritative, non-policy, non-execution, and non-control.",
  },
  ...MCP_SIDECAR_BRIDGE_RESOURCES,
] as const;

assertMcpSidecarBridgeOnly(MCP_SIDECAR_BRIDGE_MANIFEST);

export const MCP_SERVER_MANIFEST: McpServerManifest = {
  posture: MCP_POSTURE,
  version: "mcp.skeleton.v1",
  prompts: MCP_SAFE_PROMPTS,
  resources: MCP_SAFE_RESOURCES,
  tools: [],
};

function assertNotForbidden(sourceModule: string, context: string): void {
  for (const pattern of MCP_FORBIDDEN_MODULE_PATTERNS) {
    if (pattern.test(sourceModule)) {
      throw new Error(`MCP_FORBIDDEN_SURFACE:${context}:${sourceModule}`);
    }
  }
}

export function assertPromptResourcePlaneOnly(manifest: McpServerManifest): void {
  if (manifest.posture !== MCP_POSTURE) {
    throw new Error(`MCP_INVALID_POSTURE:${manifest.posture}`);
  }
  if (manifest.version !== "mcp.skeleton.v1") {
    throw new Error(`MCP_INVALID_VERSION:${manifest.version}`);
  }
  if (manifest.tools.length !== 0) {
    throw new Error("MCP_FORBIDDEN_TOOLS_PRESENT");
  }
  if (manifest.prompts.length === 0) {
    throw new Error("MCP_PROMPTS_MISSING");
  }
  if (manifest.resources.length === 0) {
    throw new Error("MCP_RESOURCES_MISSING");
  }

  for (const prompt of manifest.prompts) {
    if (prompt.classification !== "safe prompt-plane surface" || prompt.kind !== "prompt") {
      throw new Error(`MCP_INVALID_PROMPT_SURFACE:${prompt.name}`);
    }
    assertNotForbidden(prompt.sourceModule, `prompt:${prompt.name}`);
  }

  for (const resource of manifest.resources) {
    if (resource.kind !== "resource") {
      throw new Error(`MCP_INVALID_RESOURCE_SURFACE:${resource.uri}`);
    }
    if (
      resource.classification !== "safe read-only resource-plane surface" &&
      resource.classification !== "safe derived replay resource" &&
      resource.classification !== "safe append-only evidence/provenance resource" &&
      resource.classification !== "safe sidecar observational resource" &&
      resource.classification !== "safe sidecar replay/enrichment resource" &&
      resource.classification !== "safe sidecar watchlist-oriented resource"
    ) {
      throw new Error(`MCP_INVALID_RESOURCE_SURFACE:${resource.uri}`);
    }
    if (resource.content.trim().length === 0) {
      throw new Error(`MCP_EMPTY_RESOURCE_CONTENT:${resource.uri}`);
    }
    if (resource.content.length > 800) {
      throw new Error(`MCP_RESOURCE_CONTENT_TOO_BROAD:${resource.uri}`);
    }
    assertNotForbidden(resource.sourceModule, `resource:${resource.uri}`);
  }
}
