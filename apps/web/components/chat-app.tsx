"use client";

import type { GenerationSelection, OrbitStreamEvent } from "@orbit/contracts";
import { ChevronDown, LogOut, Plus, Send, Trash2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createClient } from "@/lib/supabase/client";
import { readOrbitStream } from "@/lib/stream";

type Conversation = { id: string; title: string };
type Message = { id: string; role: "user" | "assistant"; content: string; provider?: string; model?: string; latency_ms?: number; comparison_group_id?: string };
const models = [
  { key: "openai-gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { key: "anthropic-claude-opus-5", label: "Claude Opus 5" },
  { key: "google-gemini-3.7-flash", label: "Gemini 3.7 Flash" }
];

export function ChatApp({ email }: { email: string }) {
  const supabase = createClient();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState("auto");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const aborter = useRef<AbortController | undefined>(undefined);

  useEffect(() => { void refreshConversations(); }, []);
  async function refreshConversations() { const { data } = await supabase.from("conversations").select("id,title").order("updated_at", { ascending: false }); setConversations(data ?? []); }
  async function openConversation(id: string) { setConversationId(id); const { data } = await supabase.from("messages").select("*").eq("conversation_id", id).order("created_at"); setMessages(data ?? []); }
  async function createConversation() { const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const { data } = await supabase.from("conversations").insert({ user_id: user.id }).select("id,title").single(); if (data) { setConversations((old) => [data, ...old]); setConversationId(data.id); setMessages([]); } }
  async function removeConversation(id: string) { await supabase.from("conversations").delete().eq("id", id); if (conversationId === id) { setConversationId(undefined); setMessages([]); } await refreshConversations(); }

  async function send() {
    if (!draft.trim() || running) return; setError("");
    let activeId = conversationId;
    if (!activeId) { const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const { data } = await supabase.from("conversations").insert({ user_id: user.id, title: draft.trim().slice(0, 72) }).select("id,title").single(); if (!data) return; activeId = data.id; setConversationId(activeId); setConversations((old) => [data, ...old]); }
    const text = draft.trim(); setDraft("");
    const { data: userMessage, error: insertError } = await supabase.from("messages").insert({ conversation_id: activeId, role: "user", content: text }).select("id,role,content").single();
    if (insertError || !userMessage) { setError(insertError?.message ?? "Could not save message"); return; }
    setMessages((old) => [...old, userMessage]); setRunning(true);
    const generationIds = new Map<string, string>();
    try {
      const { data: { session } } = await supabase.auth.getSession(); if (!session) throw new Error("Sign in to continue");
      aborter.current = new AbortController();
      const requestSelection: GenerationSelection = selection === "auto" ? { mode: "auto" } : selection === "compare" ? { mode: "compare", modelKeys: models.map((m) => m.key) } : { mode: "model", modelKey: selection };
      const response = await fetch(`${process.env.NEXT_PUBLIC_WORKER_URL}/v1/generations`, { method: "POST", headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ conversationId: activeId, userMessageId: userMessage.id, selection: requestSelection }), signal: aborter.current.signal });
      await readOrbitStream(response, (event: OrbitStreamEvent) => {
        if (event.type === "start") { const tempId = `stream-${event.generationId}`; generationIds.set(event.generationId, tempId); setMessages((old) => [...old, { id: tempId, role: "assistant", content: "", provider: event.provider, model: event.model }]); }
        if (event.type === "text_delta") setMessages((old) => old.map((m) => m.id === generationIds.get(event.generationId) ? { ...m, content: m.content + event.delta } : m));
        if (event.type === "metadata") setMessages((old) => old.map((m) => m.id === generationIds.get(event.generationId) ? { ...m, latency_ms: event.latencyMs } : m));
        if (event.type === "complete") setMessages((old) => old.map((m) => m.id === generationIds.get(event.generationId) ? { ...m, id: event.messageId } : m));
        if (event.type === "error") setError(event.error.message);
      });
    } catch (cause) { if ((cause as Error).name !== "AbortError") setError((cause as Error).message); }
    finally { setRunning(false); }
  }

  return <main className="shell">
    <aside className="sidebar"><div className="brand"><Image src="/orbit-logo.png" alt="Orbit" width={30} height={30}/><span>Orbit</span></div><button className="new-chat" onClick={createConversation}><Plus size={16}/> New conversation</button>
      <div className="conversation-list">{conversations.map((c) => <div key={c.id} style={{display:"grid",gridTemplateColumns:"1fr auto"}}><button className={`conversation ${c.id === conversationId ? "active" : ""}`} onClick={() => openConversation(c.id)}>{c.title}</button><button aria-label="Delete conversation" className="conversation" onClick={() => removeConversation(c.id)}><Trash2 size={14}/></button></div>)}</div>
      <div className="sidebar-bottom"><span>{email}</span><button className="icon-button" aria-label="Sign out" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/sign-in"; }}><LogOut size={16}/></button></div>
    </aside>
    <section className="main"><header className="topbar"><select className="model-button" value={selection} onChange={(e) => setSelection(e.target.value)}><option value="auto">Auto</option>{models.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}<option value="compare">Compare all three</option></select><span className="mode-note">{selection === "compare" ? "3 provider calls" : "Benchmark-informed routing"}</span></header>
      <div className="messages">{messages.length === 0 ? <div className="empty"><div><h1>Where should we begin?</h1><p>Ask once. Choose a model, let Orbit route it, or compare all three.</p></div></div> : messages.map((m) => <article key={m.id} className={`message ${m.role}`}><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{m.content || "Thinking…"}</ReactMarkdown>{m.role === "assistant" && <div className="message-meta">{m.model}{m.latency_ms ? ` · ${(m.latency_ms/1000).toFixed(1)}s` : ""}</div>}</article>)}</div>
      <footer className="composer-wrap"><div className="composer"><textarea aria-label="Message" placeholder={selection === "compare" ? "Ask all three models…" : "Message Orbit…"} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}/><button className="send" aria-label={running ? "Stop" : "Send"} disabled={!draft.trim() && !running} onClick={() => running ? aborter.current?.abort() : void send()}>{running ? "■" : <Send size={18}/>}</button></div>{error && <div className="error">{error} <button onClick={() => setError("")}>Dismiss</button></div>}</footer>
    </section>
  </main>;
}
