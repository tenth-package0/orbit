create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 100000),
  provider text check (provider in ('openai', 'anthropic', 'google')),
  model text,
  latency_ms integer check (latency_ms >= 0),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  comparison_group_id uuid,
  created_at timestamptz not null default now(),
  check ((role = 'user' and provider is null and model is null) or (role = 'assistant' and provider is not null and model is not null))
);

create index conversations_user_updated_idx on public.conversations(user_id, updated_at desc);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on public.conversations from anon;
revoke all on public.messages from anon;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, delete on public.messages to authenticated;

create policy "users read own conversations" on public.conversations for select to authenticated using ((select auth.uid()) = user_id);
create policy "users create own conversations" on public.conversations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own conversations" on public.conversations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own conversations" on public.conversations for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users read messages in own conversations" on public.messages for select to authenticated using (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
);
create policy "users create messages in own conversations" on public.messages for insert to authenticated with check (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
);
create policy "users delete messages in own conversations" on public.messages for delete to authenticated using (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
);

