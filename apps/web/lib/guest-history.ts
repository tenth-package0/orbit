export type GuestMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  model?: string;
  latency_ms?: number;
  comparison_group_id?: string;
  routingCategory?: string;
  failed?: boolean;
};

export type GuestConversation = { id: string; title: string; updatedAt: number; messages: GuestMessage[] };
export const guestHistoryKey = "orbit.guest-history.v1";
const guestSessionKey = "orbit.guest-session.v1";

function isGuestMessage(value: unknown): value is GuestMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    (message.provider === undefined || typeof message.provider === "string") &&
    (message.model === undefined || typeof message.model === "string") &&
    (message.latency_ms === undefined || typeof message.latency_ms === "number") &&
    (message.comparison_group_id === undefined || typeof message.comparison_group_id === "string") &&
    (message.routingCategory === undefined || typeof message.routingCategory === "string");
}

function isGuestConversation(value: unknown): value is GuestConversation {
  if (!value || typeof value !== "object") return false;
  const conversation = value as Record<string, unknown>;
  return typeof conversation.id === "string" &&
    typeof conversation.title === "string" &&
    typeof conversation.updatedAt === "number" && Number.isFinite(conversation.updatedAt) &&
    Array.isArray(conversation.messages) && conversation.messages.every(isGuestMessage);
}

export function normalizeGuestTranscript(messages: GuestMessage[], targetUserMessageId: string) {
  const targetIndex = messages.findIndex((message) => message.id === targetUserMessageId);
  return messages.slice(0, targetIndex < 0 ? undefined : targetIndex + 1).filter((message) => !message.failed && !message.id.startsWith("stream-")).slice(-50).map(({ role, content }) => ({ role, content }));
}

export function readGuestHistory(): { activeId?: string; conversations: GuestConversation[] } {
  try {
    const parsed = JSON.parse(localStorage.getItem(guestHistoryKey) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") return { conversations: [] };
    const saved = parsed as Record<string, unknown>;
    if (saved.version !== 1 || !Array.isArray(saved.conversations)) return { conversations: [] };
    const conversations = saved.conversations.filter(isGuestConversation).slice(0, 20);
    const activeId = typeof saved.activeId === "string" && conversations.some((item) => item.id === saved.activeId)
      ? saved.activeId : undefined;
    return { activeId, conversations };
  } catch { return { conversations: [] }; }
}

export function writeGuestHistory(conversations: GuestConversation[], activeId?: string) {
  const safe = conversations.slice(0, 20).map((conversation) => ({
    id: conversation.id,
    title: conversation.title.slice(0, 120),
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.filter((message) => !message.failed && !message.id.startsWith("stream-")).slice(-100).map(({ id, role, content, provider, model, latency_ms, comparison_group_id, routingCategory }) => ({ id, role, content, provider, model, latency_ms, comparison_group_id, routingCategory }))
  }));
  let payload = JSON.stringify({ version: 1, activeId, conversations: safe });
  while (payload.length > 750_000 && safe.length > 1) { safe.pop(); payload = JSON.stringify({ version: 1, activeId, conversations: safe }); }
  try { localStorage.setItem(guestHistoryKey, payload); } catch { /* The active chat remains usable when browser storage is unavailable. */ }
}

export function getGuestSessionId() {
  try {
    let id = localStorage.getItem(guestSessionKey);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(guestSessionKey, id); }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
