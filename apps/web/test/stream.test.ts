import { describe, expect, it } from "vitest";
import { readOrbitStream } from "../lib/stream";

describe("Orbit stream client", () => {
  it("parses events split across chunks", async () => {
    const payload = 'data: {"type":"text_delta","generationId":"1","delta":"Hi"}\n\n';
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(payload.slice(0, 20))); controller.enqueue(new TextEncoder().encode(payload.slice(20))); controller.close(); } });
    const events: unknown[] = [];
    await readOrbitStream(new Response(body), (event) => events.push(event));
    expect(events).toEqual([{ type: "text_delta", generationId: "1", delta: "Hi" }]);
  });
});

