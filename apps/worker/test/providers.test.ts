import { afterEach, describe, expect, it, vi } from "vitest";
import { anthropicAdapter } from "../src/providers/anthropic";
import { geminiAdapter } from "../src/providers/gemini";
import { openaiAdapter } from "../src/providers/openai";

const request = { model: "test", messages: [{ role: "user" as const, content: "Hello" }], maxOutputTokens: 100, signal: new AbortController().signal };
const response = (frames: string[]) => new Response(frames.map((data) => `data: ${data}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
async function collect(adapter: typeof openaiAdapter) { const events = []; for await (const event of adapter.stream(request, "secret")) events.push(event); return events; }

afterEach(() => vi.unstubAllGlobals());

describe("provider stream normalization", () => {
  it("normalizes OpenAI deltas and usage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([
      JSON.stringify({ type: "response.output_text.delta", delta: "Hi" }),
      JSON.stringify({ type: "response.completed", response: { usage: { input_tokens: 2, output_tokens: 1 } } })
    ])));
    expect(await collect(openaiAdapter)).toEqual([{ type: "text_delta", text: "Hi" }, { type: "usage", inputTokens: 2, outputTokens: 1 }, { type: "complete", finishReason: "stop" }]);
  });

  it("normalizes Anthropic deltas", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([
      JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 2 } } }),
      JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } }),
      JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } })
    ])));
    expect(await collect(anthropicAdapter)).toHaveLength(3);
  });

  it("normalizes Gemini deltas", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hi" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 1 } })])));
    expect(await collect(geminiAdapter)).toEqual([{ type: "text_delta", text: "Hi" }, { type: "usage", inputTokens: 2, outputTokens: 1 }, { type: "complete", finishReason: "stop" }]);
  });
});

