import { describe, expect, it } from "vitest";
import type { ModelDefinition } from "@orbit/contracts";
import { classifyPrompt, routePrompt } from "../src/index";

const models: ModelDefinition[] = [
  { key: "openai-gpt-5.6-sol", id: "gpt-5.6-sol", provider: "openai", label: "GPT-5.6 Sol", contextWindow: 1_050_000, maxOutputTokens: 128_000, enabled: true },
  { key: "anthropic-claude-opus-5", id: "claude-opus-5", provider: "anthropic", label: "Claude Opus 5", contextWindow: 1_000_000, maxOutputTokens: 128_000, enabled: true },
  { key: "google-gemini-3.6-flash", id: "gemini-3.6-flash", provider: "google", label: "Gemini 3.6 Flash", contextWindow: 1_000_000, maxOutputTokens: 65_536, enabled: true }
];

describe("prompt classification", () => {
  it.each([
    ["Prove that x + 1 = 4", "math"],
    ["Debug this TypeScript function", "coding"],
    ["Analyze the constraints step by step", "reasoning"],
    ["Write a friendly birthday note", "general"]
  ])("classifies %s", (prompt, expected) => expect(classifyPrompt(prompt).category).toBe(expected));

  it("uses input size for long context", () => expect(classifyPrompt("summarize", 40_000).category).toBe("long-context"));
});

describe("benchmark routing", () => {
  it("selects the coding leader", () => expect(routePrompt("Refactor this TypeScript function", models).modelKey).toBe("anthropic-claude-opus-5"));
  it("selects the math leader", () => expect(routePrompt("Prove this theorem", models).modelKey).toBe("openai-gpt-5.6-sol"));
  it("selects the long-context leader", () => expect(routePrompt("Summarize this", models, 40_000).modelKey).toBe("google-gemini-3.6-flash"));
  it("ignores disabled models", () => expect(routePrompt("Debug this API", models.map((m) => ({ ...m, enabled: m.provider !== "anthropic" }))).modelKey).toBe("openai-gpt-5.6-sol"));
});
