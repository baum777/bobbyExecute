/**
 * Pre-authority universe normalization helper.
 * Deterministic inclusion/exclusion only; no scoring or policy authority.
 */
import {
  UniverseBuildResultSchema,
  type UniverseBuildResult,
  type UniverseCoverageState,
} from "./contracts/universe-build-result.js";

export interface BuildUniverseResultInput {
  token: string;
  chain?: "solana";
  observationsBySource: Record<string, UniverseCoverageState>;
  normalizedFeatures?: Record<string, number>;
}

function sortCoverage(
  sourceCoverage: Record<string, { status: UniverseCoverageState }>
): Record<string, { status: UniverseCoverageState }> {
  return Object.fromEntries(
    Object.entries(sourceCoverage).sort(([left], [right]) => left.localeCompare(right))
  );
}

function sortNumericFeatures(
  features: Record<string, number>
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(features).sort(([left], [right]) => left.localeCompare(right))
  );
}

function deriveExclusionReasons(
  observationsBySource: Record<string, UniverseCoverageState>
): string[] {
  const reasons: string[] = [];
  for (const [source, status] of Object.entries(observationsBySource)) {
    if (status === "ERROR") {
      reasons.push(`SOURCE_ERROR:${source}`);
    } else if (status === "STALE") {
      reasons.push(`SOURCE_STALE:${source}`);
    }
  }
  return reasons.sort();
}

export function buildUniverseResult(
  input: BuildUniverseResultInput
): UniverseBuildResult {
  const normalizedFeatures = sortNumericFeatures(input.normalizedFeatures ?? {});
  const observationsBySource = Object.fromEntries(
    Object.entries(input.observationsBySource).map(([source, status]) => [source, { status }])
  );
  const sourceCoverage = sortCoverage(observationsBySource);
  const exclusionReasons = deriveExclusionReasons(input.observationsBySource);

  return UniverseBuildResultSchema.parse({
    schema_version: "universe_build_result.v1",
    token: input.token,
    chain: input.chain ?? "solana",
    included: exclusionReasons.length === 0,
    exclusionReasons,
    normalizedFeatures,
    sourceCoverage,
  });
}
