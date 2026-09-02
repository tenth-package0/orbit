# Orbit benchmark snapshot

The `2026-09` snapshot is intentionally small and covers only Orbit's three enabled models. Scores are normalized to a 0–100 scale and are routing inputs, not claims of universal model quality.

Quality is 94% of the routing score. Speed contributes 4% and cost 2%, so they can distinguish close models without overcoming a meaningful capability difference.

Sources consulted on 2026-09-01:

- Artificial Analysis Intelligence Index and methodology for cross-provider reasoning, coding, latency, and price signals.
- LiveBench for independently scored coding, math, reasoning, language, instruction-following, and data-analysis tasks.
- SWE-bench for coding results using a common agent harness.
- Stanford HELM as a broad capabilities reasonableness check.
- Official provider documentation for model availability, stability, context windows, and pricing.

The checked-in values are a curated snapshot because leaderboards use different prompts, harnesses, reasoning settings, and graders. Update them in a reviewed pull request when a selected model changes or at least quarterly; Orbit never scrapes benchmark sites at request time.

