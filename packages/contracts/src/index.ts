export type Provider = "openai" | "anthropic" | "google";
export type TaskCategory = "coding" | "math" | "reasoning" | "long-context" | "general";
export type FinishReason = "stop" | "length" | "content_filter" | "cancelled" | "unknown";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModelDefinition = {
  key: string;
  id: string;
  provider: Provider;
  label: string;
  contextWindow: number;
  maxOutputTokens: number;
  enabled: boolean;
};

export type GenerationSelection =
  | { mode: "auto" }
  | { mode: "model"; modelKey: string }
  | { mode: "compare"; modelKeys: string[] };

export type GenerationRequest = {
  conversationId: string;
  userMessageId: string;
  selection: GenerationSelection;
};

export type RoutingDecision = {
  category: TaskCategory;
  modelKey: string;
  score: number;
  benchmarkVersion: string;
  reason: string;
  signals: string[];
};

export type OrbitErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "MODEL_NOT_ALLOWED"
  | "RATE_LIMITED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_BAD_RESPONSE"
  | "STREAM_INTERRUPTED"
  | "CANCELLED"
  | "INTERNAL_ERROR";

export type PublicError = {
  code: OrbitErrorCode;
  message: string;
  retryable: boolean;
  requestId: string;
  retryAfterSeconds?: number;
};

export type OrbitStreamEvent =
  | { type: "start"; requestId: string; generationId: string; provider: Provider; model: string; routing?: RoutingDecision }
  | { type: "text_delta"; generationId: string; delta: string }
  | { type: "metadata"; generationId: string; latencyMs?: number; inputTokens?: number; outputTokens?: number }
  | { type: "complete"; generationId: string; finishReason: FinishReason; messageId: string }
  | { type: "error"; generationId?: string; error: PublicError };

