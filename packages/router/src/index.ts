import type { ModelDefinition, RoutingDecision, TaskCategory } from "@orbit/contracts";
import data from "./benchmarks/2026-09.json";
import { classifyPrompt } from "./classify";

export { classifyPrompt } from "./classify";

type BenchmarkModel = (typeof data.models)[keyof typeof data.models];

function score(model: BenchmarkModel, category: TaskCategory): number {
  // Capability remains dominant. Speed and cost only separate otherwise close models.
  return model.quality[category] * 0.94 + model.speed * 0.04 + model.cost * 0.02;
}

export function routePrompt(prompt: string, models: ModelDefinition[], estimatedTokens?: number): RoutingDecision {
  const classification = classifyPrompt(prompt, estimatedTokens);
  const eligible = models.filter((model) => model.enabled && model.contextWindow >= (estimatedTokens ?? Math.ceil(prompt.length / 4)));
  if (!eligible.length) throw new Error("No enabled model can accept this prompt");

  const ranked = eligible
    .map((model) => {
      const benchmark = data.models[model.key as keyof typeof data.models];
      if (!benchmark) throw new Error(`Missing benchmark data for ${model.key}`);
      return { model, score: score(benchmark, classification.category), cost: benchmark.cost };
    })
    .sort((a, b) => b.score - a.score || b.cost - a.cost || a.model.key.localeCompare(b.model.key));

  const selected = ranked[0]!;
  return {
    category: classification.category,
    modelKey: selected.model.key,
    score: Number(selected.score.toFixed(2)),
    benchmarkVersion: data.version,
    reason: `Selected for the strongest benchmark-weighted ${classification.category} capability among enabled models.`,
    signals: classification.signals
  };
}

