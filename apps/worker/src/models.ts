import type { ModelDefinition } from "@orbit/contracts";

export const MODELS: ModelDefinition[] = [
  { key: "openai-gpt-5.6-sol", id: "gpt-5.6-sol", provider: "openai", label: "GPT-5.6 Sol", contextWindow: 1_050_000, maxOutputTokens: 128_000, enabled: true },
  { key: "anthropic-claude-opus-5", id: "claude-opus-5", provider: "anthropic", label: "Claude Opus 5", contextWindow: 1_000_000, maxOutputTokens: 128_000, enabled: true },
  { key: "google-gemini-3.6-flash", id: "gemini-3.6-flash", provider: "google", label: "Gemini 3.6 Flash", contextWindow: 1_000_000, maxOutputTokens: 65_536, enabled: true }
];

export function getModel(key: string) {
  return MODELS.find((model) => model.key === key && model.enabled);
}
