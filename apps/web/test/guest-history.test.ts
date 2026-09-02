import { afterEach, describe, expect, it, vi } from "vitest";
import { getGuestSessionId, normalizeGuestTranscript, readGuestHistory, writeGuestHistory } from "../lib/guest-history";

function storage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key))
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("guest chat state", () => {
  it("sends only persisted context through the target user message", () => {
    const transcript = normalizeGuestTranscript([
      { id: "u1", role: "user", content: "First" },
      { id: "a1", role: "assistant", content: "Answer" },
      { id: "failed", role: "assistant", content: "Unavailable", failed: true },
      { id: "u2", role: "user", content: "Second" },
      { id: "stream-temp", role: "assistant", content: "Partial" }
    ], "u2");

    expect(transcript).toEqual([
      { role: "user", content: "First" },
      { role: "assistant", content: "Answer" },
      { role: "user", content: "Second" }
    ]);
  });

  it("persists a bounded local history without failed or streaming messages", () => {
    const local = storage();
    vi.stubGlobal("localStorage", local);
    const conversations = Array.from({ length: 24 }, (_, index) => ({
      id: `c${index}`,
      title: `Conversation ${index}`,
      updatedAt: index,
      messages: [
        { id: `u${index}`, role: "user" as const, content: "Hello" },
        { id: `stream-${index}`, role: "assistant" as const, content: "Partial" },
        { id: `failed-${index}`, role: "assistant" as const, content: "Error", failed: true }
      ]
    }));

    writeGuestHistory(conversations, "c0");
    const saved = JSON.parse(local.setItem.mock.calls[0]![1]);
    expect(saved.conversations).toHaveLength(20);
    expect(saved.conversations[0].messages).toEqual([{ id: "u0", role: "user", content: "Hello" }]);
  });

  it("loads valid history and ignores corrupt storage", () => {
    const local = storage({
      "orbit.guest-history.v1": JSON.stringify({ version: 1, activeId: "c1", conversations: [{ id: "c1", title: "Chat", updatedAt: 1, messages: [] }] })
    });
    vi.stubGlobal("localStorage", local);
    expect(readGuestHistory().activeId).toBe("c1");
    local.getItem.mockImplementation(() => "not-json");
    expect(readGuestHistory()).toEqual({ conversations: [] });
  });

  it("keeps guest sending available when browser storage is blocked", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: vi.fn() });
    vi.stubGlobal("crypto", { randomUUID: () => "temporary-session" });
    expect(getGuestSessionId()).toBe("temporary-session");
  });
});
