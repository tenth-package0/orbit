"use client";

import { FileText } from "lucide-react";
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatBytes, modelColor, modelName, suggestedModel } from "./config";
import type { Attachment, Message } from "./types";

export function MessageList({ messages, running, onSecondPass }: { messages: Message[]; running: boolean; onSecondPass: (key: string) => void }) {
  const seenGroups = new Set<string>();
  return messages.flatMap((message, index) => {
    if (!message.comparison_group_id) {
      return [<MessageCard key={message.id} message={message} latest={index === messages.length - 1} running={running} onSecondPass={onSecondPass} />];
    }
    if (seenGroups.has(message.comparison_group_id)) return [];
    seenGroups.add(message.comparison_group_id);
    const group = messages.filter((item) => item.comparison_group_id === message.comparison_group_id);
    return [<div className="comparison" key={message.comparison_group_id}>{group.map((item) => <CompareCard key={item.id} message={item} running={running} />)}</div>];
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
      <header className="compare-head"><ModelMark modelKey={message.model} />{modelName(message.model)}{message.latency_ms ? <span className="latency">{(message.latency_ms / 1000).toFixed(1)}s</span> : null}</header>
      <MessageBody message={message} />
    </article>
  );
}

function MessageBody({ message }: { message: Message }) {
  return <div className="message-body markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{message.content}</ReactMarkdown>{!message.content && <div className="thinking" role="status" aria-label="Thinking"><span /><span /><span /></div>}</div>;
}

function MessageFiles({ files }: { files?: Attachment[] }) {
  if (!files?.length) return null;
  return <div className="message-files">{files.map((file) => file.previewUrl ? <a key={file.id} href={file.previewUrl} target="_blank" rel="noreferrer" className="message-image"><img src={file.previewUrl} alt={file.file_name} /><span>{file.file_name}</span></a> : <div className="message-file" key={file.id}><FileText size={14} strokeWidth={1.75} /><span>{file.file_name}</span><small>{formatBytes(file.size_bytes)}</small></div>)}</div>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permissions vary by browser; a denied copy leaves the label unchanged.
    }
  }
  return <button className="copy" onClick={copy} aria-live="polite">{copied ? "Copied" : "Copy"}</button>;
}

export function ModelMark({ modelKey }: { modelKey?: string }) {
  if (modelKey === "auto") return <span className="model-mark auto" aria-hidden="true" />;
  if (modelKey === "compare") return <span className="model-mark compare" aria-hidden="true" />;
  return <span className="model-mark" aria-hidden="true" style={{ "--mark": modelColor(modelKey) } as React.CSSProperties} />;
}
