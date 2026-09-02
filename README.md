<div align="center">
  <img src="apps/web/public/orbit-logo.png" alt="Orbit logo" width="88" />
  <h1>Orbit</h1>
  <p><strong>One conversation. Any model.</strong></p>
  <p>
    A production multi-model AI interface that routes prompts by capability,<br />
    preserves context across providers, and compares frontier models side by side.
  </p>
  <p>
    <a href="https://orbitmodels.dev"><strong>Try Orbit live</strong></a>
    ·
    <a href="#how-auto-routing-works">How routing works</a>
    ·
    <a href="#run-locally">Run locally</a>
  </p>
  <p>
    <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
    <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white" />
    <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Auth%20%2B%20Postgres-3FCF8E?logo=supabase&logoColor=white" />
  </p>
</div>

![Orbit model selection interface](docs/images/orbit-home.png)

## Why Orbit

Most multi-model interfaces make the user choose a provider before they know which model fits the task. Orbit treats model selection as a product and systems problem:

- **Auto** classifies each prompt as coding, math, reasoning, long-context, or general, then selects the strongest model from a versioned benchmark snapshot.
- **Manual mode** lets the user hold GPT, Claude, or Gemini for as long as they want.
- **Compare** streams all three answers side by side for deliberate evaluation.
- **Context follows the conversation** when the selected provider changes.
- **Second-view recommendations** suggest a complementary model without silently spending credits or replacing the original answer.

Guests can try the core experience immediately. Authentication adds synchronized conversations and private multimodal attachments.

## Auto routing in action

![Orbit showing a routed Claude response and GPT second-view recommendation](docs/images/orbit-auto-routing.png)

The routing decision is visible beside every Auto response. Orbit never hides a provider switch, silently retries a paid call, or uses an LLM to decide which LLM to call.

## How Auto routing works

```text
Prompt + conversation size
          │
          ▼
Deterministic task classifier
          │
          ├── coding
          ├── math
          ├── reasoning
          ├── long-context
          └── general
          │
          ▼
Versioned benchmark scorecard
          │
          ▼
Quality-first model selection
          │
          ▼
Allowlisted provider adapter → normalized SSE stream
```

Capability contributes **94%** of the routing score. Speed contributes 4% and cost 2%, so quality drives the choice and operational factors only resolve close results. Benchmark data is reviewed and versioned in the repository instead of scraped at runtime, making every routing decision reproducible and testable.

See [the benchmark methodology](docs/benchmarks.md) and the [versioned scorecard](packages/router/src/benchmarks/2026-09.json).

## Architecture

```mermaid
flowchart LR
  Browser[Next.js web app] -->|Auth, conversations, private uploads| Supabase[Supabase Auth + Postgres + Storage]
  Browser -->|JWT or guest session + prompt| Worker[Cloudflare Worker]
  Worker -->|Verify JWT / RLS writes| Supabase
  Worker --> Router[Deterministic router]
  Router --> OpenAI[OpenAI]
  Router --> Anthropic[Anthropic]
  Router --> Gemini[Google Gemini]
  OpenAI -->|Provider stream| Worker
  Anthropic -->|Provider stream| Worker
  Gemini -->|Provider stream| Worker
  Worker -->|Normalized SSE| Browser
```

The browser never receives provider credentials. The Worker validates requests, enforces rate limits, selects only server-allowlisted models, transforms attachments into provider-native formats, normalizes three different streaming protocols, and persists completed responses for authenticated users.

### Repository layout

```text
apps/
  web/          Next.js interface, auth, guest history, streaming UI
  worker/       Cloudflare API, security boundary, provider adapters
packages/
  contracts/    Shared request and response types
  router/       Classifier, benchmark snapshot, scoring logic
supabase/
  migrations/   Schema, RLS policies, attachment constraints
docs/           Architecture and benchmark decisions
```

## Supported models

| Provider | Production model | Role in Orbit |
| --- | --- | --- |
| OpenAI | `gpt-5.6-sol` | Coding and structured work |
| Anthropic | `claude-opus-5` | Deep reasoning and nuanced writing |
| Google | `gemini-3.6-flash` | Fast synthesis and long context |

Model IDs live in one server-side allowlist. The current IDs were verified against official provider documentation on September 1, 2026.

## Security and reliability

- Provider credentials are stored as Cloudflare secrets and never shipped to the client.
- Supabase JWTs are verified against project JWKS with issuer and audience checks.
- Authenticated database and storage access remains subject to Row Level Security.
- Attachments use private owner-prefixed paths and strict MIME, count, and size limits.
- Request bodies are schema-validated and capped at 256 KiB.
- CORS uses an exact production-origin allowlist.
- Raw HTML is disabled in rendered Markdown.
- Logs exclude prompts, responses, credentials, and authentication tokens.
- Public traffic is limited per user/guest and per IP; Compare is charged as three provider calls.
- Paid calls are never silently retried or failed over to another model.

## Run locally

### Requirements

- Node.js 24
- pnpm 11
- Supabase project
- Cloudflare account
- API keys for the providers you enable

```bash
pnpm install
cp .env.example apps/web/.env.local
```

Set the four public web values in `apps/web/.env.local`. Then configure Worker development secrets:

```bash
cd apps/worker
pnpm exec wrangler secret put SUPABASE_URL
pnpm exec wrangler secret put SUPABASE_PUBLISHABLE_KEY
pnpm exec wrangler secret put OPENAI_API_KEY
pnpm exec wrangler secret put ANTHROPIC_API_KEY
pnpm exec wrangler secret put GOOGLE_API_KEY
pnpm exec wrangler secret put ALLOWED_ORIGINS
```

Apply the schema and start the web app and Worker in separate terminals:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push

pnpm dev
pnpm dev:worker
```

Open `http://localhost:3000`.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
```

The test suite covers routing classification and scoring, guest and authenticated access boundaries, rate-limit accounting, Compare behavior, provider allowlists, request limits, history persistence, stream parsing, and core UI states. Provider tests use mocked streams and do not consume API credits.

## Deliberate v1 boundaries

Orbit intentionally avoids AI Gateway, Durable Objects, queues, RAG, vector databases, billing, runtime benchmark scraping, LLM-based routing, response caching, silent retries, microservices, and unnecessary repository/service layers. The goal is a system that is straightforward to reason about, test, and explain.

## Author

Built by [Kebron Tadesse](https://github.com/tenth-package0).
