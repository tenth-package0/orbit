# Orbit architecture

Orbit is a Next.js interface backed by Supabase Auth/Postgres and a Cloudflare Worker. Browsers use Supabase directly for conversation data under Row Level Security. All model generation crosses the Worker, which verifies the caller, applies server-side limits, resolves an allowlisted model, normalizes streaming, and stores completed assistant messages.

Provider credentials exist only as Cloudflare Secrets. The Worker never accepts provider URLs, model IDs, or user IDs directly from a browser.

