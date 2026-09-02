import type { FinishReason } from "@orbit/contracts";
import { parseSse, type ProviderAdapter } from "./provider";

export const geminiAdapter: ProviderAdapter = {
  async *stream(request, apiKey) {
    const system = request.messages.filter((m) => m.role === "system").map((m) => ({ text: m.content }));
    const contents = request.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ contents, systemInstruction: system.length ? { parts: system } : undefined, generationConfig: { maxOutputTokens: request.maxOutputTokens } }),
      signal: request.signal
    });
    for await (const frame of parseSse(response)) {
      const event = JSON.parse(frame.data) as Record<string, any>;
      const text = event.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("");
      if (text) yield { type: "text_delta", text };
      if (event.usageMetadata) yield { type: "usage", inputTokens: event.usageMetadata.promptTokenCount, outputTokens: event.usageMetadata.candidatesTokenCount };
      if (event.candidates?.[0]?.finishReason) yield { type: "complete", finishReason: (event.candidates[0].finishReason === "MAX_TOKENS" ? "length" : "stop") as FinishReason };
    }
  }
};

