"use client";

import type { GenerationSelection, OrbitStreamEvent } from "@orbit/contracts";
import { ArrowDown, ArrowUp, FileText, ImageIcon, LogOut, Menu, Paperclip, Plus, Square, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createClient } from "@/lib/supabase/client";
import { getGuestSessionId, guestHistoryKey, normalizeGuestTranscript, readGuestHistory, writeGuestHistory, type GuestConversation } from "@/lib/guest-history";
import { readOrbitStream } from "@/lib/stream";

type Conversation = { id: string; title: string };
type Attachment = { id: string; file_name: string; mime_type: string; size_bytes: number; storage_path: string; previewUrl?: string };
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  model?: string;
  latency_ms?: number;
  comparison_group_id?: string;
  routingCategory?: string;
  message_attachments?: Attachment[];
  failed?: boolean;
};

const allowedAttachmentTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"]);

const models = [
  { key: "openai-gpt-5.6-sol", label: "GPT-5.6 Sol", short: "GPT", description: "Precise coding and structured work", color: "#79a7ff" },
  { key: "anthropic-claude-opus-5", label: "Claude Opus 5", short: "Claude", description: "Deep reasoning and nuanced writing", color: "#e7a977" },
  { key: "google-gemini-3.6-flash", label: "Gemini 3.6 Flash", short: "Gemini", description: "Fast synthesis and long context", color: "#75d7b2" }
];

// The five selectable modes, in the order they appear in the top bar and the welcome list.
const modes = [
  { key: "auto", label: "Auto", description: "Routes each prompt to the strongest model" },
  ...models.map((model) => ({ key: model.key, label: model.label, description: model.description })),
  { key: "compare", label: "Compare", description: "All three answer side by side" }
];

const icon = { size: 16, strokeWidth: 1.75 };

export function ChatApp({ email }: { email?: string }) {
  const supabase = createClient();
  const signedIn = Boolean(email);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [guestConversations, setGuestConversations] = useState<GuestConversation[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState("auto");
  const [running, setRunning] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [atBottom, setAtBottom] = useState(true);

  const aborter = useRef<AbortController | undefined>(undefined);
  const messagesPane = useRef<HTMLDivElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Mirrors `atBottom` for use inside effects without re-running them on every scroll.
  const nearBottom = useRef(true);
  const guestHydrated = useRef(false);

  useEffect(() => {
    if (signedIn) { void refreshConversations(); return; }
    const state = readGuestHistory();
    guestHydrated.current = true;
    setGuestConversations(state.conversations);
    const active = state.conversations.find((conversation) => conversation.id === state.activeId) ?? state.conversations[0];
    if (active) { setConversationId(active.id); setMessages(active.messages); }
  }, [signedIn]);

  useEffect(() => {
    if (signedIn || !guestHydrated.current || !conversationId) return;
    setGuestConversations((old) => old.map((conversation) => conversation.id === conversationId ? { ...conversation, messages, updatedAt: Date.now() } : conversation));
  }, [messages, conversationId, signedIn]);

  useEffect(() => {
    if (signedIn || !guestHydrated.current) return;
    const timer = window.setTimeout(() => writeGuestHistory(guestConversations, conversationId), 250);
    return () => window.clearTimeout(timer);
  }, [guestConversations, conversationId, signedIn]);

  // Grow the textarea with its content, then keep the thread pinned if the reader was at the end.
  useEffect(() => {
    const textarea = composerInput.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    const pane = messagesPane.current;
    if (pane && nearBottom.current) pane.scrollTo({ top: pane.scrollHeight, behavior: "instant" });
  }, [draft]);

  // Keep the end of the thread in view as content streams in or the composer area grows,
  // but only while the reader has not scrolled up on purpose. Instant scrolling here
  // avoids mid-animation scroll events being mistaken for the reader scrolling away.
  useEffect(() => {
    const pane = messagesPane.current;
    if (!pane || !nearBottom.current) return;
    pane.scrollTo({ top: pane.scrollHeight, behavior: "instant" });
  }, [messages, running, error, pendingFiles]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [sidebarOpen]);

  function trackScroll() {
    const pane = messagesPane.current;
    if (!pane) return;
    const near = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 120;
    nearBottom.current = near;
    setAtBottom(near);
  }

  function pinToBottom() {
    nearBottom.current = true;
    setAtBottom(true);
  }

  function scrollToLatest() {
    pinToBottom();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    messagesPane.current?.scrollTo({ top: messagesPane.current.scrollHeight, behavior: reduceMotion ? "instant" : "smooth" });
  }

  async function refreshConversations() {
    const { data } = await supabase.from("conversations").select("id,title").order("updated_at", { ascending: false });
    setConversations(data ?? []);
  }

  async function openConversation(id: string) {
    pinToBottom();
    setConversationId(id);
    setSidebarOpen(false);
    setPendingFiles([]);
    if (!signedIn) {
      setMessages(guestConversations.find((conversation) => conversation.id === id)?.messages ?? []);
      return;
    }
    setLoadingConversation(true);
    const { data } = await supabase.from("messages").select("*,message_attachments(id,file_name,mime_type,size_bytes,storage_path)").eq("conversation_id", id).order("created_at");
    setMessages(await addSignedPreviews(data ?? []));
    setLoadingConversation(false);
  }

  async function createConversation() {
    if (!signedIn) {
      const conversation = { id: crypto.randomUUID(), title: "New conversation", updatedAt: Date.now(), messages: [] };
      pinToBottom();
      setGuestConversations((old) => [conversation, ...old].slice(0, 20));
      setConversationId(conversation.id);
      setMessages([]);
      setPendingFiles([]);
      setSidebarOpen(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("conversations").insert({ user_id: user.id }).select("id,title").single();
    if (!data) return;
    pinToBottom();
    setConversations((old) => [data, ...old]);
    setConversationId(data.id);
    setMessages([]);
    setPendingFiles([]);
    setSidebarOpen(false);
  }

  async function removeConversation(id: string) {
    if (!signedIn) {
      const remaining = guestConversations.filter((conversation) => conversation.id !== id);
      setGuestConversations(remaining);
      if (conversationId === id) {
        const next = remaining[0];
        setConversationId(next?.id);
        setMessages(next?.messages ?? []);
        setPendingFiles([]);
      }
      return;
    }
    const { data: rows } = await supabase.from("messages").select("id").eq("conversation_id", id);
    const ids = rows?.map((row) => row.id) ?? [];
    if (ids.length) {
      const { data: files } = await supabase.from("message_attachments").select("storage_path").in("message_id", ids);
      const paths = files?.map((file) => file.storage_path) ?? [];
      if (paths.length) await supabase.storage.from("message-attachments").remove(paths);
    }
    await supabase.from("conversations").delete().eq("id", id);
    if (conversationId === id) { setConversationId(undefined); setMessages([]); setPendingFiles([]); }
    await refreshConversations();
  }

  async function addSignedPreviews(rows: Message[]) {
    const paths = rows.flatMap((message) => message.message_attachments ?? []).filter((item) => item.mime_type.startsWith("image/")).map((item) => item.storage_path);
    if (!paths.length) return rows;
    const { data } = await supabase.storage.from("message-attachments").createSignedUrls(paths, 3600);
    const urls = new Map(data?.map((item) => [item.path, item.signedUrl ?? undefined]) ?? []);
    return rows.map((message) => ({ ...message, message_attachments: message.message_attachments?.map((item) => ({ ...item, previewUrl: urls.get(item.storage_path) })) }));
  }

  function chooseFiles(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files);
    const normalized = incoming.map((file) => file.type || (file.name.toLowerCase().endsWith(".txt") ? "text/plain" : ""));
    if (incoming.some((file, index) => !allowedAttachmentTypes.has(normalized[index]!))) return setError("Use PNG, JPEG, WebP, PDF, or plain-text files.");
    if (incoming.some((file) => file.size > 10 * 1024 * 1024)) return setError("Each attachment must be 10 MB or smaller.");
    const next = [...pendingFiles, ...incoming];
    if (next.length > 5) return setError("You can attach up to 5 files to one message.");
    if (next.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) return setError("Attachments can total at most 20 MB per message.");
    setError("");
    setPendingFiles(next);
  }

  async function generate(activeId: string, userMessageId: string, chosen: string, guestTranscript?: Message[]) {
    setRunning(true);
    setError("");
    const generationIds = new Map<string, string>();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (signedIn && !session) throw new Error("Sign in again to continue");
      aborter.current = new AbortController();
      const requestSelection: GenerationSelection = chosen === "auto"
        ? { mode: "auto" }
        : chosen === "compare"
          ? { mode: "compare", modelKeys: models.map((model) => model.key) }
          : { mode: "model", modelKey: chosen };
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (signedIn && session) headers.authorization = `Bearer ${session.access_token}`;
      const body = signedIn
        ? { conversationId: activeId, userMessageId, selection: requestSelection }
        : { selection: requestSelection, messages: normalizeGuestTranscript(guestTranscript ?? messages, userMessageId), sessionId: getGuestSessionId() };
      const response = await fetch(`${process.env.NEXT_PUBLIC_WORKER_URL}/v1/generations`, { method: "POST", headers, body: JSON.stringify(body), signal: aborter.current.signal });
      await readOrbitStream(response, (event: OrbitStreamEvent) => {
        if (event.type === "start") {
          const tempId = `stream-${event.generationId}`;
          generationIds.set(event.generationId, tempId);
          setMessages((old) => [...old, { id: tempId, role: "assistant", content: "", provider: event.provider, model: event.model, comparison_group_id: event.comparisonGroupId, routingCategory: event.routing?.category }]);
        }
        if (event.type === "text_delta") setMessages((old) => old.map((message) => message.id === generationIds.get(event.generationId) ? { ...message, content: message.content + event.delta } : message));
        if (event.type === "metadata") setMessages((old) => old.map((message) => message.id === generationIds.get(event.generationId) ? { ...message, latency_ms: event.latencyMs } : message));
        if (event.type === "complete") setMessages((old) => old.map((message) => message.id === generationIds.get(event.generationId) ? { ...message, id: event.messageId, failed: false } : message));
        if (event.type === "error") {
          setError(event.error.message);
          if (event.generationId) setMessages((old) => old.map((message) => message.id === generationIds.get(event.generationId!) ? { ...message, content: `_${event.error.message}_`, failed: true } : message));
        }
      });
    } catch (cause) {
      const failure = cause as Error;
      if (failure.name === "AbortError") return;
      // fetch() reports network and CORS failures as a bare TypeError.
      setError(failure instanceof TypeError ? "Could not reach Orbit's server. Check your connection and retry." : failure.message);
    } finally {
      setRunning(false);
    }
  }

  async function send() {
    if ((!draft.trim() && !pendingFiles.length) || running) return;
    pinToBottom();
    let activeId = conversationId;
    const files = pendingFiles;
    const text = draft.trim() || "Please analyze the attached file(s).";
    setDraft("");
    setPendingFiles([]);

    if (!signedIn) {
      if (!activeId) {
        const conversation = { id: crypto.randomUUID(), title: text.slice(0, 72), updatedAt: Date.now(), messages: [] };
        activeId = conversation.id;
        setConversationId(activeId);
        setGuestConversations((old) => [conversation, ...old].slice(0, 20));
      }
      const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: text };
      const transcript = [...messages.filter((message) => !message.failed), userMessage];
      setMessages(transcript);
      setGuestConversations((old) => old.map((conversation) => conversation.id === activeId ? { ...conversation, title: conversation.title === "New conversation" ? text.slice(0, 72) : conversation.title, messages: transcript, updatedAt: Date.now() } : conversation));
      await generate(activeId, userMessage.id, selection, transcript);
      return;
    }

    if (!activeId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("conversations").insert({ user_id: user.id, title: text.slice(0, 72) }).select("id,title").single();
      if (!data) return;
      activeId = data.id;
      setConversationId(activeId);
      setConversations((old) => [data, ...old]);
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { data: userMessage, error: insertError } = await supabase.from("messages").insert({ conversation_id: activeId, role: "user", content: text }).select("id,role,content").single();
    if (insertError || !userMessage || !user) {
      setError(insertError?.message ?? "Could not save message");
      setPendingFiles(files);
      return;
    }

    const uploaded: string[] = [];
    const attachmentRows: Attachment[] = [];
    try {
      for (const file of files) {
        const mimeType = file.type || "text/plain";
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
        const path = `${user.id}/${userMessage.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("message-attachments").upload(path, file, { contentType: mimeType, upsert: false });
        if (uploadError) throw uploadError;
        uploaded.push(path);
        const { data: metadata, error: metadataError } = await supabase.from("message_attachments").insert({ message_id: userMessage.id, user_id: user.id, storage_path: path, file_name: file.name, mime_type: mimeType, size_bytes: file.size }).select("id,file_name,mime_type,size_bytes,storage_path").single();
        if (metadataError || !metadata) throw metadataError ?? new Error("Could not save attachment");
        attachmentRows.push({ ...metadata, previewUrl: mimeType.startsWith("image/") ? URL.createObjectURL(file) : undefined });
      }
    } catch (cause) {
      if (uploaded.length) await supabase.storage.from("message-attachments").remove(uploaded);
      await supabase.from("messages").delete().eq("id", userMessage.id);
      setPendingFiles(files);
      setError((cause as Error).message || "Could not upload attachment");
      return;
    }
    setMessages((old) => [...old, { ...userMessage, message_attachments: attachmentRows }]);
    await generate(activeId!, userMessage.id, selection);
  }

  async function secondPass(modelKey: string) {
    if (!conversationId || running) return;
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (lastUser) await generate(conversationId, lastUser.id, modelKey, messages.filter((message) => !message.failed));
  }

  async function retryLast() {
    if (!conversationId || running) return;
    const clean = messages.filter((message) => !message.failed);
    const lastUser = [...clean].reverse().find((message) => message.role === "user");
    if (!lastUser) return;
    setMessages(clean);
    await generate(conversationId, lastUser.id, selection, clean);
  }

  async function signOut() {
    await supabase.auth.signOut();
    location.href = "/";
  }

  function clearGuestHistory() {
    localStorage.removeItem(guestHistoryKey);
    setGuestConversations([]);
    setConversationId(undefined);
    setMessages([]);
  }

  const visibleConversations = signedIn ? conversations : guestConversations;
  const canSend = Boolean(draft.trim() || pendingFiles.length);

  return (
    <main className="shell">
      <div className={`drawer-backdrop ${sidebarOpen ? "show" : ""}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Conversations">
        <div className="sidebar-header">
          <div className="brand">
            <Image src="/orbit-logo.png" alt="" width={26} height={26} />
            <span>Orbit</span>
          </div>
          <button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setSidebarOpen(false)}><X {...icon} /></button>
        </div>

        <button className="new-chat" onClick={createConversation}><Plus {...icon} />New chat</button>

        <nav className="history" aria-label="Recent conversations">
          <div className="history-label">Recent</div>
          {visibleConversations.length === 0 && <p className="history-empty">Nothing yet. Start a chat and it will appear here.</p>}
          <ul className="conversation-list">
            {visibleConversations.map((conversation) => (
              <li className="conversation-row" key={conversation.id}>
                <button className="conversation" aria-current={conversation.id === conversationId ? "true" : undefined} onClick={() => openConversation(conversation.id)}>
                  {conversation.title}
                </button>
                <button className="delete-chat" aria-label={`Delete ${conversation.title}`} onClick={() => removeConversation(conversation.id)}><Trash2 size={14} strokeWidth={1.75} /></button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
          {signedIn ? (
            <div className="account">
              <span className="avatar" aria-hidden="true">{email?.[0]}</span>
              <span className="account-email" title={email}>{email}</span>
              <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut {...icon} /></button>
            </div>
          ) : (
            <div className="guest-cta">
              <p>Guest mode<small>History stays in this browser. Sign in to sync chats and attach files.</small></p>
              <Link className="button primary" href="/sign-in">Sign in</Link>
              <button className="link-button" onClick={clearGuestHistory}>Clear local history</button>
            </div>
          )}
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setSidebarOpen(true)}><Menu {...icon} /></button>
          <div className="model-tabs" role="group" aria-label="Model">
            {modes.map((mode) => (
              <button key={mode.key} className="model-tab" aria-pressed={selection === mode.key} onClick={() => setSelection(mode.key)}>
                <ModelMark modelKey={mode.key} />
                {shortName(mode.key)}
              </button>
            ))}
          </div>
          <span className="topbar-note">{modeNote(selection)}</span>
        </header>

        <div className="messages" ref={messagesPane} onScroll={trackScroll} tabIndex={0} role="region" aria-label="Conversation">
          {loadingConversation ? (
            <div className="skeleton" aria-label="Loading conversation"><span /><span /><span /><span /></div>
          ) : messages.length === 0 ? (
            <Welcome selection={selection} onSelect={setSelection} />
          ) : (
            renderMessages(messages, running, secondPass)
          )}
        </div>

        <footer className="composer-wrap">
          {messages.length > 0 && !atBottom && (
            <button className="jump-to-latest" onClick={scrollToLatest}><ArrowDown size={14} strokeWidth={2} />Latest</button>
          )}

          {pendingFiles.length > 0 && (
            <ul className="pending-files">
              {pendingFiles.map((file, index) => (
                <li className="pending-file" key={`${file.name}-${index}`}>
                  {file.type.startsWith("image/") ? <ImageIcon size={14} strokeWidth={1.75} /> : <FileText size={14} strokeWidth={1.75} />}
                  <span>{file.name}</span>
                  <small>{formatBytes(file.size)}</small>
                  <button aria-label={`Remove ${file.name}`} onClick={() => setPendingFiles((old) => old.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button>
                </li>
              ))}
            </ul>
          )}

          <div className="composer">
            <input ref={fileInput} className="file-input" type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,.txt" onChange={(event) => { chooseFiles(event.target.files); event.target.value = ""; }} />
            <textarea
              ref={composerInput}
              aria-label="Message"
              rows={1}
              placeholder={selection === "compare" ? "Ask all three models" : "Message Orbit"}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}
            />
            <div className="composer-actions">
              <button className="attach" aria-label={signedIn ? "Attach files" : "Sign in to attach files"} title={signedIn ? "Attach files" : "Sign in to attach files"} disabled={running || !signedIn} onClick={() => fileInput.current?.click()}><Paperclip {...icon} /></button>
              <span className="composer-hint">{signedIn ? "PNG, JPG, WebP, PDF, or TXT up to 10 MB each" : "Sign in to attach files"}</span>
              {running ? (
                <button className="send stop" aria-label="Stop generating" title="Stop" onClick={() => aborter.current?.abort()}><Square size={12} strokeWidth={2.5} fill="currentColor" /></button>
              ) : (
                <button className="send" aria-label="Send" title="Send" disabled={!canSend} onClick={() => void send()}><ArrowUp size={16} strokeWidth={2.25} /></button>
              )}
            </div>
          </div>

          <div className="composer-foot">
            <span>{composerNote(selection)}</span>
            <span><kbd>Enter</kbd> to send, <kbd>Shift + Enter</kbd> for a new line</span>
          </div>

          {error && (
            <div className="error" role="alert">
              <span>{error}</span>
              <div className="error-actions">
                <button onClick={() => void retryLast()}>Retry</button>
                <button onClick={() => setError("")}>Dismiss</button>
              </div>
            </div>
          )}
        </footer>
      </section>
    </main>
  );
}

function Welcome({ selection, onSelect }: { selection: string; onSelect: (key: string) => void }) {
  return (
    <div className="empty">
      <Image src="/orbit-logo.png" alt="" width={56} height={56} priority />
      <h1>One conversation. Any model.</h1>
      <p>Auto routes each prompt to the strongest model. Hold one model, or compare all three. Switch at any point and the whole thread follows.</p>
      <div className="mode-list" role="group" aria-label="Choose how Orbit answers">
        {modes.map((mode) => (
          <button key={mode.key} className="mode-option" aria-pressed={selection === mode.key} onClick={() => onSelect(mode.key)}>
            <ModelMark modelKey={mode.key} />
            <span><strong>{mode.label}</strong><small>{mode.description}</small></span>
            <span className="check" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

// Consecutive messages that share a comparison group render as one three-column block.
function renderMessages(messages: Message[], running: boolean, secondPass: (key: string) => void) {
  const seenGroups = new Set<string>();
  return messages.flatMap((message, index) => {
    if (!message.comparison_group_id) {
      return [<MessageCard key={message.id} message={message} latest={index === messages.length - 1} running={running} onSecondPass={secondPass} />];
    }
    if (seenGroups.has(message.comparison_group_id)) return [];
    seenGroups.add(message.comparison_group_id);
    const group = messages.filter((item) => item.comparison_group_id === message.comparison_group_id);
    return [
      <div className="comparison" key={message.comparison_group_id}>
        {group.map((item) => <CompareCard key={item.id} message={item} running={running} />)}
      </div>
    ];
  });
}

function MessageCard({ message, latest, running, onSecondPass }: { message: Message; latest: boolean; running: boolean; onSecondPass: (key: string) => void }) {
  const suggestion = suggestedModel(message.model);
  const streaming = running && message.id.startsWith("stream-") && Boolean(message.content);
  return (
    <div className={`turn ${message.role}`}>
      <article className={`message ${message.failed ? "failed" : ""} ${streaming ? "streaming" : ""}`} aria-busy={streaming || undefined}>
        <MessageFiles files={message.message_attachments} />
        <MessageBody message={message} />
        {message.role === "assistant" && (
          <footer className="message-meta">
            <span className="model-name"><ModelMark modelKey={message.model} />{modelName(message.model)}</span>
            {message.routingCategory && <span>Auto chose this for {message.routingCategory}</span>}
            {message.latency_ms ? <span className="latency">{(message.latency_ms / 1000).toFixed(1)}s</span> : null}
            {message.content && !streaming && <CopyButton text={message.content} />}
          </footer>
        )}
        {message.role === "assistant" && latest && message.content && !running && suggestion && (
          <aside className="second-pass">
            <ModelMark modelKey={suggestion.key} />
            <p><strong>{suggestion.label}</strong> approaches this differently. Ask it the same question for a second view.</p>
            <button className="button" disabled={running} onClick={() => onSecondPass(suggestion.key)}>Ask {suggestion.short}</button>
          </aside>
        )}
      </article>
    </div>
  );
}

function CompareCard({ message, running }: { message: Message; running: boolean }) {
  const streaming = running && message.id.startsWith("stream-") && Boolean(message.content);
  return (
    <article className={`compare-card message ${message.failed ? "failed" : ""} ${streaming ? "streaming" : ""}`} aria-busy={streaming || undefined}>
      <header className="compare-head">
        <ModelMark modelKey={message.model} />
        {modelName(message.model)}
        {message.latency_ms ? <span className="latency">{(message.latency_ms / 1000).toFixed(1)}s</span> : null}
      </header>
      <MessageBody message={message} />
    </article>
  );
}

function MessageBody({ message }: { message: Message }) {
  return (
    <div className="message-body markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{message.content}</ReactMarkdown>
      {!message.content && <div className="thinking" role="status" aria-label="Thinking"><span /><span /><span /></div>}
    </div>
  );
}

function MessageFiles({ files }: { files?: Attachment[] }) {
  if (!files?.length) return null;
  return (
    <div className="message-files">
      {files.map((file) => file.previewUrl ? (
        <a key={file.id} href={file.previewUrl} target="_blank" rel="noreferrer" className="message-image">
          <img src={file.previewUrl} alt={file.file_name} />
          <span>{file.file_name}</span>
        </a>
      ) : (
        <div className="message-file" key={file.id}>
          <FileText size={14} strokeWidth={1.75} />
          <span>{file.file_name}</span>
          <small>{formatBytes(file.size_bytes)}</small>
        </div>
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the button simply stays as "Copy".
    }
  }
  return <button className="copy" onClick={copy} aria-live="polite">{copied ? "Copied" : "Copy"}</button>;
}

// A model's identity mark: a colored ring, a periwinkle disc for Auto, or three dots for Compare.
function ModelMark({ modelKey }: { modelKey?: string }) {
  if (modelKey === "auto") return <span className="model-mark auto" aria-hidden="true" />;
  if (modelKey === "compare") return <span className="model-mark compare" aria-hidden="true" />;
  return <span className="model-mark" aria-hidden="true" style={{ "--mark": modelColor(modelKey) } as React.CSSProperties} />;
}

function findModel(id?: string) {
  return models.find((model) => model.key === id || model.key.endsWith(id ?? "__"));
}

function modelName(id?: string) {
  if (id === "auto") return "Auto";
  if (id === "compare") return "Compare";
  return findModel(id)?.label ?? id ?? "Orbit";
}

function shortName(id: string) {
  return findModel(id)?.short ?? modelName(id);
}

function modelColor(id?: string) {
  return findModel(id)?.color ?? "#9da7ff";
}

function composerNote(selection: string) {
  if (selection === "auto") return "Auto picks the model for each prompt. The full thread follows.";
  if (selection === "compare") return "All three models answer the same prompt. One message, three calls.";
  return `${modelName(selection)} will answer. Switch models anytime.`;
}

function modeNote(selection: string) {
  if (selection === "auto") return "Routes each prompt by task";
  if (selection === "compare") return "Three models, three calls";
  return "Full thread context follows";
}

function suggestedModel(current?: string) {
  if (!current) return undefined;
  return current.includes("claude") ? models[0] : models[1];
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
