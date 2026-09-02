import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { composerHeight, isNearBottom, modes } from "../components/chat/config";
import { MessageList } from "../components/chat/message-list";

describe("chat presentation", () => {
  it("keeps every supported selection visible in its intended order", () => {
    expect(modes.map((mode) => mode.label)).toEqual(["Auto", "GPT-5.6 Sol", "Claude Opus 5", "Gemini 3.6 Flash", "Compare"]);
  });

  it("renders one comparison region containing all three model responses", () => {
    const messages = [
      { id: "gpt", role: "assistant" as const, content: "GPT answer", model: "gpt-5.6-sol", comparison_group_id: "group" },
      { id: "claude", role: "assistant" as const, content: "Claude answer", model: "claude-opus-5", comparison_group_id: "group" },
      { id: "gemini", role: "assistant" as const, content: "Gemini answer", model: "gemini-3.6-flash", comparison_group_id: "group" }
    ];
    const html = renderToStaticMarkup(<MessageList messages={messages} running={false} onSecondPass={vi.fn()} />);
    expect((html.match(/compare-card/g) ?? [])).toHaveLength(3);
    expect(html).toContain("GPT answer");
    expect(html).toContain("Claude answer");
    expect(html).toContain("Gemini answer");
  });

  it("caps multiline composer growth and detects intentional scroll-away", () => {
    expect(composerHeight(240)).toBe(160);
    expect(composerHeight(72)).toBe(72);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 790, clientHeight: 200 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 200 })).toBe(false);
  });
});
