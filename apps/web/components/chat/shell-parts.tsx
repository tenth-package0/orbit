"use client";

import { ArrowDown, ArrowUp, FileText, ImageIcon, LogOut, Menu, Paperclip, Plus, Square, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { composerNote, formatBytes, icon, modeNote, modes, shortName } from "./config";
import { ModelMark } from "./message-list";
import type { Conversation } from "./types";

export function Sidebar({ open, signedIn, email, conversations, activeId, onClose, onCreate, onOpen, onRemove, onSignOut, onClearGuestHistory }: {
  open: boolean;
  signedIn: boolean;
  email?: string;
  conversations: Conversation[];
  activeId?: string;
  onClose: () => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onSignOut: () => void;
  onClearGuestHistory: () => void;
}) {
  return <>
    <div className={`drawer-backdrop ${open ? "show" : ""}`} onClick={onClose} />
    <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Conversations">
      <div className="sidebar-header"><div className="brand"><Image src="/orbit-logo.png" alt="" width={26} height={26} /><span>Orbit</span></div><button className="icon-button sidebar-close" aria-label="Close menu" onClick={onClose}><X {...icon} /></button></div>
      <button className="new-chat" onClick={onCreate}><Plus {...icon} />New chat</button>
      <nav className="history" aria-label="Recent conversations">
        <div className="history-label">Recent</div>
        {conversations.length === 0 && <p className="history-empty">Nothing yet. Start a chat and it will appear here.</p>}
        <ul className="conversation-list">{conversations.map((conversation) => <li className="conversation-row" key={conversation.id}><button className="conversation" aria-current={conversation.id === activeId ? "true" : undefined} onClick={() => onOpen(conversation.id)}>{conversation.title}</button><button className="delete-chat" aria-label={`Delete ${conversation.title}`} onClick={() => onRemove(conversation.id)}><Trash2 size={14} strokeWidth={1.75} /></button></li>)}</ul>
      </nav>
      <div className="sidebar-footer">{signedIn ? <div className="account"><span className="avatar" aria-hidden="true">{email?.[0]}</span><span className="account-email" title={email}>{email}</span><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={onSignOut}><LogOut {...icon} /></button></div> : <div className="guest-cta"><p>Guest mode<small>History stays in this browser. Sign in to sync chats and attach files.</small></p><Link className="button primary" href="/sign-in">Sign in</Link><button className="link-button" onClick={onClearGuestHistory}>Clear local history</button></div>}</div>
    </aside>
  </>;
}

export function Topbar({ selection, onSelect, onOpenMenu }: { selection: string; onSelect: (key: string) => void; onOpenMenu: () => void }) {
  return <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open menu" onClick={onOpenMenu}><Menu {...icon} /></button><div className="model-tabs" role="group" aria-label="Model">{modes.map((mode) => <button key={mode.key} className="model-tab" aria-pressed={selection === mode.key} onClick={() => onSelect(mode.key)}><ModelMark modelKey={mode.key} />{shortName(mode.key)}</button>)}</div><span className="topbar-note">{modeNote(selection)}</span></header>;
}

export function Welcome({ selection, onSelect }: { selection: string; onSelect: (key: string) => void }) {
  return <div className="empty"><Image src="/orbit-logo.png" alt="" width={56} height={56} priority /><h1>One conversation. Any model.</h1><p>Auto routes each prompt to the strongest model. Hold one model, or compare all three. Switch at any point and the whole thread follows.</p><div className="mode-list" role="group" aria-label="Choose how Orbit answers">{modes.map((mode) => <button key={mode.key} className="mode-option" aria-pressed={selection === mode.key} onClick={() => onSelect(mode.key)}><ModelMark modelKey={mode.key} /><span><strong>{mode.label}</strong><small>{mode.description}</small></span><span className="check" aria-hidden="true" /></button>)}</div></div>;
}

export function Composer({ selection, signedIn, running, atBottom, hasMessages, pendingFiles, draft, error, textareaRef, fileInputRef, setPendingFiles, setDraft, onChooseFiles, onSend, onStop, onLatest, onRetry, onDismissError }: {
  selection: string;
  signedIn: boolean;
  running: boolean;
  atBottom: boolean;
  hasMessages: boolean;
  pendingFiles: File[];
  draft: string;
  error: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  setPendingFiles: Dispatch<SetStateAction<File[]>>;
  setDraft: Dispatch<SetStateAction<string>>;
  onChooseFiles: (files: FileList | null) => void;
  onSend: () => void;
  onStop: () => void;
  onLatest: () => void;
  onRetry: () => void;
  onDismissError: () => void;
}) {
  const canSend = Boolean(draft.trim() || pendingFiles.length);
  return <footer className="composer-wrap">
    {hasMessages && !atBottom && <button className="jump-to-latest" onClick={onLatest}><ArrowDown size={14} strokeWidth={2} />Latest</button>}
    {pendingFiles.length > 0 && <ul className="pending-files">{pendingFiles.map((file, index) => <li className="pending-file" key={`${file.name}-${index}`}>{file.type.startsWith("image/") ? <ImageIcon size={14} strokeWidth={1.75} /> : <FileText size={14} strokeWidth={1.75} />}<span>{file.name}</span><small>{formatBytes(file.size)}</small><button aria-label={`Remove ${file.name}`} onClick={() => setPendingFiles((old) => old.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button></li>)}</ul>}
    <div className="composer"><input ref={fileInputRef} className="file-input" type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,.txt" onChange={(event) => { onChooseFiles(event.target.files); event.target.value = ""; }} /><textarea ref={textareaRef} aria-label="Message" rows={1} placeholder={selection === "compare" ? "Ask all three models" : "Message Orbit"} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }} /><div className="composer-actions"><button className="attach" aria-label={signedIn ? "Attach files" : "Sign in to attach files"} title={signedIn ? "Attach files" : "Sign in to attach files"} disabled={running || !signedIn} onClick={() => fileInputRef.current?.click()}><Paperclip {...icon} /></button><span className="composer-hint">{signedIn ? "PNG, JPG, WebP, PDF, or TXT up to 10 MB each" : "Sign in to attach files"}</span>{running ? <button className="send stop" aria-label="Stop generating" title="Stop" onClick={onStop}><Square size={12} strokeWidth={2.5} fill="currentColor" /></button> : <button className="send" aria-label="Send" title="Send" disabled={!canSend} onClick={onSend}><ArrowUp size={16} strokeWidth={2.25} /></button>}</div></div>
    <div className="composer-foot"><span>{composerNote(selection)}</span><span><kbd>Enter</kbd> to send, <kbd>Shift + Enter</kbd> for a new line</span></div>
    {error && <div className="error" role="alert"><span>{error}</span><div className="error-actions"><button onClick={onRetry}>Retry</button><button onClick={onDismissError}>Dismiss</button></div></div>}
  </footer>;
}
