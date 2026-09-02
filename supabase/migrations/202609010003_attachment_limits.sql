create or replace function public.enforce_message_attachment_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  attachment_count integer;
  attachment_bytes bigint;
begin
  select count(*), coalesce(sum(size_bytes), 0)
  into attachment_count, attachment_bytes
  from public.message_attachments
  where message_id = new.message_id;

  if attachment_count >= 5 then
    raise exception 'A message can have at most 5 attachments';
  end if;
  if attachment_bytes + new.size_bytes > 20971520 then
    raise exception 'Attachments can total at most 20 MB per message';
  end if;
  return new;
end;
$$;

create trigger enforce_message_attachment_limits
before insert on public.message_attachments
for each row execute function public.enforce_message_attachment_limits();

drop policy "users create own attachments" on public.message_attachments;
create policy "users create own attachments" on public.message_attachments for insert to authenticated with check (
  user_id = (select auth.uid())
  and storage_path like user_id::text || '/' || message_id::text || '/%'
  and exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = message_id and m.role = 'user' and c.user_id = (select auth.uid())
  )
);
