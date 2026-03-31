/**
 * Advisory / experimental LLM surface — isolated from trading hot path and public package root.
 * Consumers must import from `@onchain-trading-bot/core/advisory-llm` explicitly; core `index.ts` does not re-export.
 */
export { client, isXaiMode, currentProvider, currentModel } from "./llmClient.js";
export { generateResponse } from "./fallbackCascade.js";
