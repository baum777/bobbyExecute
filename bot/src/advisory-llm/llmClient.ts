/**
 * Advisory / experimental LLM client — NOT imported by trading runtime or HTTP bootstrap.
 * Provider wiring only; no trading authority.
 */
import OpenAI from "openai";

type LlmProvider = "xai" | "openai";

const hasXaiKey = !!process.env.XAI_API_KEY;
const launchMode = process.env.LAUNCH_MODE;

const currentProvider: LlmProvider = (() => {
  if (launchMode === "openai" || launchMode === "openai_fallback") {
    return "openai";
  }
  if (hasXaiKey) {
    return "xai";
  }
  return "openai";
})();

const isXaiMode = currentProvider === "xai";

let client: OpenAI;

if (isXaiMode) {
  client = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: "https://api.x.ai/v1",
  });
} else {
  client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  });
}

const DEFAULT_XAI_MODEL = process.env.XAI_MODEL_PRIMARY ?? "grok-beta";
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const currentModel = isXaiMode ? DEFAULT_XAI_MODEL : DEFAULT_OPENAI_MODEL;

export { client, isXaiMode, currentProvider, currentModel };
