-- ============================================================
-- Board Platform — Chat (Direct Messages)
-- Запускать ПОСЛЕ schema.sql в Supabase SQL Editor
-- ============================================================

-- Вспомогательные функции (CREATE OR REPLACE — безопасно перезапускать)
-- В вашей БД: profiles.id = auth.uid(), колонка organization_id (не org_id)
create or replace function public.get_my_org_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select organization_id from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.get_my_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select role::text from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.get_my_profile_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select id from public.profiles where id = auth.uid() limit 1;
$$;

-- ---------- messages ----------

create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid         not null references public.organizations(id),
  sender_id    uuid         not null references public.profiles(id),
  receiver_id  uuid         not null references public.profiles(id),
  content      text         not null check (char_length(content) > 0),
  is_read      boolean      not null default false,
  created_at   timestamptz  not null default now()
);

create index idx_messages_conversation
  on public.messages(org_id, least(sender_id, receiver_id), greatest(sender_id, receiver_id), created_at desc);

create index idx_messages_sender   on public.messages(sender_id, created_at desc);
create index idx_messages_receiver on public.messages(receiver_id, created_at desc);

alter table public.messages enable row level security;

-- SELECT: только участники переписки, та же организация
create policy "messages_select" on public.messages
  for select using (
    org_id = public.get_my_org_id()
    and (
      sender_id = public.get_my_profile_id()
      or receiver_id = public.get_my_profile_id()
    )
  );

-- INSERT: отправитель = текущий пользователь, нельзя писать самому себе
create policy "messages_insert" on public.messages
  for insert with check (
    org_id = public.get_my_org_id()
    and sender_id = public.get_my_profile_id()
    and sender_id <> receiver_id
  );

-- UPDATE: только получатель может пометить прочитанным
create policy "messages_update_read" on public.messages
  for update using (
    org_id = public.get_my_org_id()
    and receiver_id = public.get_my_profile_id()
  )
  with check (
    is_read = true
  );

-- DELETE: нет — корпоративный аудит, сообщения не удаляются

-- Включить Realtime для таблицы messages
alter publication supabase_realtime add table public.messages;
