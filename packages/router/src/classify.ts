import type { TaskCategory } from "@orbit/contracts";

type Classification = { category: TaskCategory; signals: string[] };

const patterns = {
  math: [/\b(prove|theorem|equation|integral|derivative|probability|calculate|algebra|geometry|statistics)\b/i, /(?:\d|[a-z])\s*[=+*/^]\s*(?:\d|[a-z])/i],
  coding: [/```/, /\b(debug|refactor|function|typescript|javascript|python|rust|golang|sql|stack trace|exception|compile|repository|api endpoint)\b/i, /\b[\w.-]+\.(?:ts|tsx|js|jsx|py|rs|go|sql|java|cpp)\b/i],
  reasoning: [/\b(reason|logic|deduce|trade-?off|constraints?|step by step|plan|analy[sz]e|evaluate)\b/i]
};

export function classifyPrompt(prompt: string, estimatedTokens = Math.ceil(prompt.length / 4)): Classification {
  if (estimatedTokens > 32_000) return { category: "long-context", signals: ["input_over_32000_tokens"] };

  for (const category of ["math", "coding", "reasoning"] as const) {
    const matches = patterns[category].filter((pattern) => pattern.test(prompt));
    if (matches.length) return { category, signals: matches.map((_, index) => `${category}_signal_${index + 1}`) };
  }

  return { category: "general", signals: ["default"] };
}

