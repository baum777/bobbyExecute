/**
 * Pre-authority typed artifact.
 * Repo-native CQDSnapshotV1 line (transitional wrapper).
 * Wave bundle term `CQDArtifactV1` maps here.
 * Ownership freeze (PR-M0-01): owner is `core/contracts/cqd.ts`.
 *
 * Transitional wrapper: re-export the core owner to avoid parallel shape drift.
 */
export {
  CQDSnapshotV1Schema,
  type CQDSnapshotV1,
} from "../../../core/contracts/cqd.js";
