import type { ChatMessage, FinishReason } from "@orbit/contracts";

export type ProviderRequest = { model: string; messages: ChatMessage[]; maxOutputTokens: number; signal: AbortSignal };
export type ProviderEvent =
  | { type: "text_delta"; text: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "complete"; finishReason: FinishReason };

export interface ProviderAdapter {
  stream(request: ProviderRequest, apiKey: string): AsyncIterable<ProviderEvent>;
}

export async function* parseSse(response: Response): AsyncIterable<{ event?: string; data: string }> {
  if (!response.ok || !response.body) throw new ProviderHttpError(response.status);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      let event: string | undefined;
      const data: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length) yield { event, data: data.join("\n") };
    }
    if (done) break;
  }
}

export class ProviderHttpError extends Error {
  constructor(public readonly status: number) { super(`Provider returned HTTP ${status}`); }
}

