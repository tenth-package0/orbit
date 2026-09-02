import type { FinishReason } from "@orbit/contracts";
import { parseSse, type ProviderAdapter } from "./provider";

export const anthropicAdapter: ProviderAdapter = {
  async *stream(request, apiKey) {
    const system = request.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n") || undefined;
    const messages = request.messages.filter((m) => m.role !== "system");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: request.model, system, messages, max_tokens: request.maxOutputTokens, stream: true }),
      signal: request.signal
    });
    let inputTokens: number | undefined;
    for await (const frame of parseSse(response)) {
      const event = JSON.parse(frame.data) as Record<string, any>;
      if (event.type === "message_start") inputTokens = event.message?.usage?.input_tokens;
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") yield { type: "text_delta", text: event.delta.text };
      if (event.type === "message_delta") {
        yield { type: "usage", inputTokens, outputTokens: event.usage?.output_tokens };
        yield { type: "complete", finishReason: (event.delta?.stop_reason === "max_tokens" ? "length" : "stop") as FinishReason };
      }
    }
  }
};

