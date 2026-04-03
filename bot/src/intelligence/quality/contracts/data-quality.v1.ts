/**
 * Pre-authority typed artifact.
 * Repo-native DataQualityV1 line (transitional wrapper).
 * Wave bundle term `DataQualityReportV1` maps here.
 * Ownership freeze (PR-M0-01): owner is `core/contracts/dataquality.ts`.
 *
 * Transitional wrapper: re-export the core owner to avoid parallel shape drift.
 */
export {
  DataQualityStatusSchema,
  DataQualityV1Schema,
  type DataQualityV1,
} from "../../../core/contracts/dataquality.js";
