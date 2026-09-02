import type { ChatMessage, ModelDefinition } from "@orbit/contracts";
import type { Env } from "./env";

function headers(env: Env, token: string) {
  return { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" };
}

export async function loadConversation(env: Env, token: string, conversationId: string, userMessageId: string): Promise<ChatMessage[]> {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/messages`);
  url.searchParams.set("select", "id,role,content");
  url.searchParams.set("conversation_id", `eq.${conversationId}`);
  url.searchParams.set("order", "created_at.asc");
  const response = await fetch(url, { headers: headers(env, token) });
  if (!response.ok) throw new Error("FORBIDDEN");
  const rows = await response.json() as Array<{ id: string; role: "user" | "assistant"; content: string }>;
  if (!rows.some((row) => row.id === userMessageId)) throw new Error("FORBIDDEN");
  return rows.map(({ role, content }) => ({ role, content }));
}

export async function saveAssistant(env: Env, token: string, conversationId: string, model: ModelDefinition, content: string, latencyMs: number, usage: { inputTokens?: number; outputTokens?: number }, comparisonGroupId?: string) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/messages`, {
    method: "POST",
    headers: { ...headers(env, token), prefer: "return=representation" },
    body: JSON.stringify({ conversation_id: conversationId, role: "assistant", content, provider: model.provider, model: model.id, latency_ms: latencyMs, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, comparison_group_id: comparisonGroupId })
  });
  if (!response.ok) throw new Error("INTERNAL_ERROR");
  const rows = await response.json() as Array<{ id: string }>;
  return rows[0]!.id;
}
