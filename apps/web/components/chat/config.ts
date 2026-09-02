import type { ModelOption } from "./types";

export const models: ModelOption[] = [
  { key: "openai-gpt-5.6-sol", label: "GPT-5.6 Sol", short: "GPT", description: "Precise coding and structured work", color: "#79a7ff" },
  { key: "anthropic-claude-opus-5", label: "Claude Opus 5", short: "Claude", description: "Deep reasoning and nuanced writing", color: "#e7a977" },
  { key: "google-gemini-3.6-flash", label: "Gemini 3.6 Flash", short: "Gemini", description: "Fast synthesis and long context", color: "#75d7b2" }
];

export const modes = [
  { key: "auto", label: "Auto", description: "Routes each prompt to the strongest model" },
  ...models.map((model) => ({ key: model.key, label: model.label, description: model.description })),
  { key: "compare", label: "Compare", description: "All three answer side by side" }
];

export const icon = { size: 16, strokeWidth: 1.75 };

export function findModel(id?: string) {
  return models.find((model) => model.key === id || model.key.endsWith(id ?? "__"));
}

export function modelName(id?: string) {
  if (id === "auto") return "Auto";
  if (id === "compare") return "Compare";
  return findModel(id)?.label ?? id ?? "Orbit";
}

export function shortName(id: string) {
  return findModel(id)?.short ?? modelName(id);
}

export function modelColor(id?: string) {
  return findModel(id)?.color ?? "#9da7ff";
}

export function composerNote(selection: string) {
  if (selection === "auto") return "Auto picks the model for each prompt. The full thread follows.";
  if (selection === "compare") return "All three models answer the same prompt. One message, three calls.";
  return `${modelName(selection)} will answer. Switch models anytime.`;
}

export function modeNote(selection: string) {
  if (selection === "auto") return "Routes each prompt by task";
  if (selection === "compare") return "Three models, three calls";
  return "Full thread context follows";
}

export function suggestedModel(current?: string) {
  if (!current) return undefined;
  return current.includes("claude") ? models[0] : models[1];
}

export function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function composerHeight(scrollHeight: number) {
  return Math.min(scrollHeight, 160);
}

export function isNearBottom({ scrollHeight, scrollTop, clientHeight }: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">) {
  return scrollHeight - scrollTop - clientHeight < 120;
}
