import type { FinishReason } from "@orbit/contracts";
import { parseSse, type ProviderAdapter } from "./provider";

export const geminiAdapter: ProviderAdapter = {
  async *stream(request, apiKey) {
    const system = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n") || undefined;
    // Interaction output steps carry Google-issued signatures, so Orbit's provider-neutral history is sent as a labeled transcript instead.
    const input = request.messages.filter((message) => message.role !== "system").flatMap((message) => [
      ...(message.attachments ?? []).map((attachment) => attachment.mimeType === "text/plain"
        ? { type: "text", text: `<attachment name="${attachment.fileName}">\n${decodeBase64Text(attachment.data)}\n</attachment>` }
        : { type: attachment.mimeType === "application/pdf" ? "document" : "image", mime_type: attachment.mimeType, data: attachment.data }),
      { type: "text", text: `${message.role === "assistant" ? "ASSISTANT" : "USER"}: ${message.content}` }
    ]);
    const url = "https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse";
    const response = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ model: request.model, input, system_instruction: system, stream: true, store: false, generation_config: { max_output_tokens: request.maxOutputTokens } }),
      signal: request.signal
    });
    for await (const frame of parseSse(response)) {
      if (frame.data === "[DONE]") continue;
      const event = JSON.parse(frame.data) as Record<string, any>;
      if (event.event_type === "step.delta" && event.delta?.type === "text" && event.delta.text) yield { type: "text_delta", text: event.delta.text };
      if (event.event_type === "interaction.completed") {
        const usage = event.interaction?.usage;
        if (usage) yield { type: "usage", inputTokens: usage.total_input_tokens, outputTokens: usage.total_output_tokens };
        const status = event.interaction?.status;
        yield { type: "complete", finishReason: (status === "incomplete" || status === "budget_exceeded" ? "length" : "stop") as FinishReason };
      }
    }
  }
};

function decodeBase64Text(data: string) { return new TextDecoder().decode(Uint8Array.from(atob(data), (character) => character.charCodeAt(0))); }
