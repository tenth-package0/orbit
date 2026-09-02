import type { Provider } from "@orbit/contracts";
import { anthropicAdapter } from "./anthropic";
import { geminiAdapter } from "./gemini";
import { openaiAdapter } from "./openai";

export const adapters = { openai: openaiAdapter, anthropic: anthropicAdapter, google: geminiAdapter } satisfies Record<Provider, typeof openaiAdapter>;

