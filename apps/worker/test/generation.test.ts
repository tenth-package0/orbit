import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { handleRequest } from "../src/index";
import type { Env, RateLimiter } from "../src/env";

const origin = "https://orbit.test";
const successLimiter = (): RateLimiter => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
const env = () => ({
  SUPABASE_URL: "https://handler.supabase.co", SUPABASE_PUBLISHABLE_KEY: "publishable", OPENAI_API_KEY: "openai", ANTHROPIC_API_KEY: "anthropic", GOOGLE_API_KEY: "google", ALLOWED_ORIGINS: origin,
  USER_MINUTE: successLimiter(), USER_BURST: successLimiter(), IP_MINUTE: successLimiter(), GUEST_MINUTE: successLimiter(), GUEST_BURST: successLimiter()
}) as Env;
const providerResponse = (provider: string) => provider === "openai"
  ? new Response('data: {"type":"response.output_text.delta","delta":"OK"}\n\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":1}}}\n\n')
  : provider === "anthropic"
    ? new Response('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}\n\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n')
    : new Response('data: {"candidates":[{"content":{"parts":[{"text":"OK"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":1}}\n\n');
const request = (body: unknown, authorization?: string) => new Request("https://worker.test/v1/generations", { method: "POST", headers: { origin, "content-type": "application/json", "cf-connecting-ip": "203.0.113.4", ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body) });
const guestBody = (selection: unknown = { mode: "model", modelKey: "openai-gpt-5.6-sol" }) => ({ selection, messages: [{ role: "user", content: "Hello" }] });
const urlOf = (input: unknown) => input instanceof Request ? input.url : String(input);

afterEach(() => vi.unstubAllGlobals());

describe("generation contexts", () => {
  it("allows a valid guest request without touching Supabase persistence", async () => {
    const fetchMock = vi.fn().mockImplementation((input) => providerResponse(urlOf(input).includes("openai") ? "openai" : "unknown"));
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(request(guestBody()), env());
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"type":"complete"');
    expect(fetchMock.mock.calls.every(([input]) => !urlOf(input).includes("supabase.co"))).toBe(true);
  });

  it("rejects unknown models for guests before calling a provider", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(request(guestBody({ mode: "model", modelKey: "unknown" })), env());
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("MODEL_NOT_ALLOWED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized guest transcripts", async () => {
    const messages = Array.from({ length: 6 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: "x".repeat(20_000) }));
    messages[5]!.role = "user";
    const response = await worker.fetch(request({ selection: { mode: "auto" }, messages }), env());
    expect(response.status).toBe(400);
  });

  it("charges three guest provider calls for Compare", async () => {
    const testEnv = env();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input) => providerResponse(urlOf(input).includes("anthropic") ? "anthropic" : urlOf(input).includes("google") ? "google" : "openai")));
    const response = await worker.fetch(request(guestBody({ mode: "compare", modelKeys: ["openai-gpt-5.6-sol", "anthropic-claude-opus-5", "google-gemini-3.6-flash"] })), testEnv);
    expect(response.status).toBe(200); await response.text();
    expect(testEnv.GUEST_BURST.limit).toHaveBeenCalledTimes(1);
    expect(testEnv.GUEST_MINUTE.limit).toHaveBeenCalledTimes(3);
  });

  it("persists an authenticated response and uses authenticated limits", async () => {
    const fetchMock = vi.fn().mockImplementation((input, init?: RequestInit) => {
      const url = urlOf(input);
      if (url.includes("message_attachments")) return new Response("[]");
      if (url.includes("/rest/v1/messages") && init?.method === "POST") return new Response('[{"id":"30000000-0000-4000-8000-000000000000"}]');
      if (url.includes("/rest/v1/messages")) return new Response('[{"id":"20000000-0000-4000-8000-000000000000","role":"user","content":"Hello"}]');
      return providerResponse("openai");
    });
    vi.stubGlobal("fetch", fetchMock);
    const testEnv = env();
    const response = await handleRequest(request({ conversationId: "10000000-0000-4000-8000-000000000000", userMessageId: "20000000-0000-4000-8000-000000000000", selection: { mode: "model", modelKey: "openai-gpt-5.6-sol" } }, "Bearer valid-token"), testEnv, async () => ({ kind: "authenticated", userId: "user-123", token: "valid-token" }));
    expect(response.status).toBe(200); await response.text();
    expect(testEnv.USER_MINUTE.limit).toHaveBeenCalledTimes(1);
    expect(testEnv.GUEST_MINUTE.limit).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([input, init]) => urlOf(input).includes("/rest/v1/messages") && (init as RequestInit)?.method === "POST")).toBe(true);
  });

  it("returns 401 for an invalid token without using the guest path", async () => {
    const testEnv = env();
    const response = await worker.fetch(request(guestBody(), "Bearer invalid"), testEnv);
    expect(response.status).toBe(401);
    expect(testEnv.GUEST_MINUTE.limit).not.toHaveBeenCalled();
  });
});
