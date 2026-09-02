create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) between 1 and 500),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);

create index message_attachments_message_idx on public.message_attachments(message_id, created_at);

alter table public.message_attachments enable row level security;
revoke all on public.message_attachments from anon;
grant select, insert, delete on public.message_attachments to authenticated;

create policy "users read own attachments" on public.message_attachments for select to authenticated using (
  user_id = (select auth.uid()) and exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = message_id and c.user_id = (select auth.uid())
  )
);

create policy "users create own attachments" on public.message_attachments for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = message_id and m.role = 'user' and c.user_id = (select auth.uid())
  )
);

create policy "users delete own attachments" on public.message_attachments for delete to authenticated using (
  user_id = (select auth.uid())
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users upload own message files" on storage.objects for insert to authenticated with check (
  bucket_id = 'message-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users read own message files" on storage.objects for select to authenticated using (
  bucket_id = 'message-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users delete own message files" on storage.objects for delete to authenticated using (
  bucket_id = 'message-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
);
