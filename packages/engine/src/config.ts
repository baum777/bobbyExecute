export interface ReducedModeConfig {
  MAX_UNIQUE_TOKENS: number;
  MIN_UNIQUE_TOKENS: number;
  TRENDING_RATIO_TARGET: number;
  VOLUME_RATIO_TARGET: number;
  DISCREPANCY_THRESHOLD: number;
  MIN_DATA_COMPLETENESS: number;
  MAX_RECOVERY_ATTEMPTS: number;
  RETRY_BASE_DELAY_MS: number;
  RETRY_MAX_DELAY_MS: number;
  RETRY_JITTER_MS: number;
  UNIVERSE_SOURCE_TARGET: number;
  PRE_DEDUPE_POOL_TARGET: number;
  enableMoralis: boolean;
  enableRpcVerify: boolean;
  enableSocialLite: boolean;
}

export const DEFAULT_REDUCEDMODE_CONFIG: ReducedModeConfig = {
  MAX_UNIQUE_TOKENS: 30,
  MIN_UNIQUE_TOKENS: 20,
  TRENDING_RATIO_TARGET: 0.5,
  VOLUME_RATIO_TARGET: 0.5,
  DISCREPANCY_THRESHOLD: 0.2,
  MIN_DATA_COMPLETENESS: 70,
  MAX_RECOVERY_ATTEMPTS: 3,
  RETRY_BASE_DELAY_MS: 120,
  RETRY_MAX_DELAY_MS: 1400,
  RETRY_JITTER_MS: 80,
  UNIVERSE_SOURCE_TARGET: 25,
  PRE_DEDUPE_POOL_TARGET: 60,
  enableMoralis: false,
  enableRpcVerify: false,
  enableSocialLite: false,
};
