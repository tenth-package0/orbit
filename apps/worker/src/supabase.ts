import type { ChatAttachment, ChatMessage, ModelDefinition } from "@orbit/contracts";
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
  const targetIndex = rows.findIndex((row) => row.id === userMessageId && row.role === "user");
  if (targetIndex < 0) throw new Error("FORBIDDEN");

  const messageIds = rows.slice(0, targetIndex + 1).map((row) => row.id);
  const attachmentsUrl = new URL(`${env.SUPABASE_URL}/rest/v1/message_attachments`);
  attachmentsUrl.searchParams.set("select", "id,message_id,file_name,mime_type,size_bytes,storage_path");
  attachmentsUrl.searchParams.set("message_id", `in.(${messageIds.join(",")})`);
  attachmentsUrl.searchParams.set("order", "created_at.asc");
  const attachmentsResponse = await fetch(attachmentsUrl, { headers: headers(env, token) });
  if (!attachmentsResponse.ok) throw new Error("FORBIDDEN");
  const metadata = await attachmentsResponse.json() as Array<{ id: string; message_id: string; file_name: string; mime_type: ChatAttachment["mimeType"]; size_bytes: number; storage_path: string }>;
  const grouped = new Map<string, typeof metadata>();
  for (const attachment of metadata) grouped.set(attachment.message_id, [...(grouped.get(attachment.message_id) ?? []), attachment]);
  const activeAttachmentMessage = [...rows.slice(0, targetIndex + 1)].reverse().find((row) => row.role === "user" && grouped.has(row.id));
  const activeMetadata = activeAttachmentMessage ? grouped.get(activeAttachmentMessage.id) ?? [] : [];
  if (activeMetadata.reduce((total, item) => total + item.size_bytes, 0) > 20 * 1024 * 1024) throw new Error("PAYLOAD_TOO_LARGE");
  const activeAttachments = new Map<string, ChatAttachment[]>();
  if (activeAttachmentMessage) {
    const downloaded = await Promise.all(activeMetadata.map(async (attachment) => {
      const path = attachment.storage_path.split("/").map(encodeURIComponent).join("/");
      const file = await fetch(`${env.SUPABASE_URL}/storage/v1/object/authenticated/message-attachments/${path}`, { headers: headers(env, token) });
      if (!file.ok) throw new Error("FORBIDDEN");
      return { id: attachment.id, fileName: attachment.file_name, mimeType: attachment.mime_type, sizeBytes: attachment.size_bytes, data: arrayBufferToBase64(await file.arrayBuffer()) };
    }));
    activeAttachments.set(activeAttachmentMessage.id, downloaded);
  }

  return rows.slice(0, targetIndex + 1).map(({ id, role, content }) => {
    const names = grouped.get(id)?.map((item) => item.file_name) ?? [];
    const annotated = names.length && !activeAttachments.has(id) ? `${content}\n\n[Earlier attachments: ${names.join(", ")}]` : content;
    return { role, content: annotated, attachments: activeAttachments.get(id) };
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
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
