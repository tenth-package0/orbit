export type Conversation = { id: string; title: string };

export type Attachment = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  previewUrl?: string;
};

export type Message = {
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

export type ModelOption = {
  key: string;
  label: string;
  short: string;
  description: string;
  color: string;
};
