"use client";

import type { GenerationSelection, OrbitStreamEvent } from "@orbit/contracts";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getGuestSessionId, guestHistoryKey, normalizeGuestTranscript, readGuestHistory, writeGuestHistory, type GuestConversation } from "@/lib/guest-history";
import { readOrbitStream } from "@/lib/stream";
import { composerHeight, isNearBottom, models } from "./chat/config";
import { MessageList } from "./chat/message-list";
import { Composer, Sidebar, Topbar, Welcome } from "./chat/shell-parts";
import type { Attachment, Conversation, Message } from "./chat/types";

const allowedAttachmentTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"]);


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
    textarea.style.height = `${composerHeight(textarea.scrollHeight)}px`;
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
    const near = isNearBottom(pane);
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
  return (
    <main className="shell">
      <Sidebar
        open={sidebarOpen}
        signedIn={signedIn}
        email={email}
        conversations={visibleConversations}
        activeId={conversationId}
        onClose={() => setSidebarOpen(false)}
        onCreate={() => void createConversation()}
        onOpen={(id) => void openConversation(id)}
        onRemove={(id) => void removeConversation(id)}
        onSignOut={() => void signOut()}
        onClearGuestHistory={clearGuestHistory}
      />

      <section className="main">
        <Topbar selection={selection} onSelect={setSelection} onOpenMenu={() => setSidebarOpen(true)} />

        <div className="messages" ref={messagesPane} onScroll={trackScroll} tabIndex={0} role="region" aria-label="Conversation">
          {loadingConversation ? (
            <div className="skeleton" aria-label="Loading conversation"><span /><span /><span /><span /></div>
          ) : messages.length === 0 ? (
            <Welcome selection={selection} onSelect={setSelection} />
          ) : (
            <MessageList messages={messages} running={running} onSecondPass={secondPass} />
          )}
        </div>

        <Composer
          selection={selection}
          signedIn={signedIn}
          running={running}
          atBottom={atBottom}
          hasMessages={messages.length > 0}
          pendingFiles={pendingFiles}
          draft={draft}
          error={error}
          textareaRef={composerInput}
          fileInputRef={fileInput}
          setPendingFiles={setPendingFiles}
          setDraft={setDraft}
          onChooseFiles={chooseFiles}
          onSend={() => void send()}
          onStop={() => aborter.current?.abort()}
          onLatest={scrollToLatest}
          onRetry={() => void retryLast()}
          onDismissError={() => setError("")}
        />
      </section>
    </main>
  );
}
