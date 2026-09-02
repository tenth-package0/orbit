"use client";

import type { GenerationSelection, OrbitStreamEvent } from "@orbit/contracts";
import { Bot, ChevronRight, LogOut, Menu, MessageSquarePlus, Send, Sparkles, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createClient } from "@/lib/supabase/client";
import { readOrbitStream } from "@/lib/stream";

type Conversation = { id: string; title: string };
type Message = { id: string; role: "user" | "assistant"; content: string; provider?: string; model?: string; latency_ms?: number; comparison_group_id?: string; routingCategory?: string };
const models = [
  { key: "openai-gpt-5.6-sol", label: "GPT-5.6 Sol", short: "GPT", description: "Precise coding and structured work", color: "#79a7ff" },
  { key: "anthropic-claude-opus-5", label: "Claude Opus 5", short: "Claude", description: "Deep reasoning and nuanced writing", color: "#e7a977" },
  { key: "google-gemini-3.7-flash", label: "Gemini 3.7 Flash", short: "Gemini", description: "Fast synthesis and long context", color: "#75d7b2" }
];

export function ChatApp({ email }: { email: string }) {
  const supabase = createClient();
  const [conversations, setConversations] = useState<Conversation[]>([]), [conversationId, setConversationId] = useState<string>(), [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState(""), [selection, setSelection] = useState("auto"), [running, setRunning] = useState(false), [error, setError] = useState(""), [sidebarOpen, setSidebarOpen] = useState(false);
  const aborter = useRef<AbortController | undefined>(undefined), messagesPane = useRef<HTMLDivElement>(null), composerInput = useRef<HTMLTextAreaElement>(null), nearBottom = useRef(true);

  useEffect(() => { void refreshConversations(); }, []);
  useEffect(() => {
    const textarea = composerInput.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [draft]);
  useEffect(() => {
    const pane = messagesPane.current;
    if (!pane || !nearBottom.current) return;
    requestAnimationFrame(() => pane.scrollTo({ top: pane.scrollHeight, behavior: running ? "auto" : "smooth" }));
  }, [messages, running]);
  function trackScroll() { const pane = messagesPane.current; if (pane) nearBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 120; }
  async function refreshConversations() { const { data } = await supabase.from("conversations").select("id,title").order("updated_at", { ascending: false }); setConversations(data ?? []); }
  async function openConversation(id: string) { nearBottom.current = true; setConversationId(id); setSidebarOpen(false); const { data } = await supabase.from("messages").select("*").eq("conversation_id", id).order("created_at"); setMessages(data ?? []); }
  async function createConversation() { const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const { data } = await supabase.from("conversations").insert({ user_id: user.id }).select("id,title").single(); if (data) { nearBottom.current = true; setConversations((old) => [data, ...old]); setConversationId(data.id); setMessages([]); setSidebarOpen(false); } }
  async function removeConversation(id: string) { await supabase.from("conversations").delete().eq("id", id); if (conversationId === id) { setConversationId(undefined); setMessages([]); } await refreshConversations(); }

  async function generate(activeId: string, userMessageId: string, chosen: string) {
    setRunning(true); setError(""); const generationIds = new Map<string, string>();
    try {
      const { data: { session } } = await supabase.auth.getSession(); if (!session) throw new Error("Sign in to continue");
      aborter.current = new AbortController();
      const requestSelection: GenerationSelection = chosen === "auto" ? { mode: "auto" } : chosen === "compare" ? { mode: "compare", modelKeys: models.map((model) => model.key) } : { mode: "model", modelKey: chosen };
      const response = await fetch(`${process.env.NEXT_PUBLIC_WORKER_URL}/v1/generations`, { method: "POST", headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ conversationId: activeId, userMessageId, selection: requestSelection }), signal: aborter.current.signal });
      await readOrbitStream(response, (event: OrbitStreamEvent) => {
        if (event.type === "start") { const tempId = `stream-${event.generationId}`; generationIds.set(event.generationId, tempId); setMessages((old) => [...old, { id: tempId, role: "assistant", content: "", provider: event.provider, model: event.model, comparison_group_id: event.comparisonGroupId, routingCategory: event.routing?.category }]); }
        if (event.type === "text_delta") setMessages((old) => old.map((message) => message.id === generationIds.get(event.generationId) ? { ...message, content: message.content + event.delta } : message));
        if (event.type === "metadata") setMessages((old) => old.map((message) => message.id === generationIds.get(event.generationId) ? { ...message, latency_ms: event.latencyMs } : message));
        if (event.type === "complete") setMessages((old) => old.map((message) => message.id === generationIds.get(event.generationId) ? { ...message, id: event.messageId } : message));
        if (event.type === "error") setError(event.error.message);
      });
    } catch (cause) { if ((cause as Error).name !== "AbortError") setError((cause as Error).message); } finally { setRunning(false); }
  }

  async function send() {
    if (!draft.trim() || running) return; nearBottom.current = true; let activeId = conversationId; const text = draft.trim(); setDraft("");
    if (!activeId) { const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const { data } = await supabase.from("conversations").insert({ user_id: user.id, title: text.slice(0, 72) }).select("id,title").single(); if (!data) return; activeId = data.id; setConversationId(activeId); setConversations((old) => [data, ...old]); }
    const { data: userMessage, error: insertError } = await supabase.from("messages").insert({ conversation_id: activeId, role: "user", content: text }).select("id,role,content").single();
    if (insertError || !userMessage) { setError(insertError?.message ?? "Could not save message"); return; } setMessages((old) => [...old, userMessage]); await generate(activeId!, userMessage.id, selection);
  }
  async function secondPass(modelKey: string) { if (!conversationId || running) return; const lastUser = [...messages].reverse().find((message) => message.role === "user"); if (lastUser) await generate(conversationId, lastUser.id, modelKey); }

  return <main className="shell"><div className={`mobile-shade ${sidebarOpen ? "show" : ""}`} onClick={() => setSidebarOpen(false)}/>
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}><div className="brand"><Image src="/orbit-logo.png" alt="Orbit" width={31} height={31}/><span>Orbit</span><button className="sidebar-close" onClick={() => setSidebarOpen(false)}><X size={18}/></button></div><button className="new-chat" onClick={createConversation}><MessageSquarePlus size={17}/>New conversation</button><div className="history-label">Recent</div><div className="conversation-list">{conversations.map((conversation) => <div className="conversation-row" key={conversation.id}><button className={`conversation ${conversation.id === conversationId ? "active" : ""}`} onClick={() => openConversation(conversation.id)}>{conversation.title}</button><button aria-label="Delete conversation" className="delete-chat" onClick={() => removeConversation(conversation.id)}><Trash2 size={14}/></button></div>)}</div><div className="sidebar-bottom"><span>{email}</span><button className="icon-button" aria-label="Sign out" onClick={async () => { await supabase.auth.signOut(); location.href = "/sign-in"; }}><LogOut size={16}/></button></div></aside>
    <section className="main"><header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={19}/></button><div className="model-tabs"><button className={`model-tab auto ${selection === "auto" ? "selected" : ""}`} onClick={() => setSelection("auto")}><Sparkles size={14}/>Auto</button>{models.map((model) => <button key={model.key} className={`model-tab ${selection === model.key ? "selected" : ""}`} onClick={() => setSelection(model.key)}><i style={{background:model.color}}/>{model.short}</button>)}<button className={`model-tab ${selection === "compare" ? "selected" : ""}`} onClick={() => setSelection("compare")}>Compare</button></div><span className="mode-note">{selection === "auto" ? "Routes every prompt" : selection === "compare" ? "3 models · 3 calls" : "Context retained"}</span></header>
      <div className="messages" ref={messagesPane} onScroll={trackScroll}>{messages.length === 0 ? <Welcome selection={selection} onSelect={setSelection}/> : <>{renderMessages(messages, running, secondPass)}<div className="chat-end-spacer" aria-hidden="true"/></>}</div>
      <footer className="composer-wrap"><div className="composer"><textarea ref={composerInput} aria-label="Message" rows={1} placeholder={selection === "compare" ? "Ask all three models…" : "Message Orbit…"} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}/><button className="send" aria-label={running ? "Stop" : "Send"} disabled={!draft.trim() && !running} onClick={() => running ? aborter.current?.abort() : void send()}>{running ? <X size={18}/> : <Send size={18}/>}</button></div><div className="composer-foot"><span>{selection === "auto" ? "Auto chooses by capability · full thread context follows" : `${modelName(selection)} selected · switch anytime`}</span><span>Enter to send</span></div>{error && <div className="error"><span>{error}</span><button onClick={() => setError("")}>Dismiss</button></div>}</footer></section>
  </main>;
}

function Welcome({ selection, onSelect }: { selection: string; onSelect: (key: string) => void }) { return <div className="empty"><div className="welcome-mark"><Sparkles size={19}/></div><h1>One conversation.<br/><span>The right intelligence.</span></h1><p>Start in Auto, or choose who answers first. Switch at any point—the full conversation follows.</p><div className="starter-models"><button className={`starter auto ${selection === "auto" ? "selected" : ""}`} onClick={() => onSelect("auto")}><span className="model-orb"><Sparkles size={17}/></span><strong>Auto route</strong><small>Best model for each prompt</small><ChevronRight size={16}/></button>{models.map((model) => <button className={`starter ${selection === model.key ? "selected" : ""}`} key={model.key} onClick={() => onSelect(model.key)}><span className="model-orb" style={{color:model.color}}><Bot size={17}/></span><strong>{model.label}</strong><small>{model.description}</small><ChevronRight size={16}/></button>)}</div></div>; }
function renderMessages(messages: Message[], running: boolean, secondPass: (key: string) => void) { const groups = new Set<string>(); return messages.flatMap((message, index) => { if (!message.comparison_group_id) return [<MessageCard key={message.id} message={message} latest={index === messages.length - 1} running={running} onSecondPass={secondPass}/>]; if (groups.has(message.comparison_group_id)) return []; groups.add(message.comparison_group_id); return [<div className="comparison" key={message.comparison_group_id}>{messages.filter((item) => item.comparison_group_id === message.comparison_group_id).map((item) => <MessageCard key={item.id} message={item} latest={false} running={running} onSecondPass={secondPass}/>)}</div>]; }); }
function MessageCard({ message, latest, running, onSecondPass }: { message: Message; latest: boolean; running: boolean; onSecondPass: (key: string) => void }) { const suggestion = suggestedModel(message.model); return <article className={`message ${message.role}`}><div className="message-body"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{message.content}</ReactMarkdown>{!message.content && <div className="thinking"><i/><i/><i/></div>}</div>{message.role === "assistant" && <><div className="message-meta"><span className="model-dot" style={{background:modelColor(message.model)}}/>{modelName(message.model)}{message.routingCategory && <span>Auto · {message.routingCategory}</span>}{message.latency_ms ? <span>{(message.latency_ms/1000).toFixed(1)}s</span> : null}</div>{latest && message.content && suggestion && <div className="model-suggestion"><div><Sparkles size={14}/><span><strong>{suggestion.short}</strong> is preferred for a complementary second pass.</span></div><button disabled={running} onClick={() => onSecondPass(suggestion.key)}>Generate with {suggestion.short}<ChevronRight size={14}/></button></div>}</>}</article>; }
function modelName(id?: string) { if (id === "auto") return "Auto"; if (id === "compare") return "Compare"; return models.find((model) => model.key === id || model.key.endsWith(id ?? "__"))?.label ?? id ?? "Orbit"; }
function modelColor(id?: string) { return models.find((model) => model.key === id || model.key.endsWith(id ?? "__"))?.color ?? "#9da7ff"; }
function suggestedModel(current?: string) { if (!current) return undefined; return current.includes("claude") ? models[0] : models[1]; }
