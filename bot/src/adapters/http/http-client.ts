/**
 * HTTP client - timeout, 5xx retry with exponential backoff.
 * Normalized planning package P3: dedicated HTTP layer.
 * Re-exports resilientFetch from http-resilience for adapter use.
 */
export {
  resilientFetch,
  type ResilientFetchOptions,
} from "../http-resilience.js";
