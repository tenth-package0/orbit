import type { OrbitStreamEvent } from "@orbit/contracts";

export async function readOrbitStream(response: Response, onEvent: (event: OrbitStreamEvent) => void) {
  if (!response.ok) throw new Error((await response.json()).error?.message ?? "Generation failed");
  if (!response.body) throw new Error("Response stream is unavailable");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  const emit = (frame: string) => {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (data) onEvent(JSON.parse(data));
  };
  while (true) {
    const { value, done } = await reader.read(); buffer += value ?? "";
    const frames = buffer.split(/\r?\n\r?\n/); buffer = frames.pop() ?? "";
    for (const frame of frames) emit(frame);
    if (done) {
      if (buffer) emit(buffer);
      break;
    }
  }
}

