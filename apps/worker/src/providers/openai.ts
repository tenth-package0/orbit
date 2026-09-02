import type { FinishReason } from "@orbit/contracts";
import { parseSse, type ProviderAdapter } from "./provider";

export const openaiAdapter: ProviderAdapter = {
  async *stream(request, apiKey) {
    const input = request.messages.map((message) => ({
      role: message.role,
      content: message.attachments?.length ? [
        { type: "input_text", text: message.content },
        ...message.attachments.map((attachment) => attachment.mimeType.startsWith("image/")
          ? { type: "input_image", image_url: `data:${attachment.mimeType};base64,${attachment.data}` }
          : attachment.mimeType === "application/pdf"
            ? { type: "input_file", filename: attachment.fileName, file_data: `data:${attachment.mimeType};base64,${attachment.data}` }
            : { type: "input_text", text: `\n<attachment name="${attachment.fileName}">\n${decodeBase64Text(attachment.data)}\n</attachment>` })
      ] : message.content
    }));
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: request.model, input, max_output_tokens: request.maxOutputTokens, stream: true, store: false }),
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

function decodeBase64Text(data: string) { return new TextDecoder().decode(Uint8Array.from(atob(data), (character) => character.charCodeAt(0))); }
