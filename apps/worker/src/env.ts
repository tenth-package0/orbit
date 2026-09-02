export type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GOOGLE_API_KEY: string;
  ALLOWED_ORIGINS: string;
  USER_MINUTE: RateLimiter;
  USER_BURST: RateLimiter;
  IP_MINUTE: RateLimiter;
};
