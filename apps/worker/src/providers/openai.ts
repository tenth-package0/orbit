import type { FinishReason } from "@orbit/contracts";
import { parseSse, type ProviderAdapter } from "./provider";

export const openaiAdapter: ProviderAdapter = {
  async *stream(request, apiKey) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: request.model, input: request.messages, max_output_tokens: request.maxOutputTokens, stream: true, store: false }),
      signal: request.signal
    });
    for await (const frame of parseSse(response)) {
      if (frame.data === "[DONE]") continue;
      const event = JSON.parse(frame.data) as Record<string, any>;
      if (event.type === "response.output_text.delta" && event.delta) yield { type: "text_delta", text: event.delta };
      if (event.type === "response.completed") {
        const usage = event.response?.usage;
        if (usage) yield { type: "usage", inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
        yield { type: "complete", finishReason: "stop" as FinishReason };
      }
    }
  }
};

