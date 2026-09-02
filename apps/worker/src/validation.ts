import { z } from "zod";

const uuid = z.string().uuid();
export const generationSchema = z.object({
  conversationId: uuid,
  userMessageId: uuid,
  selection: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("auto") }),
    z.object({ mode: z.literal("model"), modelKey: z.string().min(1).max(80) }),
    z.object({ mode: z.literal("compare"), modelKeys: z.array(z.string().min(1).max(80)).min(2).max(3).refine((keys) => new Set(keys).size === keys.length) })
  ])
});

