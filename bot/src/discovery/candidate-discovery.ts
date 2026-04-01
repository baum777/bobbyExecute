/**
 * Pre-authority candidate typing.
 * Deterministic helper for v2 candidate artifacts.
 */
import {
  CandidateTokenSchema,
  type CandidateToken,
  type CandidateTokenPriority,
} from "./contracts/candidate-token.js";
import type { DiscoveryEvidence } from "./contracts/discovery-evidence.js";

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function derivePriority(
  reasonCount: number,
  sourceCount: number,
  evidenceStatus: DiscoveryEvidence["status"]
): CandidateTokenPriority {
  if (evidenceStatus === "REJECTED") {
    return "low";
  }
  if (reasonCount >= 2 && sourceCount >= 2) {
    return "high";
  }
  if (reasonCount >= 2 || sourceCount >= 2) {
    return "medium";
  }
  return "low";
}

export interface CandidateTokenOptions {
  symbol?: string;
}

export function createCandidateToken(
  evidence: DiscoveryEvidence,
  options: CandidateTokenOptions = {}
): CandidateToken {
  const discoveryReasons = uniqueSorted(evidence.notes);
  const sourceSet = [...new Set(evidence.sources)].sort();
  const firstSeenMs = evidence.observations.reduce((min, observation) => {
    return Math.min(min, observation.observedAtMs);
  }, Number.POSITIVE_INFINITY);

  return CandidateTokenSchema.parse({
    schema_version: "candidate_token.v1",
    token: evidence.token,
    symbol: options.symbol,
    chain: evidence.chain,
    discoveryReasons,
    firstSeenMs: Number.isFinite(firstSeenMs) ? firstSeenMs : evidence.collectedAtMs,
    sourceSet,
    evidenceRefs: [evidence.evidenceId],
    priority: derivePriority(
      discoveryReasons.length,
      sourceSet.length,
      evidence.status
    ),
  });
}
