import type { OrbitStreamEvent, PublicError } from "@orbit/contracts";
import { routePrompt } from "@orbit/router";
import { authenticate } from "./auth";
import type { Env } from "./env";
import { getModel, MODELS } from "./models";
import { adapters } from "./providers";
import { ProviderHttpError } from "./providers/provider";
import { loadConversation, saveAssistant } from "./supabase";
import { generationSchema } from "./validation";

const encoder = new TextEncoder();
const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const sse = (event: OrbitStreamEvent) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

function publicError(code: PublicError["code"], requestId: string, retryable = false): PublicError {
  const messages: Record<PublicError["code"], string> = {
    UNAUTHENTICATED: "Sign in to continue.", FORBIDDEN: "You cannot access this conversation.", INVALID_REQUEST: "The request is invalid.", PAYLOAD_TOO_LARGE: "The request is too large.", MODEL_NOT_ALLOWED: "That model is not available.", RATE_LIMITED: "Too many requests. Try again shortly.", PROVIDER_RATE_LIMITED: "The model provider is busy. Try again shortly.", PROVIDER_TIMEOUT: "The model provider timed out.", PROVIDER_UNAVAILABLE: "The model provider is unavailable.", PROVIDER_BAD_RESPONSE: "The model provider returned an invalid response.", STREAM_INTERRUPTED: "The response stream was interrupted.", CANCELLED: "Generation was cancelled.", INTERNAL_ERROR: "Something went wrong."
  };
  return { code, message: messages[code], retryable, requestId };
}

function cors(request: Request, env: Env) {
  const origin = request.headers.get("origin") ?? "";
  return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).includes(origin) ? origin : null;
}

async function rateLimit(env: Env, userId: string, ip: string, units: number) {
  for (let i = 0; i < units; i++) {
    const [minute, burst, address] = await Promise.all([env.USER_MINUTE.limit({ key: userId }), env.USER_BURST.limit({ key: userId }), env.IP_MINUTE.limit({ key: ip })]);
    if (!minute.success || !burst.success || !address.success) return false;
  }
  return true;
}

function providerKey(env: Env, provider: string) {
  return provider === "openai" ? env.OPENAI_API_KEY : provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.GEMINI_API_KEY;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const allowedOrigin = cors(request, env);
    const corsHeaders: Record<string, string> = allowedOrigin ? { "access-control-allow-origin": allowedOrigin, vary: "Origin", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "POST,OPTIONS" } : {};
    if (request.method === "OPTIONS") return allowedOrigin ? new Response(null, { status: 204, headers: corsHeaders }) : json({ error: publicError("FORBIDDEN", requestId) }, 403);
    if (!allowedOrigin) return json({ error: publicError("FORBIDDEN", requestId) }, 403);
    if (new URL(request.url).pathname !== "/v1/generations" || request.method !== "POST") return json({ error: publicError("INVALID_REQUEST", requestId) }, 404, corsHeaders);
    if (Number(request.headers.get("content-length") ?? 0) > 262_144) return json({ error: publicError("PAYLOAD_TOO_LARGE", requestId) }, 413, corsHeaders);

    try {
      const { userId, token } = await authenticate(request, env.SUPABASE_URL);
      const parsed = generationSchema.safeParse(await request.json());
      if (!parsed.success) return json({ error: publicError("INVALID_REQUEST", requestId) }, 400, corsHeaders);
      const input = parsed.data;
      const requestedKeys = input.selection.mode === "compare" ? input.selection.modelKeys : input.selection.mode === "model" ? [input.selection.modelKey] : [];
      if (requestedKeys.some((key) => !getModel(key))) return json({ error: publicError("MODEL_NOT_ALLOWED", requestId) }, 400, corsHeaders);
      const units = input.selection.mode === "compare" ? requestedKeys.length : 1;
      if (!await rateLimit(env, userId, request.headers.get("cf-connecting-ip") ?? "unknown", units)) return json({ error: { ...publicError("RATE_LIMITED", requestId, true), retryAfterSeconds: 60 } }, 429, { ...corsHeaders, "retry-after": "60" });
      const messages = await loadConversation(env, token, input.conversationId, input.userMessageId);
      const lastPrompt = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
      const routing = input.selection.mode === "auto" ? routePrompt(lastPrompt, MODELS) : undefined;
      const keys = routing ? [routing.modelKey] : requestedKeys;
      const comparisonGroupId = keys.length > 1 ? crypto.randomUUID() : undefined;
      const stream = new TransformStream<Uint8Array, Uint8Array>();
      const writer = stream.writable.getWriter();

      void Promise.all(keys.map(async (key) => {
        const model = getModel(key)!;
        const generationId = crypto.randomUUID();
        const started = Date.now();
        let content = "";
        let usage: { inputTokens?: number; outputTokens?: number } = {};
        await writer.write(sse({ type: "start", requestId, generationId, provider: model.provider, model: model.id, comparisonGroupId, routing }));
        try {
          for await (const event of adapters[model.provider].stream({ model: model.id, messages, maxOutputTokens: Math.min(model.maxOutputTokens, 8192), signal: request.signal }, providerKey(env, model.provider))) {
            if (event.type === "text_delta") { content += event.text; await writer.write(sse({ type: "text_delta", generationId, delta: event.text })); }
            if (event.type === "usage") usage = { inputTokens: event.inputTokens, outputTokens: event.outputTokens };
            if (event.type === "complete") {
              const latencyMs = Date.now() - started;
              const messageId = await saveAssistant(env, token, input.conversationId, model, content, latencyMs, usage, comparisonGroupId);
              await writer.write(sse({ type: "metadata", generationId, latencyMs, ...usage }));
              await writer.write(sse({ type: "complete", generationId, finishReason: event.finishReason, messageId }));
            }
          }
        } catch (error) {
          const code = error instanceof ProviderHttpError && error.status === 429 ? "PROVIDER_RATE_LIMITED" : error instanceof DOMException && error.name === "AbortError" ? "CANCELLED" : "PROVIDER_UNAVAILABLE";
          await writer.write(sse({ type: "error", generationId, error: publicError(code, requestId, code !== "CANCELLED") }));
        }
      })).finally(() => writer.close());

      return new Response(stream.readable, { headers: { ...corsHeaders, "content-type": "text/event-stream", "cache-control": "no-store", "x-request-id": requestId } });
    } catch (error) {
      const code = error instanceof Error && ["UNAUTHENTICATED", "FORBIDDEN"].includes(error.message) ? error.message as "UNAUTHENTICATED" | "FORBIDDEN" : "INTERNAL_ERROR";
      console.error(JSON.stringify({ requestId, outcome: "error", code }));
      return json({ error: publicError(code, requestId) }, code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : 500, corsHeaders);
    }
  }
};
