# BobbyExecute MCP Skill Plane

Scope: cognitive tool/resource/prompt layer and its current implementation status.  
Authority: advisory only. Never trade-decision authority.

## 1. Objective

Define the intended MCP skill plane without overstating what is currently wired.

## 2. Current Truth

### Implemented

- repo-local skill manifests in `packages/skills/**/manifest.json`
- repo-local skill instructions in `packages/skills/**/instructions.md`
- legacy `ToolRouter` abstraction in `bot/src/core/tool-router.ts`

### Not verified

- no MCP server entrypoint
- no tool registry exposed over MCP transport
- no resource registry
- no prompt registry
- no skill-plane cache or routing policy implementation

### Implication

The repository contains local skill descriptors and legacy routing scaffolding, but not a verified live MCP plane.

## 3. Gaps

- The term "skill" exists in manifests, but those manifests do not by themselves create a working MCP surface.
- Some skill instructions describe flows that are broader than the code paths currently wired.
- `ToolRouter` exists, but it is not evidence of a deployed tools/resources/prompts system.

## 4. Constraints / Non-Goals

- The skill plane must never create decision authority.
- Tool use must stay explicit and traceable.
- Outputs must be typed and schema-bounded when the plane is implemented.
- No doc should imply that current skill manifests are already a live MCP server.

## 5. Reuse of Existing Skills / Tools

Verified reusable repo assets:

- `packages/skills/**/manifest.json`
- `packages/skills/**/instructions.md`
- `bot/src/core/tool-router.ts`
- shared-core consumer overlay docs in `docs/codex-workflow-consumer.md`

The documentation reuses these verified assets and labels them correctly as partial implementation.

## 6. Proposed Implementation

## Target plane

The target MCP skill plane should provide:

- `Tools`: explicit execution endpoints with typed inputs and outputs
- `Resources`: bounded context retrieval surfaces
- `Prompts`: named workflows and operator/research playbooks

## Current repo posture

| Surface | Current state | Authority |
|---|---|---|
| local skill manifests | implemented | advisory only |
| local skill instructions | implemented | advisory only |
| `ToolRouter` | implemented as legacy abstraction | advisory only unless explicitly invoked by deterministic code |
| MCP server | not verified | none |
| resources registry | not verified | none |
| prompts registry | not verified | none |
| routing/cache policy | not verified | none |

## Cost and routing strategy

Target-state rule set:

- prefer deterministic local transforms before expensive cognitive calls
- cache by stable input hashes
- validate every tool output against typed schemas
- keep LLM calls out of authority paths

Truthful current status:

- this strategy is architectural intent only
- no verified repo-local implementation of that routing/caching layer was found

## 7. Acceptance Criteria

- advisory-only status is explicit
- implemented vs unwired surfaces are explicit
- no MCP capability is claimed without a concrete code path

## 8. Verification / Tests

Verified files:

- `packages/skills/governance/action_handbook_lookup/manifest.json`
- `packages/skills/intelligence/analyse/manifest.json`
- `packages/skills/reasoning/pattern_recognizer/manifest.json`
- `bot/src/core/tool-router.ts`
- `bot/src/index.ts`

## 9. Risks / Rollback

- Calling the current local-skill manifests a live MCP plane would be false.
- Treating skill outputs as implicit execution approval would violate advisory isolation.

## 10. Next Step

Implement a real MCP surface only if the repo needs tools/resources/prompts at runtime; otherwise keep the current local skill descriptors clearly non-authoritative.
