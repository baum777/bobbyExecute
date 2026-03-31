import { client, currentModel, currentProvider, isXaiMode } from "./llmClient.js";

const DEFAULT_SYSTEM_PROMPT =
  process.env.LLM_SYSTEM_PROMPT ?? "You are a helpful assistant.";

const CANNED_FALLBACK =
  process.env.LLM_CANNED_FALLBACK ?? "[Response unavailable]";

const DEFAULT_XAI_MODEL = process.env.XAI_MODEL_PRIMARY ?? "grok-beta";
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

/**
 * Advisory-only LLM text generation (experimental). Not used by deterministic trading paths.
 * Falls back to canned response on error.
 */
export async function generateResponse(
  prompt: string,
  options: { model?: string; systemPrompt?: string } = {}
): Promise<string> {
  const defaultModel = isXaiMode ? DEFAULT_XAI_MODEL : DEFAULT_OPENAI_MODEL;
  const model = options.model ?? currentModel ?? defaultModel;
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: parseFloat(process.env.LLM_TEMPERATURE ?? "0.92"),
      max_tokens: parseInt(process.env.LLM_MAX_TOKENS ?? "280", 10),
    });
    return completion.choices[0].message.content?.trim() ?? "";
  } catch (err) {
    console.error(`LLM error (${currentProvider}/${model}):`, err);
    return CANNED_FALLBACK;
  }
}
