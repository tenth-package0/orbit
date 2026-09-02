import { afterEach, describe, expect, it, vi } from "vitest";
import { anthropicAdapter } from "../src/providers/anthropic";
import { geminiAdapter } from "../src/providers/gemini";
import { openaiAdapter } from "../src/providers/openai";

const request = { model: "test", messages: [{ role: "user" as const, content: "Hello" }], maxOutputTokens: 100, signal: new AbortController().signal };
const multimodalRequest = { ...request, messages: [{ role: "user" as const, content: "Describe these", attachments: [
  { id: "image", fileName: "screen.png", mimeType: "image/png" as const, sizeBytes: 3, data: "aW1n" },
  { id: "pdf", fileName: "notes.pdf", mimeType: "application/pdf" as const, sizeBytes: 3, data: "cGRm" },
  { id: "text", fileName: "notes.txt", mimeType: "text/plain" as const, sizeBytes: 5, data: "aGVsbG8=" }
] }] };
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([
      JSON.stringify({ event_type: "step.delta", delta: { type: "text", text: "Hi" } }),
      JSON.stringify({ event_type: "interaction.completed", interaction: { status: "completed", usage: { total_input_tokens: 2, total_output_tokens: 1 } } })
    ])));
    expect(await collect(geminiAdapter)).toEqual([{ type: "text_delta", text: "Hi" }, { type: "usage", inputTokens: 2, outputTokens: 1 }, { type: "complete", finishReason: "stop" }]);
  });

  it.each([
    ["OpenAI", openaiAdapter, ["input_image", "input_file", "hello"]],
    ["Anthropic", anthropicAdapter, ["image", "document", "hello"]],
    ["Gemini", geminiAdapter, ["user_input", "document", "application/pdf", "hello"]]
  ])("sends attachments in the %s native format", async (_name, adapter, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(response(adapter === geminiAdapter
      ? [JSON.stringify({ event_type: "interaction.completed", interaction: { status: "completed" } })]
      : adapter === anthropicAdapter
        ? [JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: {} })]
        : [JSON.stringify({ type: "response.completed", response: {} })]));
    vi.stubGlobal("fetch", fetchMock);
    for await (const _event of adapter.stream(multimodalRequest, "secret")) { /* consume */ }
    const body = String(fetchMock.mock.calls[0]![1]!.body);
    for (const marker of expected) expect(body).toContain(marker);
    if (adapter === geminiAdapter) expect(String(fetchMock.mock.calls[0]![0])).toContain("/v1beta/interactions");
  });
});
