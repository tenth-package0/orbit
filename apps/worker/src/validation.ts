import { z } from "zod";

const uuid = z.string().uuid();
const selection = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("auto") }),
  z.object({ mode: z.literal("model"), modelKey: z.string().min(1).max(80) }),
  z.object({ mode: z.literal("compare"), modelKeys: z.array(z.string().min(1).max(80)).min(2).max(3).refine((keys) => new Set(keys).size === keys.length) })
]);

export const authenticatedGenerationSchema = z.object({
  conversationId: uuid,
  userMessageId: uuid,
  selection
});

export const guestGenerationSchema = z.object({
  selection,
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(20_000)
  })).min(1).max(50).refine((messages) => messages.at(-1)?.role === "user").refine((messages) => messages.reduce((total, message) => total + message.content.length, 0) <= 100_000),
  sessionId: z.string().min(1).max(80).optional()
});
