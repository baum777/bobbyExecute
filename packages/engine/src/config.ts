export interface ReducedModeConfig {
  MAX_UNIQUE_TOKENS: number;
  MIN_UNIQUE_TOKENS: number;
  TRENDING_RATIO_TARGET: number;
  VOLUME_RATIO_TARGET: number;
  DISCREPANCY_THRESHOLD: number;
  MIN_DATA_COMPLETENESS: number;
  MAX_RECOVERY_ATTEMPTS: number;
  FETCH_LIMIT_PER_SOURCE: number;
  PRE_DEDUPE_TARGET: number;
  BACKOFF_BASE_MS: number;
  BACKOFF_MAX_MS: number;
  enableSocial: boolean;
  enableMoralis: boolean;
  enableRpcVerify: boolean;
}

export const DEFAULT_REDUCEDMODE_CONFIG: ReducedModeConfig = {
  MAX_UNIQUE_TOKENS: 30,
  MIN_UNIQUE_TOKENS: 20,
  TRENDING_RATIO_TARGET: 0.5,
  VOLUME_RATIO_TARGET: 0.5,
  DISCREPANCY_THRESHOLD: 0.20,
  MIN_DATA_COMPLETENESS: 70,
  MAX_RECOVERY_ATTEMPTS: 3,
  FETCH_LIMIT_PER_SOURCE: 25,
  PRE_DEDUPE_TARGET: 60,
  BACKOFF_BASE_MS: 500,
  BACKOFF_MAX_MS: 10_000,
  enableSocial: false,
  enableMoralis: false,
  enableRpcVerify: false,
};
