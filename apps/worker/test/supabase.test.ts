import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConversation } from "../src/supabase";
import type { Env } from "../src/env";

afterEach(() => vi.unstubAllGlobals());

describe("authenticated conversation context", () => {
  it("sends only the latest 50 messages through the selected user message", async () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      id: `m${index}`,
      role: index % 2 ? "user" : "assistant",
      content: `message ${index}`
    }));
    const fetchMock = vi.fn().mockImplementation((input: URL) =>
      new Response(input.pathname.endsWith("/messages") ? JSON.stringify(rows) : "[]"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await loadConversation({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "key" } as Env, "token", "c1", "m59");
    expect(result).toHaveLength(50);
    expect(result[0]?.content).toBe("message 10");
    expect(result.at(-1)?.content).toBe("message 59");
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain("m0,");
  });

  it("rejects oversized authenticated context before sending it to a provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: "m1", role: "user", content: "x".repeat(20_001) }
    ])));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadConversation({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "key" } as Env, "token", "c1", "m1"))
      .rejects.toThrow("PAYLOAD_TOO_LARGE");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
