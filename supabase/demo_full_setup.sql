-- ============================================================
-- DEMO FULL SETUP — все миграции объединены в одном файле
-- Запустить в Supabase SQL Editor demo-проекта
-- ============================================================

-- ============================================================
-- schema.sql
-- ============================================================
-- ============================================================
-- Board Platform — MVP Schema
-- Запускать в Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. ORGANIZATIONS
-- Сейчас одна запись. org_id на всех таблицах для будущего SaaS.
-- ============================================================

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(500) not null,
  created_at timestamptz  not null default now(),
  created_by uuid         references auth.users(id),
  is_active  boolean      not null default true
);

alter table public.organizations enable row level security;

-- Видишь только свою организацию (через profiles)
create policy "org_select" on public.organizations
  for select using (
    id in (select org_id from public.profiles where user_id = auth.uid())
  );

-- Обновлять может только admin своей организации
create policy "org_update" on public.organizations
  for update using (
    id in (
      select org_id from public.profiles
      where user_id = auth.uid() and role = 'admin'
    )
  );


-- 2. PROFILES
-- 1:1 с auth.users. Хранит роль, org_id, бизнес-данные.
-- ============================================================

create type public.app_role as enum (
  'chairman',
  'board_member',
  'executive',
  'admin',
  'auditor',
  'department_head'
);

create table public.profiles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid         not null unique references auth.users(id) on delete cascade,
  org_id     uuid         not null references public.organizations(id),
  role       app_role     not null default 'board_member',
  full_name  varchar(255) not null default '',
  position   varchar(255) default '',
  is_active  boolean      not null default true,
  created_at timestamptz  not null default now()
);

create index idx_profiles_org_id   on public.profiles(org_id);
create index idx_profiles_org_role on public.profiles(org_id, role);

alter table public.profiles enable row level security;

-- Все видят профили своей организации
create policy "profiles_select" on public.profiles
  for select using (
    org_id in (select org_id from public.profiles where user_id = auth.uid())
  );

-- Пользователь может редактировать свой профиль (имя, должность)
create policy "profiles_update_self" on public.profiles
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Admin может создавать профили в своей организации
create policy "profiles_insert_admin" on public.profiles
  for insert with check (
    org_id in (
      select org_id from public.profiles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Admin может обновлять любые профили в своей организации
create policy "profiles_update_admin" on public.profiles
  for update using (
    org_id in (
      select org_id from public.profiles
      where user_id = auth.uid() and role = 'admin'
    )
  );


-- 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
-- Используются в RLS-политиках и клиентском коде.
-- ============================================================

-- Получить org_id текущего пользователя
create or replace function public.get_my_org_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select org_id from public.profiles where user_id = auth.uid() limit 1;
$$;

-- Получить роль текущего пользователя
create or replace function public.get_my_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select role from public.profiles where user_id = auth.uid() limit 1;
$$;

-- Получить profile id текущего пользователя
create or replace function public.get_my_profile_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select id from public.profiles where user_id = auth.uid() limit 1;
$$;


-- 4. ТРИГГЕР: автосоздание профиля при регистрации
-- Берёт org_id из user_metadata (передаётся при signUp).
-- Если org_id не передан — берёт первую активную организацию (MVP: одна компания).
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  _org_id uuid;
  _full_name text;
  _role public.app_role;
begin
  -- org_id из metadata или первая активная организация
  _org_id := coalesce(
    (new.raw_user_meta_data ->> 'org_id')::uuid,
    (select id from public.organizations where is_active = true limit 1)
  );

  -- Если организации нет — не создаём профиль (пользователь увидит ошибку)
  if _org_id is null then
    return new;
  end if;

  _full_name := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  _role := coalesce(
    (new.raw_user_meta_data ->> 'role')::public.app_role,
    'board_member'
  );

  insert into public.profiles (user_id, org_id, full_name, role)
  values (new.id, _org_id, _full_name, _role);

  return new;
end;
$$;

-- Привязываем триггер к auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- 5. SEED: организация по умолчанию (MVP)
-- ============================================================

insert into public.organizations (name)
values ('Наблюдательный совет')
on conflict do nothing;


-- ============================================================
-- 002_meetings.sql
-- ============================================================
-- ============================================================
-- Board Platform — Meetings module
-- Запускать ПОСЛЕ schema.sql в Supabase SQL Editor
-- ============================================================

create table public.meetings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid         not null references public.organizations(id),
  title        text         not null,
  meeting_date timestamptz  not null,
  status       text         not null default 'draft'
                            check (status in ('draft', 'scheduled', 'completed')),
  created_by   uuid         not null references public.profiles(id),
  created_at   timestamptz  not null default now()
);

create index idx_meetings_org_date   on public.meetings(org_id, meeting_date desc);
create index idx_meetings_org_status on public.meetings(org_id, status);

alter table public.meetings enable row level security;

-- SELECT: все роли видят meetings своей организации
create policy "meetings_select" on public.meetings
  for select using (
    org_id = public.get_my_org_id()
  );

-- INSERT: admin и chairman
create policy "meetings_insert" on public.meetings
  for insert with check (
    org_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'chairman')
  );

-- UPDATE: admin и chairman
create policy "meetings_update" on public.meetings
  for update using (
    org_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'chairman')
  );

-- DELETE: только admin
create policy "meetings_delete" on public.meetings
  for delete using (
    org_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );


-- ============================================================
-- 003_agenda_decisions.sql
-- ============================================================
-- ============================================================
-- Board Platform — Agenda Items & Decisions
-- Запускать ПОСЛЕ 002_meetings.sql в Supabase SQL Editor
-- ============================================================

-- ---------- agenda_items ----------

create table public.agenda_items (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid    not null references public.meetings(id) on delete cascade,
  org_id       uuid    not null references public.organizations(id),
  title        text    not null,
  order_index  int     not null default 0,
  presenter    text
);

create index idx_agenda_items_meeting on public.agenda_items(meeting_id, order_index);

alter table public.agenda_items enable row level security;

create policy "agenda_items_select" on public.agenda_items
  for select using (org_id = public.get_my_org_id());

create policy "agenda_items_insert" on public.agenda_items
  for insert with check (
    org_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'chairman')
  );

create policy "agenda_items_update" on public.agenda_items
  for update using (
    org_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'chairman')
  );

create policy "agenda_items_delete" on public.agenda_items
  for delete using (
    org_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'chairman')
  );

-- ---------- decisions ----------

create table public.decisions (
  id              uuid primary key default gen_random_uuid(),
  agenda_item_id  uuid    not null references public.agenda_items(id) on delete cascade,
  org_id          uuid    not null references public.organizations(id),
  decision_text   text    not null,
  status          text    not null default 'proposed'
                          check (status in ('proposed', 'approved', 'rejected')),
  created_at      timestamptz not null default now()
);

create index idx_decisions_agenda_item on public.decisions(agenda_item_id);

alter table public.decisions enable row level security;

create policy "decisions_select" on public.decisions
  for select using (org_id = public.get_my_org_id());

create policy "decisions_insert" on public.decisions
  for insert with check (
    org_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'chairman')
  );

create policy "decisions_update" on public.decisions
  for update using (
    org_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'chairman')
  );

create policy "decisions_delete" on public.decisions
  for delete using (
    org_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );


-- ============================================================
-- 004_chat.sql
-- ============================================================
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


-- ============================================================
-- 005_voting.sql
-- ============================================================
-- ============================================================
-- Board Platform — Голосования
-- Запускать ПОСЛЕ 003_agenda_decisions.sql в Supabase SQL Editor
-- ============================================================

-- Голосование привязано к пункту повестки (agenda_item).
-- Каждый член совета голосует один раз: for / against / abstain.
-- admin/chairman открывают и закрывают голосование.

create table public.votings (
  id              uuid primary key default gen_random_uuid(),
  agenda_item_id  uuid         not null references public.agenda_items(id) on delete cascade,
  org_id          uuid         not null references public.organizations(id),
  title           text         not null,
  status          text         not null default 'open'
                               check (status in ('open', 'closed')),
  created_by      uuid         not null references public.profiles(id),
  created_at      timestamptz  not null default now()
);

create index idx_votings_agenda_item on public.votings(agenda_item_id);

alter table public.votings enable row level security;

create policy "votings_select" on public.votings
  for select using (org_id = public.get_my_org_id());

create policy "votings_insert" on public.votings
  for insert with check (
    org_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'chairman')
  );

create policy "votings_update" on public.votings
  for update using (
    org_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'chairman')
  );

-- ---------- votes (отдельные голоса) ----------

create table public.votes (
  id         uuid primary key default gen_random_uuid(),
  voting_id  uuid not null references public.votings(id) on delete cascade,
  org_id     uuid not null references public.organizations(id),
  voter_id   uuid not null references public.profiles(id),
  choice     text not null check (choice in ('for', 'against', 'abstain')),
  created_at timestamptz not null default now(),
  -- Один голос на человека на голосование
  unique(voting_id, voter_id)
);

create index idx_votes_voting on public.votes(voting_id);

alter table public.votes enable row level security;

-- Все в организации видят результаты
create policy "votes_select" on public.votes
  for select using (org_id = public.get_my_org_id());

-- Голосовать может любой участник организации (только за себя)
create policy "votes_insert" on public.votes
  for insert with check (
    org_id = public.get_my_org_id()
    and voter_id = public.get_my_profile_id()
  );

-- Перегосовать (обновить свой голос) можно пока голосование открыто
create policy "votes_update" on public.votes
  for update using (
    org_id = public.get_my_org_id()
    and voter_id = public.get_my_profile_id()
  );

-- Удалять голоса нельзя


-- ============================================================
-- 006_documents.sql
-- ============================================================
-- ============================================================
-- Board Platform — Документооборот
-- Запускать в Supabase SQL Editor
-- ============================================================

-- 1. Таблица метаданных документов
-- Файлы хранятся в Supabase Storage (bucket "documents"),
-- а здесь — метаданные + привязка к заседанию/пункту повестки.

create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid         not null references public.organizations(id),
  meeting_id      uuid         references public.meetings(id) on delete set null,
  agenda_item_id  uuid         references public.agenda_items(id) on delete set null,
  title           text         not null,
  file_name       text         not null,
  file_size       bigint       not null default 0,
  mime_type       text         not null default 'application/octet-stream',
  storage_path    text         not null,
  uploaded_by     uuid         not null references public.profiles(id),
  created_at      timestamptz  not null default now()
);

create index idx_documents_org      on public.documents(org_id);
create index idx_documents_meeting  on public.documents(meeting_id);

alter table public.documents enable row level security;

-- Все в организации видят документы
create policy "documents_select" on public.documents
  for select using (org_id = public.get_my_org_id());

-- Загружать могут admin и chairman
create policy "documents_insert" on public.documents
  for insert with check (
    org_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'chairman')
  );

-- Удалять может admin
create policy "documents_delete" on public.documents
  for delete using (
    org_id = public.get_my_org_id()
    and public.get_my_role() = 'admin'
  );

-- 2. Storage bucket
-- Создаём через SQL (если не существует)
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- 3. Storage RLS policies
-- Все аутентифицированные пользователи могут читать файлы из bucket
create policy "documents_storage_select"
  on storage.objects for select
  using (bucket_id = 'documents' and auth.role() = 'authenticated');

-- Загружать файлы могут аутентифицированные пользователи
create policy "documents_storage_insert"
  on storage.objects for insert
  with check (bucket_id = 'documents' and auth.role() = 'authenticated');

-- Удалять файлы могут аутентифицированные пользователи
create policy "documents_storage_delete"
  on storage.objects for delete
  using (bucket_id = 'documents' and auth.role() = 'authenticated');


-- ============================================================
-- 007_meet_url.sql
-- ============================================================
-- 007: Добавить колонку meet_url для ссылки на видеоконференцию (Google Meet)
alter table public.meetings
  add column if not exists meet_url text;


-- ============================================================
-- 008_shareholder_meetings.sql
-- ============================================================
-- 008: Общее собрание акционеров
-- Таблицы: shareholder_meetings, shareholder_agenda_items, shareholder_materials

-- 1. Собрания акционеров
create table if not exists public.shareholder_meetings (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title         text not null,
  meeting_type  text not null default 'annual' check (meeting_type in ('annual', 'extraordinary')),
  meeting_date  timestamptz not null,
  status        text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  total_shares  int not null default 1000000,
  voted_shares  int not null default 0,
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);

create index if not exists idx_shareholder_meetings_org
  on public.shareholder_meetings(organization_id);

alter table public.shareholder_meetings enable row level security;

-- Все в организации видят
create policy "shareholder_meetings_select"
  on public.shareholder_meetings for select
  using (organization_id = get_my_org_id());

-- admin / chairman создают
create policy "shareholder_meetings_insert"
  on public.shareholder_meetings for insert
  with check (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'chairman')
  );

-- admin / chairman обновляют
create policy "shareholder_meetings_update"
  on public.shareholder_meetings for update
  using (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'chairman')
  );

-- admin / chairman удаляют
create policy "shareholder_meetings_delete"
  on public.shareholder_meetings for delete
  using (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'chairman')
  );

-- 2. Повестка дня
create table if not exists public.shareholder_agenda_items (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.shareholder_meetings(id) on delete cascade,
  order_index int not null default 0,
  title       text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_shareholder_agenda_meeting
  on public.shareholder_agenda_items(meeting_id);

alter table public.shareholder_agenda_items enable row level security;

create policy "shareholder_agenda_select"
  on public.shareholder_agenda_items for select
  using (
    exists (
      select 1 from public.shareholder_meetings sm
      where sm.id = meeting_id and sm.organization_id = get_my_org_id()
    )
  );

create policy "shareholder_agenda_insert"
  on public.shareholder_agenda_items for insert
  with check (
    exists (
      select 1 from public.shareholder_meetings sm
      where sm.id = meeting_id and sm.organization_id = get_my_org_id()
    )
    and get_my_role() in ('admin', 'chairman')
  );

create policy "shareholder_agenda_update"
  on public.shareholder_agenda_items for update
  using (
    exists (
      select 1 from public.shareholder_meetings sm
      where sm.id = meeting_id and sm.organization_id = get_my_org_id()
    )
    and get_my_role() in ('admin', 'chairman')
  );

create policy "shareholder_agenda_delete"
  on public.shareholder_agenda_items for delete
  using (
    exists (
      select 1 from public.shareholder_meetings sm
      where sm.id = meeting_id and sm.organization_id = get_my_org_id()
    )
    and get_my_role() in ('admin', 'chairman')
  );

-- 3. Материалы
create table if not exists public.shareholder_materials (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.shareholder_meetings(id) on delete cascade,
  title       text not null,
  status      text not null default 'available' check (status in ('available', 'pending')),
  file_url    text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_shareholder_materials_meeting
  on public.shareholder_materials(meeting_id);

alter table public.shareholder_materials enable row level security;

create policy "shareholder_materials_select"
  on public.shareholder_materials for select
  using (
    exists (
      select 1 from public.shareholder_meetings sm
      where sm.id = meeting_id and sm.organization_id = get_my_org_id()
    )
  );

create policy "shareholder_materials_insert"
  on public.shareholder_materials for insert
  with check (
    exists (
      select 1 from public.shareholder_meetings sm
      where sm.id = meeting_id and sm.organization_id = get_my_org_id()
    )
    and get_my_role() in ('admin', 'chairman')
  );

create policy "shareholder_materials_update"
  on public.shareholder_materials for update
  using (
    exists (
      select 1 from public.shareholder_meetings sm
      where sm.id = meeting_id and sm.organization_id = get_my_org_id()
    )
    and get_my_role() in ('admin', 'chairman')
  );

create policy "shareholder_materials_delete"
  on public.shareholder_materials for delete
  using (
    exists (
      select 1 from public.shareholder_meetings sm
      where sm.id = meeting_id and sm.organization_id = get_my_org_id()
    )
    and get_my_role() in ('admin', 'chairman')
  );


-- ============================================================
-- 009_shareholder_voting.sql
-- ============================================================
-- 009: Голосование на общем собрании акционеров
-- Каждый акционер голосует по каждому пункту повестки дня: за / против / воздержался

create table if not exists public.shareholder_votes (
  id              uuid primary key default gen_random_uuid(),
  agenda_item_id  uuid not null references public.shareholder_agenda_items(id) on delete cascade,
  voter_id        uuid not null references public.profiles(id),
  choice          text not null check (choice in ('for', 'against', 'abstain')),
  shares_count    int not null default 0,
  created_at      timestamptz not null default now(),
  -- Один голос на пункт повестки от одного акционера
  unique(agenda_item_id, voter_id)
);

create index if not exists idx_shareholder_votes_agenda
  on public.shareholder_votes(agenda_item_id);

create index if not exists idx_shareholder_votes_voter
  on public.shareholder_votes(voter_id);

alter table public.shareholder_votes enable row level security;

-- Все в организации видят голоса
create policy "shareholder_votes_select"
  on public.shareholder_votes for select
  using (
    exists (
      select 1
      from public.shareholder_agenda_items sai
      join public.shareholder_meetings sm on sm.id = sai.meeting_id
      where sai.id = agenda_item_id
        and sm.organization_id = get_my_org_id()
    )
  );

-- Любой участник организации может голосовать (upsert)
create policy "shareholder_votes_insert"
  on public.shareholder_votes for insert
  with check (
    voter_id = get_my_profile_id()
    and exists (
      select 1
      from public.shareholder_agenda_items sai
      join public.shareholder_meetings sm on sm.id = sai.meeting_id
      where sai.id = agenda_item_id
        and sm.organization_id = get_my_org_id()
        and sm.status = 'scheduled'
    )
  );

-- Можно изменить свой голос пока собрание scheduled
create policy "shareholder_votes_update"
  on public.shareholder_votes for update
  using (
    voter_id = get_my_profile_id()
    and exists (
      select 1
      from public.shareholder_agenda_items sai
      join public.shareholder_meetings sm on sm.id = sai.meeting_id
      where sai.id = agenda_item_id
        and sm.organization_id = get_my_org_id()
        and sm.status = 'scheduled'
    )
  );


-- ============================================================
-- 010_profile_shares.sql
-- ============================================================
-- 010: Добавляем количество акций в профиль пользователя
-- Каждый акционер владеет определённым количеством акций,
-- которое учитывается при голосовании (1 голос = кол-во акций)

alter table public.profiles
  add column if not exists shares_count int not null default 0;

-- Для тестирования: обновите shares_count для ваших пользователей, например:
-- update public.profiles set shares_count = 100000 where full_name = 'Dilshod Isakov';


-- ============================================================
-- 011_voting_extra_fields.sql
-- ============================================================
-- 011: Дополнительные поля для голосований
-- Описание, крайний срок, общее количество голосующих

alter table public.votings
  add column if not exists description text not null default '',
  add column if not exists deadline date,
  add column if not exists total_members int not null default 8;


-- ============================================================
-- 014_board_tasks.sql
-- ============================================================
-- Board Platform — Поручения Наблюдательного совета
-- Запускать ПОСЛЕ schema.sql, 002_meetings.sql, 003_agenda_decisions.sql в Supabase SQL Editor

-- ============================================================
-- 1. ТАБЛИЦЫ
-- ============================================================

-- Поручения
CREATE TABLE IF NOT EXISTS public.board_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  title         text NOT NULL,
  description   text,
  priority      text NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low','medium','high')),
  status        text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','done','canceled','overdue')),
  due_date      date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  related_meeting_id     uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  related_agenda_item_id uuid REFERENCES public.agenda_items(id) ON DELETE SET NULL
);

-- Назначения (многие-ко-многим)
CREATE TABLE IF NOT EXISTS public.board_task_assignees (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id             uuid NOT NULL REFERENCES public.board_tasks(id) ON DELETE CASCADE,
  assignee_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_in_task        text NOT NULL DEFAULT 'executor'
                        CHECK (role_in_task IN ('executor','co_executor','controller')),
  UNIQUE(task_id, assignee_profile_id)
);

-- Комментарии
CREATE TABLE IF NOT EXISTS public.board_task_comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid NOT NULL REFERENCES public.board_tasks(id) ON DELETE CASCADE,
  author_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body              text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Вложения
CREATE TABLE IF NOT EXISTS public.board_task_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES public.board_tasks(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  file_name   text NOT NULL,
  file_path   text NOT NULL,
  mime_type   text,
  file_size   bigint,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. ТРИГГЕР updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_board_tasks_updated_at ON public.board_tasks;
CREATE TRIGGER trg_board_tasks_updated_at
  BEFORE UPDATE ON public.board_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. ИНДЕКСЫ
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_board_tasks_org       ON public.board_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_board_tasks_status    ON public.board_tasks(status);
CREATE INDEX IF NOT EXISTS idx_board_tasks_due_date  ON public.board_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_board_tasks_created_by ON public.board_tasks(created_by);

CREATE INDEX IF NOT EXISTS idx_bta_task_id           ON public.board_task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_bta_assignee          ON public.board_task_assignees(assignee_profile_id);

CREATE INDEX IF NOT EXISTS idx_btc_task_id           ON public.board_task_comments(task_id);

CREATE INDEX IF NOT EXISTS idx_btatt_task_id         ON public.board_task_attachments(task_id);

-- ============================================================
-- 4. RLS
-- ============================================================

ALTER TABLE public.board_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_task_attachments ENABLE ROW LEVEL SECURITY;

-- ---- board_tasks ----

CREATE POLICY "board_tasks_select" ON public.board_tasks
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id());

CREATE POLICY "board_tasks_insert" ON public.board_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin','chairman','board_member')
  );

CREATE POLICY "board_tasks_update" ON public.board_tasks
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    AND (
      created_by = auth.uid()
      OR public.get_my_role() IN ('admin','chairman')
    )
  )
  WITH CHECK (
    organization_id = public.get_my_org_id()
  );

CREATE POLICY "board_tasks_delete" ON public.board_tasks
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin','chairman')
  );

-- ---- board_task_assignees ----

CREATE POLICY "bta_select" ON public.board_task_assignees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "bta_insert" ON public.board_task_assignees
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_my_role() IN ('admin','chairman')
    AND EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "bta_delete" ON public.board_task_assignees
  FOR DELETE TO authenticated
  USING (
    public.get_my_role() IN ('admin','chairman')
    AND EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

-- ---- board_task_comments ----

CREATE POLICY "btc_select" ON public.board_task_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "btc_insert" ON public.board_task_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "btc_delete" ON public.board_task_comments
  FOR DELETE TO authenticated
  USING (
    author_profile_id = auth.uid()
    OR public.get_my_role() IN ('admin','chairman')
  );

-- ---- board_task_attachments ----

CREATE POLICY "btatt_select" ON public.board_task_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "btatt_insert" ON public.board_task_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "btatt_delete" ON public.board_task_attachments
  FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.get_my_role() IN ('admin','chairman')
  );

-- ============================================================
-- 5. RPC: set_task_status (для исполнителей)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_task_status(p_task_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Проверка валидности статуса
  IF p_status NOT IN ('open','in_progress','done','canceled','overdue') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  -- Проверка что пользователь — assignee или создатель или admin/chairman
  IF NOT EXISTS (
    SELECT 1 FROM public.board_task_assignees
    WHERE task_id = p_task_id AND assignee_profile_id = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.board_tasks
    WHERE id = p_task_id AND created_by = auth.uid()
  )
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) NOT IN ('admin','chairman')
  THEN
    RAISE EXCEPTION 'Access denied: you are not an assignee, creator, or admin';
  END IF;

  -- Проверка что задача принадлежит организации пользователя
  IF NOT EXISTS (
    SELECT 1 FROM public.board_tasks t
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE t.id = p_task_id AND t.organization_id = p.organization_id
  ) THEN
    RAISE EXCEPTION 'Task not found in your organization';
  END IF;

  UPDATE public.board_tasks
  SET status = p_status, updated_at = now()
  WHERE id = p_task_id;
END;
$$;

-- ============================================================
-- 6. STORAGE BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('board-task-files', 'board-task-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "btf_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'board-task-files');

CREATE POLICY "btf_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'board-task-files');

CREATE POLICY "btf_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'board-task-files');

-- ============================================================
-- 7. SEED: тестовые поручения
-- ============================================================

DO $$
DECLARE
  v_org_id uuid;
  v_chairman uuid;
  v_admin uuid;
  v_exec1 uuid;
  v_exec2 uuid;
  v_bm1 uuid;
  v_bm2 uuid;
  v_task1 uuid;
  v_task2 uuid;
  v_task3 uuid;
  v_task4 uuid;
  v_task5 uuid;
BEGIN
  -- Получить org (первая организация)
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'No active organization'; END IF;

  -- Получить профили
  SELECT id INTO v_chairman FROM public.profiles WHERE organization_id = v_org_id AND role = 'chairman' LIMIT 1;
  SELECT id INTO v_admin    FROM public.profiles WHERE organization_id = v_org_id AND role = 'admin' LIMIT 1;
  SELECT id INTO v_exec1    FROM public.profiles WHERE organization_id = v_org_id AND role = 'executive' LIMIT 1;
  SELECT id INTO v_exec2    FROM public.profiles WHERE organization_id = v_org_id AND role = 'executive' OFFSET 1 LIMIT 1;
  SELECT id INTO v_bm1      FROM public.profiles WHERE organization_id = v_org_id AND role = 'board_member' LIMIT 1;
  SELECT id INTO v_bm2      FROM public.profiles WHERE organization_id = v_org_id AND role = 'board_member' OFFSET 1 LIMIT 1;

  -- Поручение 1: просроченное
  INSERT INTO public.board_tasks (id, organization_id, created_by, title, description, priority, status, due_date)
  VALUES (gen_random_uuid(), v_org_id, v_chairman,
    'Подготовить отчёт о финансовых результатах за Q4',
    'Необходимо подготовить сводный отчёт по финансовым результатам за 4-й квартал для рассмотрения на заседании НС.',
    'high', 'overdue', CURRENT_DATE - INTERVAL '10 days')
  RETURNING id INTO v_task1;

  -- Поручение 2: в работе
  INSERT INTO public.board_tasks (id, organization_id, created_by, title, description, priority, status, due_date)
  VALUES (gen_random_uuid(), v_org_id, v_chairman,
    'Разработать стратегию цифровой трансформации',
    'Подготовить дорожную карту цифровой трансформации на 2026-2028 гг. с учётом текущей ИТ-инфраструктуры.',
    'high', 'in_progress', CURRENT_DATE + INTERVAL '14 days')
  RETURNING id INTO v_task2;

  -- Поручение 3: открытое, средний приоритет
  INSERT INTO public.board_tasks (id, organization_id, created_by, title, description, priority, status, due_date)
  VALUES (gen_random_uuid(), v_org_id, v_admin,
    'Провести аудит договоров с контрагентами',
    'Проверить все действующие договоры с основными контрагентами на предмет соответствия новым требованиям.',
    'medium', 'open', CURRENT_DATE + INTERVAL '30 days')
  RETURNING id INTO v_task3;

  -- Поручение 4: выполнено
  INSERT INTO public.board_tasks (id, organization_id, created_by, title, description, priority, status, due_date)
  VALUES (gen_random_uuid(), v_org_id, v_chairman,
    'Утвердить положение о комитете по аудиту',
    'Доработать и утвердить положение о комитете по аудиту при Наблюдательном совете.',
    'low', 'done', CURRENT_DATE - INTERVAL '5 days')
  RETURNING id INTO v_task4;

  -- Поручение 5: открытое, на этой неделе
  INSERT INTO public.board_tasks (id, organization_id, created_by, title, description, priority, status, due_date)
  VALUES (gen_random_uuid(), v_org_id, v_admin,
    'Подготовить материалы к заседанию НС',
    'Собрать и систематизировать материалы повестки дня для предстоящего заседания Наблюдательного совета.',
    'medium', 'open', CURRENT_DATE + INTERVAL '5 days')
  RETURNING id INTO v_task5;

  -- Назначения
  IF v_exec1 IS NOT NULL THEN
    INSERT INTO public.board_task_assignees (task_id, assignee_profile_id, role_in_task) VALUES
      (v_task1, v_exec1, 'executor'),
      (v_task2, v_exec1, 'executor'),
      (v_task3, v_exec1, 'co_executor');
  END IF;

  IF v_exec2 IS NOT NULL THEN
    INSERT INTO public.board_task_assignees (task_id, assignee_profile_id, role_in_task) VALUES
      (v_task2, v_exec2, 'co_executor');
  END IF;

  IF v_bm1 IS NOT NULL THEN
    INSERT INTO public.board_task_assignees (task_id, assignee_profile_id, role_in_task) VALUES
      (v_task3, v_bm1, 'executor'),
      (v_task4, v_bm1, 'executor');
  END IF;

  IF v_bm2 IS NOT NULL THEN
    INSERT INTO public.board_task_assignees (task_id, assignee_profile_id, role_in_task) VALUES
      (v_task5, v_bm2, 'executor');
  END IF;

  IF v_admin IS NOT NULL THEN
    INSERT INTO public.board_task_assignees (task_id, assignee_profile_id, role_in_task) VALUES
      (v_task1, v_admin, 'controller'),
      (v_task5, v_admin, 'executor');
  END IF;

  -- Тестовые комментарии
  IF v_exec1 IS NOT NULL THEN
    INSERT INTO public.board_task_comments (task_id, author_profile_id, body) VALUES
      (v_task1, v_exec1, 'Начал сбор данных по финансовым результатам. Ожидаю данные от бухгалтерии.'),
      (v_task2, v_exec1, 'Провёл анализ текущей ИТ-инфраструктуры. Подготовил предварительный план.');
  END IF;

  IF v_chairman IS NOT NULL THEN
    INSERT INTO public.board_task_comments (task_id, author_profile_id, body) VALUES
      (v_task1, v_chairman, 'Прошу ускорить подготовку отчёта. Срок уже прошёл.');
  END IF;

  RAISE NOTICE 'Seed: created 5 board tasks with assignees and comments';
END;
$$;


-- ============================================================
-- 015_chat_groups.sql
-- ============================================================
-- Board Platform — Групповые чаты
-- Запускать ПОСЛЕ schema.sql, 004_chat.sql в Supabase SQL Editor

-- ============================================================
-- 1. ТАБЛИЦЫ
-- ============================================================

-- Группы
CREATE TABLE IF NOT EXISTS public.chat_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Участники группы
CREATE TABLE IF NOT EXISTS public.chat_group_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, profile_id)
);

-- Сообщения группы
CREATE TABLE IF NOT EXISTS public.chat_group_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. ИНДЕКСЫ
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_chat_groups_org        ON public.chat_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_cgm_group_id           ON public.chat_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_cgm_profile_id         ON public.chat_group_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_cgmsg_group_id         ON public.chat_group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_cgmsg_created_at       ON public.chat_group_messages(created_at);

-- ============================================================
-- 3. RLS
-- ============================================================

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_messages ENABLE ROW LEVEL SECURITY;

-- chat_groups: видят участники своей организации
CREATE POLICY "cg_select" ON public.chat_groups
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id());

CREATE POLICY "cg_insert" ON public.chat_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_org_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "cg_update" ON public.chat_groups
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.get_my_role() IN ('admin','chairman'));

CREATE POLICY "cg_delete" ON public.chat_groups
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.get_my_role() IN ('admin','chairman'));

-- chat_group_members: видят если состоят в группе своей организации
CREATE POLICY "cgm_select" ON public.chat_group_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_groups g
      WHERE g.id = group_id AND g.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "cgm_insert" ON public.chat_group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_groups g
      WHERE g.id = group_id AND g.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "cgm_delete" ON public.chat_group_members
  FOR DELETE TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_groups g
      WHERE g.id = group_id AND g.created_by = auth.uid()
    )
    OR public.get_my_role() IN ('admin','chairman')
  );

-- chat_group_messages: видят участники группы
CREATE POLICY "cgmsg_select" ON public.chat_group_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_group_members m
      WHERE m.group_id = chat_group_messages.group_id AND m.profile_id = auth.uid()
    )
  );

CREATE POLICY "cgmsg_insert" ON public.chat_group_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_group_members m
      WHERE m.group_id = chat_group_messages.group_id AND m.profile_id = auth.uid()
    )
  );


-- ============================================================
-- 016_fix_bta_insert_policy.sql
-- ============================================================
-- Исправление RLS: разрешить создателю задачи добавлять исполнителей
-- Запускать в Supabase SQL Editor

-- Удалить старую политику
DROP POLICY IF EXISTS "bta_insert" ON public.board_task_assignees;

-- Новая политика: admin/chairman ИЛИ создатель задачи могут добавлять исполнителей
CREATE POLICY "bta_insert" ON public.board_task_assignees
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
    AND (
      public.get_my_role() IN ('admin','chairman')
      OR EXISTS (
        SELECT 1 FROM public.board_tasks t
        WHERE t.id = task_id AND t.created_by = auth.uid()
      )
    )
  );

-- Аналогично для удаления: создатель задачи тоже может удалять исполнителей
DROP POLICY IF EXISTS "bta_delete" ON public.board_task_assignees;

CREATE POLICY "bta_delete" ON public.board_task_assignees
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
    AND (
      public.get_my_role() IN ('admin','chairman')
      OR EXISTS (
        SELECT 1 FROM public.board_tasks t
        WHERE t.id = task_id AND t.created_by = auth.uid()
      )
    )
  );


-- ============================================================
-- 017_notifications.sql
-- ============================================================
-- ============================================================
-- Board Platform — Notifications
-- Запускать ПОСЛЕ schema.sql, 004_chat.sql, 014_board_tasks.sql, 015_chat_groups.sql
-- ============================================================

-- 1. ТАБЛИЦА notifications
-- ============================================================

CREATE TYPE public.notification_type AS ENUM (
  'task_assigned',
  'task_status_changed',
  'task_comment',
  'personal_message',
  'group_message',
  'meeting_invitation'
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id        uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                notification_type NOT NULL,
  title               text         NOT NULL,
  body                text         NOT NULL DEFAULT '',
  is_read             boolean      NOT NULL DEFAULT false,
  related_entity_type text,        -- 'task', 'message', 'group_message', 'meeting'
  related_entity_id   text,        -- uuid или bigint в виде текста
  created_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: только свои уведомления
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

-- UPDATE: только свои (пометить прочитанным)
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (is_read = true);

-- INSERT: запрещён клиенту — только триггеры (SECURITY DEFINER)
-- Нет policy для INSERT = клиент не может вставлять напрямую

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;


-- 2. ТРИГГЕРЫ (все SECURITY DEFINER — обходят RLS)
-- ============================================================

-- 2.1 task_assigned: при добавлении исполнителя в поручение
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _task_title text;
  _assignee_user_id uuid;
BEGIN
  SELECT title INTO _task_title FROM public.board_tasks WHERE id = NEW.task_id;
  SELECT user_id INTO _assignee_user_id FROM public.profiles WHERE id = NEW.assignee_profile_id;

  IF _assignee_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
    VALUES (
      _assignee_user_id,
      'task_assigned',
      'Новое поручение',
      coalesce(_task_title, 'Поручение'),
      'task',
      NEW.task_id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_assigned
  AFTER INSERT ON public.board_task_assignees
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_assigned();


-- 2.2 task_status_changed: при смене статуса поручения
CREATE OR REPLACE FUNCTION public.notify_task_status_changed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
  _status_label text;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  _status_label := CASE NEW.status
    WHEN 'open' THEN 'Открыто'
    WHEN 'in_progress' THEN 'В работе'
    WHEN 'done' THEN 'Выполнено'
    WHEN 'canceled' THEN 'Отменено'
    WHEN 'overdue' THEN 'Просрочено'
    ELSE NEW.status
  END;

  FOR _rec IN
    SELECT p.user_id
    FROM public.board_task_assignees bta
    JOIN public.profiles p ON p.id = bta.assignee_profile_id
    WHERE bta.task_id = NEW.id
  LOOP
    -- Не уведомлять инициатора изменения
    IF _rec.user_id <> auth.uid() THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.user_id,
        'task_status_changed',
        'Статус поручения изменён',
        coalesce(NEW.title, '') || ' → ' || _status_label,
        'task',
        NEW.id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_status_changed
  AFTER UPDATE ON public.board_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_status_changed();


-- 2.3 task_comment: при добавлении комментария к поручению
CREATE OR REPLACE FUNCTION public.notify_task_comment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
  _task_title text;
  _author_name text;
  _author_user_id uuid;
BEGIN
  SELECT title INTO _task_title FROM public.board_tasks WHERE id = NEW.task_id;
  SELECT full_name, user_id INTO _author_name, _author_user_id FROM public.profiles WHERE id = NEW.author_profile_id;

  FOR _rec IN
    SELECT DISTINCT p.user_id
    FROM public.board_task_assignees bta
    JOIN public.profiles p ON p.id = bta.assignee_profile_id
    WHERE bta.task_id = NEW.task_id
  LOOP
    IF _rec.user_id <> _author_user_id THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.user_id,
        'task_comment',
        'Новый комментарий',
        coalesce(_author_name, 'Пользователь') || ': ' || left(NEW.body, 100),
        'task',
        NEW.task_id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_comment
  AFTER INSERT ON public.board_task_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_comment();


-- 2.4 personal_message: при отправке личного сообщения
CREATE OR REPLACE FUNCTION public.notify_personal_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _sender_name text;
  _receiver_user_id uuid;
  _body_text text;
BEGIN
  SELECT full_name INTO _sender_name FROM public.profiles WHERE id = NEW.sender_id;
  SELECT user_id INTO _receiver_user_id FROM public.profiles WHERE id = NEW.receiver_id;

  -- Используем имя файла если есть файл, иначе текст сообщения
  _body_text := CASE
    WHEN NEW.file_name IS NOT NULL THEN NEW.file_name
    ELSE left(NEW.content, 100)
  END;

  IF _receiver_user_id IS NOT NULL AND trim(_body_text) <> '' THEN
    INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
    VALUES (
      _receiver_user_id,
      'personal_message',
      'Сообщение от ' || coalesce(_sender_name, 'Пользователь'),
      _body_text,
      'message',
      NEW.id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_personal_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_personal_message();


-- 2.5 group_message: при отправке сообщения в группу
CREATE OR REPLACE FUNCTION public.notify_group_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
  _sender_name text;
  _group_name text;
  _sender_user_id uuid;
  _body_text text;
BEGIN
  SELECT full_name, user_id INTO _sender_name, _sender_user_id FROM public.profiles WHERE id = NEW.sender_id;
  SELECT name INTO _group_name FROM public.chat_groups WHERE id = NEW.group_id;

  -- Используем имя файла если есть файл, иначе текст сообщения
  _body_text := CASE
    WHEN NEW.file_name IS NOT NULL THEN NEW.file_name
    ELSE left(NEW.content, 100)
  END;

  IF trim(_body_text) <> '' THEN
    FOR _rec IN
      SELECT p.user_id
      FROM public.chat_group_members cgm
      JOIN public.profiles p ON p.id = cgm.profile_id
      WHERE cgm.group_id = NEW.group_id
    LOOP
      IF _rec.user_id <> _sender_user_id THEN
        INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
        VALUES (
          _rec.user_id,
          'group_message',
          _group_name || ': ' || coalesce(_sender_name, 'Пользователь'),
          _body_text,
          'group_message',
          NEW.group_id::text
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_group_message
  AFTER INSERT ON public.chat_group_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_group_message();


-- 2.6 meeting_invitation: при создании запланированного заседания
CREATE OR REPLACE FUNCTION public.notify_meeting_invitation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
BEGIN
  IF NEW.status <> 'scheduled' THEN
    RETURN NEW;
  END IF;

  FOR _rec IN
    SELECT id FROM public.profiles WHERE organization_id = NEW.organization_id
  LOOP
    IF _rec.id <> auth.uid() THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.id,
        'meeting_invitation',
        'Новое заседание',
        coalesce(NEW.title, 'Заседание'),
        'meeting',
        NEW.id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_meeting_invitation
  AFTER INSERT ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_meeting_invitation();


-- ============================================================
-- 017a_fix_notification_triggers.sql
-- ============================================================
-- ============================================================
-- Фикс триггеров уведомлений: profiles.user_id → profiles.id,
-- meetings.org_id → meetings.organization_id
-- Запускать если 017_notifications.sql уже применён
-- ============================================================

-- 2.1 task_assigned
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _task_title text;
  _assignee_id uuid;
BEGIN
  SELECT title INTO _task_title FROM public.board_tasks WHERE id = NEW.task_id;
  -- profiles.id = auth.uid(), нет отдельного user_id
  _assignee_id := NEW.assignee_profile_id;

  IF _assignee_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
    VALUES (
      _assignee_id,
      'task_assigned',
      'Новое поручение',
      coalesce(_task_title, 'Поручение'),
      'task',
      NEW.task_id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 2.2 task_status_changed
CREATE OR REPLACE FUNCTION public.notify_task_status_changed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
  _status_label text;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  _status_label := CASE NEW.status
    WHEN 'open' THEN 'Открыто'
    WHEN 'in_progress' THEN 'В работе'
    WHEN 'done' THEN 'Выполнено'
    WHEN 'canceled' THEN 'Отменено'
    WHEN 'overdue' THEN 'Просрочено'
    ELSE NEW.status
  END;

  FOR _rec IN
    SELECT p.id AS profile_id
    FROM public.board_task_assignees bta
    JOIN public.profiles p ON p.id = bta.assignee_profile_id
    WHERE bta.task_id = NEW.id
  LOOP
    IF _rec.profile_id <> auth.uid() THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.profile_id,
        'task_status_changed',
        'Статус поручения изменён',
        coalesce(NEW.title, '') || ' → ' || _status_label,
        'task',
        NEW.id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 2.3 task_comment
CREATE OR REPLACE FUNCTION public.notify_task_comment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
  _task_title text;
  _author_name text;
BEGIN
  SELECT title INTO _task_title FROM public.board_tasks WHERE id = NEW.task_id;
  SELECT full_name INTO _author_name FROM public.profiles WHERE id = NEW.author_profile_id;

  FOR _rec IN
    SELECT DISTINCT p.id AS profile_id
    FROM public.board_task_assignees bta
    JOIN public.profiles p ON p.id = bta.assignee_profile_id
    WHERE bta.task_id = NEW.task_id
  LOOP
    IF _rec.profile_id <> NEW.author_profile_id THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.profile_id,
        'task_comment',
        'Новый комментарий',
        coalesce(_author_name, 'Пользователь') || ': ' || left(NEW.body, 100),
        'task',
        NEW.task_id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 2.4 personal_message
CREATE OR REPLACE FUNCTION public.notify_personal_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _sender_name text;
BEGIN
  SELECT full_name INTO _sender_name FROM public.profiles WHERE id = NEW.sender_id;

  -- receiver_id уже является profile.id = auth.uid()
  IF NEW.receiver_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
    VALUES (
      NEW.receiver_id,
      'personal_message',
      'Сообщение от ' || coalesce(_sender_name, 'Пользователь'),
      left(NEW.content, 100),
      'message',
      NEW.id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 2.5 group_message
CREATE OR REPLACE FUNCTION public.notify_group_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
  _sender_name text;
  _group_name text;
BEGIN
  SELECT full_name INTO _sender_name FROM public.profiles WHERE id = NEW.sender_id;
  SELECT name INTO _group_name FROM public.chat_groups WHERE id = NEW.group_id;

  FOR _rec IN
    SELECT p.id AS profile_id
    FROM public.chat_group_members cgm
    JOIN public.profiles p ON p.id = cgm.profile_id
    WHERE cgm.group_id = NEW.group_id
  LOOP
    IF _rec.profile_id <> NEW.sender_id THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.profile_id,
        'group_message',
        _group_name || ': ' || coalesce(_sender_name, 'Пользователь'),
        left(NEW.content, 100),
        'group_message',
        NEW.group_id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 2.6 meeting_invitation
CREATE OR REPLACE FUNCTION public.notify_meeting_invitation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
BEGIN
  IF NEW.status <> 'scheduled' THEN
    RETURN NEW;
  END IF;

  FOR _rec IN
    SELECT id AS profile_id FROM public.profiles WHERE organization_id = NEW.organization_id
  LOOP
    IF _rec.profile_id <> auth.uid() THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.profile_id,
        'meeting_invitation',
        'Новое заседание',
        coalesce(NEW.title, 'Заседание'),
        'meeting',
        NEW.id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 018_board_work_plans.sql
-- ============================================================
-- ============================================================
-- Board Platform — План работ Наблюдательного совета
-- Запускать ПОСЛЕ schema.sql, 002_meetings.sql
-- ============================================================

-- 1. ТАБЛИЦЫ
-- ============================================================

CREATE TABLE IF NOT EXISTS public.board_work_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title           text NOT NULL,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  status          text NOT NULL DEFAULT 'approved'
                    CHECK (status IN ('draft', 'approved', 'archived')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.board_plan_meetings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                 uuid NOT NULL REFERENCES public.board_work_plans(id) ON DELETE CASCADE,
  meeting_number          int  NOT NULL,
  planned_date_range_text text NOT NULL,
  planned_date_from       date NOT NULL,
  planned_date_to         date NOT NULL,
  status                  text NOT NULL DEFAULT 'planned'
                            CHECK (status IN ('planned', 'completed', 'canceled')),
  linked_meeting_id       uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id, meeting_number)
);

CREATE TABLE IF NOT EXISTS public.board_plan_agenda_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_meeting_id uuid NOT NULL REFERENCES public.board_plan_meetings(id) ON DELETE CASCADE,
  order_no        int  NOT NULL,
  title           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_meeting_id, order_no)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_bwp_org ON public.board_work_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_bpm_plan ON public.board_plan_meetings(plan_id);
CREATE INDEX IF NOT EXISTS idx_bpai_meeting ON public.board_plan_agenda_items(plan_meeting_id);

-- RLS
ALTER TABLE public.board_work_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_plan_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_plan_agenda_items ENABLE ROW LEVEL SECURITY;

-- Политики: чтение для всех аутентифицированных из своей организации
CREATE POLICY "bwp_select" ON public.board_work_plans
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id());

CREATE POLICY "bwp_insert" ON public.board_work_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman')
  );

CREATE POLICY "bpm_select" ON public.board_plan_meetings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans p
      WHERE p.id = plan_id AND p.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "bpm_insert" ON public.board_plan_meetings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_work_plans p
      WHERE p.id = plan_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  );

CREATE POLICY "bpai_select" ON public.board_plan_agenda_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings pm
      JOIN public.board_work_plans p ON p.id = pm.plan_id
      WHERE pm.id = plan_meeting_id AND p.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "bpai_insert" ON public.board_plan_agenda_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings pm
      JOIN public.board_work_plans p ON p.id = pm.plan_id
      WHERE pm.id = plan_meeting_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  );


-- 2. Расширение таблицы meetings: добавить source и plan_meeting_id
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.meetings ADD COLUMN source text DEFAULT 'manual';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'plan_meeting_id'
  ) THEN
    ALTER TABLE public.meetings ADD COLUMN plan_meeting_id uuid REFERENCES public.board_plan_meetings(id) ON DELETE SET NULL;
  END IF;
END
$$;


-- ============================================================
-- 020_chat_attachments.sql
-- ============================================================
-- ============================================================
-- Board Platform — Вложения в чат (файлы и изображения)
-- Запускать в Supabase SQL Editor
-- ============================================================

-- 1. Storage bucket для файлов чата
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS на bucket
CREATE POLICY "chat_att_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "chat_att_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "chat_att_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments');

-- 2. Добавить колонки вложений в messages (личные сообщения)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS file_name    text,
  ADD COLUMN IF NOT EXISTS file_size    integer,
  ADD COLUMN IF NOT EXISTS mime_type    text,
  ADD COLUMN IF NOT EXISTS storage_path text;

-- 3. Добавить колонки вложений в chat_group_messages (групповые)
ALTER TABLE public.chat_group_messages
  ADD COLUMN IF NOT EXISTS file_name    text,
  ADD COLUMN IF NOT EXISTS file_size    integer,
  ADD COLUMN IF NOT EXISTS mime_type    text,
  ADD COLUMN IF NOT EXISTS storage_path text;

-- 4. Разрешить пустой текст (сообщение может быть только файлом)
-- Убираем NOT NULL с body/content и CHECK constraint

-- Для messages: убрать CHECK на body (если есть) и сделать nullable
DO $$
DECLARE
  con_name text;
BEGIN
  -- Ищем CHECK constraint на колонке body или content
  FOR con_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I', con_name);
  END LOOP;
END $$;

ALTER TABLE public.messages ALTER COLUMN body DROP NOT NULL;

-- Для chat_group_messages: сделать content nullable
ALTER TABLE public.chat_group_messages ALTER COLUMN content DROP NOT NULL;


-- ============================================================
-- 022_doc_links.sql
-- ============================================================
-- ============================================================
-- Board Platform — Документооборот v2: простой каталог ссылок
-- Запускать в Supabase SQL Editor
-- ============================================================

-- ОТКАТ: удаляем все таблицы Google-интеграции (миграция 021)
-- Порядок важен из-за foreign key.
-- ============================================================

drop table if exists public.docflow_document_members cascade;
drop table if exists public.docflow_documents cascade;
drop table if exists public.docflow_templates cascade;
drop table if exists public.user_google_tokens cascade;
drop function if exists public.get_profile_email(uuid);


-- НОВАЯ ТАБЛИЦА: doc_links
-- Простой каталог ссылок на Google Docs/Drive.
-- ============================================================

create table public.doc_links (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid         not null references public.organizations(id),
  title       text         not null,
  description text,
  url         text         not null,
  sort_order  int          not null default 100,
  is_active   boolean      not null default true,
  created_by  uuid         references public.profiles(id),
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now()
);

create index idx_doc_links_org on public.doc_links(org_id);

alter table public.doc_links enable row level security;

-- Все в организации видят активные ссылки
create policy "doc_links_select" on public.doc_links
  for select using (org_id = public.get_my_org_id());

-- Добавлять могут admin и chairman
create policy "doc_links_insert" on public.doc_links
  for insert with check (
    org_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'chairman')
  );

-- Обновлять могут admin и chairman
create policy "doc_links_update" on public.doc_links
  for update using (
    org_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'chairman')
  );

-- Удалять могут admin и chairman
create policy "doc_links_delete" on public.doc_links
  for delete using (
    org_id = public.get_my_org_id()
    and public.get_my_role() in ('admin', 'chairman')
  );


-- ============================================================
-- 023_profile_locale.sql
-- ============================================================
-- ============================================================
-- Board Platform — Добавление поля locale в profiles
-- Запускать в Supabase SQL Editor
-- ============================================================

alter table public.profiles
  add column if not exists locale text not null default 'ru';


-- ============================================================
-- 024_agenda_briefs.sql
-- ============================================================
-- ============================================================
-- Board Platform — AI-Brief for Agenda Items
-- Запускать ПОСЛЕ 003_agenda_decisions.sql в Supabase SQL Editor
-- ============================================================

create table public.agenda_briefs (
  id           uuid primary key default gen_random_uuid(),
  agenda_id    uuid    not null references public.agenda_items(id) on delete cascade,
  brief_text   text    not null,
  files_used   int     not null default 0,
  updated_at   timestamptz not null default now(),
  updated_by   uuid    not null references public.profiles(id)
);

create unique index idx_agenda_briefs_agenda on public.agenda_briefs(agenda_id);

alter table public.agenda_briefs enable row level security;

-- SELECT: все роли видят briefs (через org membership проверяется на уровне agenda_items)
create policy "agenda_briefs_select" on public.agenda_briefs
  for select using (
    exists (
      select 1 from public.agenda_items ai
      where ai.id = agenda_briefs.agenda_id
        and ai.org_id = public.get_my_org_id()
    )
  );

-- INSERT: admin и chairman
create policy "agenda_briefs_insert" on public.agenda_briefs
  for insert with check (
    public.get_my_role() in ('admin', 'chairman')
    and exists (
      select 1 from public.agenda_items ai
      where ai.id = agenda_briefs.agenda_id
        and ai.org_id = public.get_my_org_id()
    )
  );

-- UPDATE: admin и chairman
create policy "agenda_briefs_update" on public.agenda_briefs
  for update using (
    public.get_my_role() in ('admin', 'chairman')
    and exists (
      select 1 from public.agenda_items ai
      where ai.id = agenda_briefs.agenda_id
        and ai.org_id = public.get_my_org_id()
    )
  );

-- DELETE: admin
create policy "agenda_briefs_delete" on public.agenda_briefs
  for delete using (
    public.get_my_role() = 'admin'
    and exists (
      select 1 from public.agenda_items ai
      where ai.id = agenda_briefs.agenda_id
        and ai.org_id = public.get_my_org_id()
    )
  );


-- ============================================================
-- 025_agenda_briefs_lang.sql
-- ============================================================
-- ============================================================
-- Board Platform — Add lang + docx_path to agenda_briefs
-- Запускать ПОСЛЕ 024_agenda_briefs.sql в Supabase SQL Editor
-- ============================================================

-- 1) Add columns
alter table public.agenda_briefs
  add column if not exists lang text not null default 'ru',
  add column if not exists docx_path text;

-- 2) Drop old unique index (agenda_id only) and create new (agenda_id, lang)
drop index if exists public.idx_agenda_briefs_agenda;
create unique index idx_agenda_briefs_agenda_lang on public.agenda_briefs(agenda_id, lang);

-- 3) Create storage bucket for briefs (if not exists)
insert into storage.buckets (id, name, public)
values ('briefs', 'briefs', false)
on conflict (id) do nothing;

-- 4) Storage policies for briefs bucket
-- Authenticated users in same org can read briefs
create policy "briefs_select" on storage.objects
  for select using (
    bucket_id = 'briefs'
    and auth.role() = 'authenticated'
  );

-- Admin/chairman can insert/update briefs
create policy "briefs_insert" on storage.objects
  for insert with check (
    bucket_id = 'briefs'
    and auth.role() = 'authenticated'
  );

create policy "briefs_update" on storage.objects
  for update using (
    bucket_id = 'briefs'
    and auth.role() = 'authenticated'
  );


-- ============================================================
-- 026_single_company_roles.sql
-- ============================================================
-- ============================================================
-- Single-Company User Profile + Roles System
-- Creates profiles table with RLS for email-confirmed users only
-- ============================================================

-- 1. Create enum type for user roles (if it doesn't exist)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'corp_secretary', 'board_member', 'management');
  end if;
end
$$;

-- 2. Create new profiles table for single-company
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'board_member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- NOTE: If you have old profiles data, manually migrate with:
-- INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
-- SELECT user_id, coalesce(au.email, ''), coalesce(p.full_name, ''),
--        CAST(p.role AS public.user_role),
--        p.created_at, NOW()
-- FROM old_profiles p
-- JOIN auth.users au ON au.id = p.user_id
-- ON CONFLICT (id) DO NOTHING;

-- 3. Create indexes for performance
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_created_at on public.profiles(created_at);

-- 4. Enable RLS on profiles table
alter table public.profiles enable row level security;

-- Drop all existing policies on profiles
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_insert_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_update_own_profile" on public.profiles;
drop policy if exists "profiles_update_role_as_admin" on public.profiles;

-- 5. RLS Policies
-- SELECT: All authenticated users can view all profiles
create policy "profiles_select_authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');

-- UPDATE own profile: Users can update their own profile fields (except role)
-- This policy prevents updating the role field
create policy "profiles_update_own_profile" on public.profiles
  for update 
  using (auth.uid() = id)
  with check (
    auth.uid() = id and
    -- Prevent changing role through normal user update
    (select role from public.profiles where id = auth.uid()) = 
    (select role from public.profiles where id = auth.uid())
  );

-- UPDATE role as admin: Only admin users can update role
create policy "profiles_update_role_as_admin" on public.profiles
  for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 6. Create trigger function to insert profile when email is confirmed
-- This function inserts a NEW profile record when email_confirmed_at becomes not null
create or replace function public.create_profile_on_email_confirmed()
returns trigger
language plpgsql security definer
set search_path = 'public'
as $$
declare
  _full_name text;
begin
  -- Only create profile if email_confirmed_at is being set to not null
  -- and the profile doesn't already exist
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    _full_name := coalesce(new.raw_user_meta_data ->> 'full_name', new.email);
    
    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email, _full_name, 'board_member')
    on conflict (id) do nothing;
  end if;
  
  return new;
end;
$$;

-- Attach trigger to auth.users
drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update on auth.users
  for each row
  execute function public.create_profile_on_email_confirmed();

-- 7. Helper function to check if user is admin
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 8. Helper function to get user's role
create or replace function public.get_user_role()
returns public.user_role
language plpgsql stable security definer
set search_path = 'public'
as $$
declare
  _role public.user_role;
begin
  select role into _role from public.profiles where id = auth.uid();
  return _role;
end;
$$;


-- ============================================================
-- 026_video_conferences.sql
-- ============================================================
-- ============================================================
-- Board Platform — Video Conferences (standalone calls)
-- Запускать в Supabase SQL Editor
-- ============================================================

create table public.video_conferences (
  id           uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title        text not null,
  scheduled_at timestamptz not null,
  meeting_url  text,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

create index idx_video_conferences_org on public.video_conferences(organization_id);

alter table public.video_conferences enable row level security;

-- SELECT: все участники организации
create policy "vc_select" on public.video_conferences
  for select using (organization_id = public.get_my_org_id());

-- INSERT: любой авторизованный участник организации
create policy "vc_insert" on public.video_conferences
  for insert with check (organization_id = public.get_my_org_id());

-- UPDATE: создатель или admin
create policy "vc_update" on public.video_conferences
  for update using (
    organization_id = public.get_my_org_id()
    and (created_by = auth.uid() or public.get_my_role() = 'admin')
  );

-- DELETE: создатель или admin
create policy "vc_delete" on public.video_conferences
  for delete using (
    organization_id = public.get_my_org_id()
    and (created_by = auth.uid() or public.get_my_role() = 'admin')
  );


-- ============================================================
-- 027_admin_user_management.sql
-- ============================================================
-- ============================================================
-- 027: Admin User Management — new roles + role_details field
-- ============================================================

-- 1. Add new role values to the enum
-- PostgreSQL enums can only be extended with ADD VALUE
do $$
begin
  -- Add 'executive' (Член Правления)
  if not exists (select 1 from pg_enum where enumlabel = 'executive' and enumtypid = (select oid from pg_type where typname = 'user_role')) then
    alter type public.user_role add value 'executive';
  end if;
  -- Add 'employee' (Сотрудник)
  if not exists (select 1 from pg_enum where enumlabel = 'employee' and enumtypid = (select oid from pg_type where typname = 'user_role')) then
    alter type public.user_role add value 'employee';
  end if;
  -- Add 'auditor' (Внутренний аудитор)
  if not exists (select 1 from pg_enum where enumlabel = 'auditor' and enumtypid = (select oid from pg_type where typname = 'user_role')) then
    alter type public.user_role add value 'auditor';
  end if;
end
$$;

-- 2. Add role_details column (free-text supplement to the main role)
alter table public.profiles add column if not exists role_details text;

-- 3. Add INSERT policy for admins (needed to create profiles for new users)
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles
  for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 4. Add DELETE policy for admins
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
  for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );


-- ============================================================
-- 028_multilingual_fields.sql
-- ============================================================
-- ============================================================
-- 028: Add multilingual fields (_ru, _uz, _en) for structured entities
-- Copies current single-language values into *_ru fields
-- Does NOT touch: chat messages, comments, uploaded files, doc_links
-- ============================================================

-- ========================
-- 1. meetings
-- ========================
ALTER TABLE IF EXISTS public.meetings
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.meetings SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;

-- ========================
-- 2. agenda_items
-- ========================
ALTER TABLE IF EXISTS public.agenda_items
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS presenter_ru text,
  ADD COLUMN IF NOT EXISTS presenter_uz text,
  ADD COLUMN IF NOT EXISTS presenter_en text;

UPDATE public.agenda_items SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;
UPDATE public.agenda_items SET presenter_ru = presenter WHERE presenter_ru IS NULL AND presenter IS NOT NULL;

-- ========================
-- 3. decisions
-- ========================
ALTER TABLE IF EXISTS public.decisions
  ADD COLUMN IF NOT EXISTS decision_text_ru text,
  ADD COLUMN IF NOT EXISTS decision_text_uz text,
  ADD COLUMN IF NOT EXISTS decision_text_en text;

UPDATE public.decisions SET decision_text_ru = decision_text WHERE decision_text_ru IS NULL AND decision_text IS NOT NULL;

-- ========================
-- 4. board_tasks
-- ========================
ALTER TABLE IF EXISTS public.board_tasks
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS description_ru text,
  ADD COLUMN IF NOT EXISTS description_uz text,
  ADD COLUMN IF NOT EXISTS description_en text;

UPDATE public.board_tasks SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;
UPDATE public.board_tasks SET description_ru = description WHERE description_ru IS NULL AND description IS NOT NULL;

-- ========================
-- 5. votings
-- ========================
ALTER TABLE IF EXISTS public.votings
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS description_ru text,
  ADD COLUMN IF NOT EXISTS description_uz text,
  ADD COLUMN IF NOT EXISTS description_en text;

UPDATE public.votings SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;
UPDATE public.votings SET description_ru = description WHERE description_ru IS NULL AND description IS NOT NULL;

-- ========================
-- 6. video_conferences
-- ========================
ALTER TABLE IF EXISTS public.video_conferences
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.video_conferences SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;

-- ========================
-- 7. board_work_plans
-- ========================
ALTER TABLE IF EXISTS public.board_work_plans
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.board_work_plans SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;

-- ========================
-- 8. plan_meetings
-- ========================
ALTER TABLE IF EXISTS public.plan_meetings
  ADD COLUMN IF NOT EXISTS planned_date_range_text_ru text,
  ADD COLUMN IF NOT EXISTS planned_date_range_text_uz text,
  ADD COLUMN IF NOT EXISTS planned_date_range_text_en text;

UPDATE public.plan_meetings SET planned_date_range_text_ru = planned_date_range_text WHERE planned_date_range_text_ru IS NULL AND planned_date_range_text IS NOT NULL;

-- ========================
-- 9. plan_agenda_items
-- ========================
ALTER TABLE IF EXISTS public.plan_agenda_items
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.plan_agenda_items SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;

-- ========================
-- 10. shareholder_meetings
-- ========================
ALTER TABLE IF EXISTS public.shareholder_meetings
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.shareholder_meetings SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;

-- ========================
-- 11. shareholder_agenda_items
-- ========================
ALTER TABLE IF EXISTS public.shareholder_agenda_items
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.shareholder_agenda_items SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;

-- ========================
-- 12. shareholder_materials
-- ========================
ALTER TABLE IF EXISTS public.shareholder_materials
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.shareholder_materials SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;


-- ============================================================
-- 029_fix_get_my_org_id.sql
-- ============================================================
-- ============================================================
-- 029: Fix get_my_org_id() for single-company schema
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.organizations LIMIT 1;
$$;

-- Fix board_tasks INSERT policy to include corp_secretary role
DROP POLICY IF EXISTS "board_tasks_insert" ON public.board_tasks;

CREATE POLICY "board_tasks_insert" ON public.board_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_org_id()
    AND (
      SELECT role::text FROM public.profiles WHERE id = auth.uid()
    ) IN ('admin', 'chairman', 'board_member', 'corp_secretary')
  );


-- ============================================================
-- 030_board_tasks_multilingual.sql
-- ============================================================
-- 030_board_tasks_multilingual.sql
-- Add multilingual fields to board_tasks table (backward-compatible)

ALTER TABLE public.board_tasks
  ADD COLUMN IF NOT EXISTS source_language text NOT NULL DEFAULT 'ru',
  ADD COLUMN IF NOT EXISTS title_ru    text,
  ADD COLUMN IF NOT EXISTS title_uz    text,
  ADD COLUMN IF NOT EXISTS title_en    text,
  ADD COLUMN IF NOT EXISTS description_ru text,
  ADD COLUMN IF NOT EXISTS description_uz text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS translation_status_ru text NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS translation_status_uz text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_status_en text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_updated_at timestamptz;

-- Migrate existing data: copy title/description into _ru columns
UPDATE public.board_tasks
SET
  title_ru              = title,
  description_ru        = description,
  translation_status_ru = 'original'
WHERE title_ru IS NULL;

-- Add a GIN index for full-text search across all language title columns (optional, for performance)
-- CREATE INDEX IF NOT EXISTS board_tasks_title_gin
--   ON public.board_tasks USING gin(
--     to_tsvector('simple', coalesce(title_ru,'') || ' ' || coalesce(title_uz,'') || ' ' || coalesce(title_en,''))
--   );


-- ============================================================
-- 031_meetings_multilingual_status.sql
-- ============================================================
-- ============================================================
-- 031: Add multilingual title columns + translation status
--      to meetings table (includes what 028 may have missed)
-- ============================================================

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS title_ru               text,
  ADD COLUMN IF NOT EXISTS title_uz               text,
  ADD COLUMN IF NOT EXISTS title_en               text,
  ADD COLUMN IF NOT EXISTS source_language        text NOT NULL DEFAULT 'ru',
  ADD COLUMN IF NOT EXISTS translation_status_ru  text NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS translation_status_uz  text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_status_en  text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_updated_at timestamptz;

-- Backfill title_ru from existing title for all rows
UPDATE public.meetings
SET title_ru = title
WHERE title_ru IS NULL AND title IS NOT NULL;


-- ============================================================
-- 032_agenda_items_multilingual.sql
-- ============================================================
-- ============================================================
-- 032: Add multilingual fields + translation status to agenda_items
--      (title_ru/uz/en and presenter_ru/uz/en may already exist
--       from migration 028 if it was applied; using IF NOT EXISTS)
-- ============================================================

ALTER TABLE public.agenda_items
  ADD COLUMN IF NOT EXISTS title_ru               text,
  ADD COLUMN IF NOT EXISTS title_uz               text,
  ADD COLUMN IF NOT EXISTS title_en               text,
  ADD COLUMN IF NOT EXISTS presenter_ru           text,
  ADD COLUMN IF NOT EXISTS presenter_uz           text,
  ADD COLUMN IF NOT EXISTS presenter_en           text,
  ADD COLUMN IF NOT EXISTS source_language        text NOT NULL DEFAULT 'ru',
  ADD COLUMN IF NOT EXISTS translation_status_ru  text NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS translation_status_uz  text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_status_en  text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_updated_at timestamptz;

-- Backfill title_ru from existing title for all rows
UPDATE public.agenda_items
SET title_ru = title
WHERE title_ru IS NULL AND title IS NOT NULL;

-- Backfill presenter_ru from existing presenter for all rows
UPDATE public.agenda_items
SET presenter_ru = presenter
WHERE presenter_ru IS NULL AND presenter IS NOT NULL;


-- ============================================================
-- 033_workplan_admin.sql
-- ============================================================
-- ============================================================
-- Board Platform — Work Plan: multilingual fields + admin CRUD
-- Run AFTER 018_board_work_plans.sql
-- ============================================================

-- ── Multilingual title for board_work_plans ────────────────────────────────
ALTER TABLE public.board_work_plans ADD COLUMN IF NOT EXISTS title_ru text;
ALTER TABLE public.board_work_plans ADD COLUMN IF NOT EXISTS title_uz text;
ALTER TABLE public.board_work_plans ADD COLUMN IF NOT EXISTS title_en text;
ALTER TABLE public.board_work_plans ADD COLUMN IF NOT EXISTS source_language text NOT NULL DEFAULT 'ru';

-- ── Multilingual title for board_plan_agenda_items ─────────────────────────
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS title_ru text;
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS title_uz text;
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS title_en text;
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS source_language text NOT NULL DEFAULT 'ru';
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS translation_status_ru text NOT NULL DEFAULT 'original';
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS translation_status_uz text NOT NULL DEFAULT 'missing';
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS translation_status_en text NOT NULL DEFAULT 'missing';

-- ── Backfill existing data ─────────────────────────────────────────────────
UPDATE public.board_work_plans SET title_ru = title WHERE title_ru IS NULL;
UPDATE public.board_plan_agenda_items SET title_ru = title WHERE title_ru IS NULL;

-- ── RLS: UPDATE & DELETE for board_work_plans ──────────────────────────────
DROP POLICY IF EXISTS "bwp_update" ON public.board_work_plans;
CREATE POLICY "bwp_update" ON public.board_work_plans
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman')
  )
  WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman')
  );

DROP POLICY IF EXISTS "bwp_delete" ON public.board_work_plans;
CREATE POLICY "bwp_delete" ON public.board_work_plans
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman')
  );

-- ── RLS: UPDATE & DELETE for board_plan_meetings ───────────────────────────
DROP POLICY IF EXISTS "bpm_update" ON public.board_plan_meetings;
CREATE POLICY "bpm_update" ON public.board_plan_meetings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans p
      WHERE p.id = plan_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_work_plans p
      WHERE p.id = plan_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  );

DROP POLICY IF EXISTS "bpm_delete" ON public.board_plan_meetings;
CREATE POLICY "bpm_delete" ON public.board_plan_meetings
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans p
      WHERE p.id = plan_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  );

-- ── RLS: UPDATE & DELETE for board_plan_agenda_items ──────────────────────
DROP POLICY IF EXISTS "bpai_update" ON public.board_plan_agenda_items;
CREATE POLICY "bpai_update" ON public.board_plan_agenda_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings pm
      JOIN public.board_work_plans p ON p.id = pm.plan_id
      WHERE pm.id = plan_meeting_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings pm
      JOIN public.board_work_plans p ON p.id = pm.plan_id
      WHERE pm.id = plan_meeting_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  );

DROP POLICY IF EXISTS "bpai_delete" ON public.board_plan_agenda_items;
CREATE POLICY "bpai_delete" ON public.board_plan_agenda_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings pm
      JOIN public.board_work_plans p ON p.id = pm.plan_id
      WHERE pm.id = plan_meeting_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  );


-- ============================================================
-- 034_ns_meeting_voting.sql
-- ============================================================
-- ============================================================
-- 034: NS Meeting Voting — agenda-item-level voting with
--      admin activation, member ballot, and per-meeting signature
-- Run AFTER 005_voting.sql and 002_meetings.sql
-- ============================================================

-- ── 1. Extend votings table ────────────────────────────────────────────────

-- Drop existing status CHECK constraint (auto-named) and recreate with 'draft'
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.votings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE public.votings DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.votings
  ADD CONSTRAINT votings_status_check CHECK (status IN ('draft', 'open', 'closed'));

-- Change default to 'draft' so newly created votings start inactive
ALTER TABLE public.votings ALTER COLUMN status SET DEFAULT 'draft';

-- Add activation / closure tracking columns
ALTER TABLE public.votings
  ADD COLUMN IF NOT EXISTS activated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS activated_by  uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS closed_at     timestamptz;

-- ── 2. meeting_vote_signatures — one record per member per meeting ──────────

CREATE TABLE IF NOT EXISTS public.meeting_vote_signatures (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid        NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id      uuid        NOT NULL REFERENCES public.organizations(id),
  signed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mvs_meeting ON public.meeting_vote_signatures(meeting_id);
CREATE INDEX IF NOT EXISTS idx_mvs_user    ON public.meeting_vote_signatures(user_id);

ALTER TABLE public.meeting_vote_signatures ENABLE ROW LEVEL SECURITY;

-- All org members can see signatures (for admin overview)
CREATE POLICY "mvs_select" ON public.meeting_vote_signatures
  FOR SELECT USING (org_id = public.get_my_org_id());

-- Any org member can sign once (UNIQUE enforces one per meeting)
CREATE POLICY "mvs_insert" ON public.meeting_vote_signatures
  FOR INSERT WITH CHECK (
    org_id  = public.get_my_org_id()
    AND user_id = public.get_my_profile_id()
  );

-- Nobody can delete signatures
-- (no DELETE policy = blocked by RLS)

-- ── 3. Tighten votes RLS: only vote when voting is 'open' ──────────────────

DROP POLICY IF EXISTS "votes_insert" ON public.votes;
CREATE POLICY "votes_insert" ON public.votes
  FOR INSERT WITH CHECK (
    org_id   = public.get_my_org_id()
    AND voter_id = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.votings v
      WHERE v.id = voting_id AND v.status = 'open'
    )
  );

DROP POLICY IF EXISTS "votes_update" ON public.votes;
CREATE POLICY "votes_update" ON public.votes
  FOR UPDATE USING (
    org_id   = public.get_my_org_id()
    AND voter_id = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.votings v
      WHERE v.id = voting_id AND v.status = 'open'
    )
  );

-- ── 4. Extend votings INSERT policy to allow creating in 'draft' ────────────

DROP POLICY IF EXISTS "votings_insert" ON public.votings;
CREATE POLICY "votings_insert" ON public.votings
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman')
  );

DROP POLICY IF EXISTS "votings_update" ON public.votings;
CREATE POLICY "votings_update" ON public.votings
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman')
  );


-- ============================================================
-- 036_meeting_ai_brief_toggle.sql
-- ============================================================
-- 036: Add ai_brief_enabled toggle to agenda_items table
-- Allows admin / corp_secretary to disable AI-brief generation
-- per agenda item for items containing confidential materials.

-- Move ai_brief_enabled from meetings to agenda_items
ALTER TABLE public.agenda_items
  ADD COLUMN IF NOT EXISTS ai_brief_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.agenda_items.ai_brief_enabled IS
  'When false, AI-Brief generation is disabled for this agenda item (confidential materials)';

-- Clean up: remove from meetings if it was added there previously
ALTER TABLE public.meetings
  DROP COLUMN IF EXISTS ai_brief_enabled;

-- Fix missing UPDATE policy on meetings table
-- (only INSERT and SELECT existed — UPDATE was silently blocked by RLS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meetings' AND cmd = 'UPDATE'
  ) THEN
    CREATE POLICY "Meetings: update allowed roles" ON public.meetings
      FOR UPDATE
      USING (
        organization_id = (
          SELECT p.organization_id FROM profiles p WHERE p.id = auth.uid()
        )
        AND (
          (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
          IN ('admin', 'chairman', 'corp_secretary')
        )
      );
  END IF;
END
$$;


-- ============================================================
-- 037_task_basis.sql
-- ============================================================
-- 037: Add "basis" field to board_tasks
-- Stores the legal/organizational basis for the task
-- (e.g., protocol number, meeting decision, regulatory requirement).

ALTER TABLE public.board_tasks
  ADD COLUMN IF NOT EXISTS basis text;

COMMENT ON COLUMN public.board_tasks.basis IS
  'Legal or organizational basis for this task (e.g. protocol reference, meeting decision)';


-- ============================================================
-- 038_user_approval.sql
-- ============================================================
-- 038: User approval system
-- Self-registered users need admin approval before accessing the platform.
-- Admin-created/invited users are approved immediately.

-- 1. Add approval_status column (existing users are 'approved' by default)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';

-- 2. Recreate trigger: self-registered users get 'pending' status
CREATE OR REPLACE FUNCTION public.create_profile_on_email_confirmed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _full_name text;
  _org_id uuid;
BEGIN
  IF new.email_confirmed_at IS NOT NULL AND old.email_confirmed_at IS NULL THEN
    _full_name := coalesce(new.raw_user_meta_data ->> 'full_name', new.email);
    SELECT id INTO _org_id FROM public.organizations LIMIT 1;

    INSERT INTO public.profiles (id, organization_id, email, full_name, role, approval_status)
    VALUES (new.id, _org_id, new.email, _full_name, 'board_member', 'pending')
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN new;
END;
$$;

-- Restore trigger (may have been dropped)
DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_profile_on_email_confirmed();


-- ============================================================
-- 039_password_reset_flag.sql
-- ============================================================
-- Add password_reset_required flag to profiles
-- When admin resets a user's password, this flag is set to true.
-- User can then change password without knowing the old one (via edge function).

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS password_reset_required boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 040_multilingual_profile_fields.sql
-- ============================================================
-- Add multilingual fields for full_name and role_details
-- Existing full_name and role_details are used as Russian (default)
-- New columns for English and Uzbek translations

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name_en text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name_uz text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_details_en text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_details_uz text;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 041_corp_secretary_permissions.sql
-- ============================================================
-- ============================================================
-- Migration 041: Расширение прав corp_secretary
-- Добавить corp_secretary ко всем RLS-политикам, где есть admin/chairman
-- (кроме управления пользователями — остаётся только admin)
-- ============================================================

-- ── Meetings (002_meetings.sql) ──────────────────────────────────────────────

DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
CREATE POLICY "meetings_insert" ON public.meetings
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
CREATE POLICY "meetings_update" ON public.meetings
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;
CREATE POLICY "meetings_delete" ON public.meetings
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Agenda Items & Decisions (003_agenda_decisions.sql) ──────────────────────

DROP POLICY IF EXISTS "agenda_items_insert" ON public.agenda_items;
CREATE POLICY "agenda_items_insert" ON public.agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_items_update" ON public.agenda_items;
CREATE POLICY "agenda_items_update" ON public.agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_items_delete" ON public.agenda_items;
CREATE POLICY "agenda_items_delete" ON public.agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "decisions_insert" ON public.decisions;
CREATE POLICY "decisions_insert" ON public.decisions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "decisions_update" ON public.decisions;
CREATE POLICY "decisions_update" ON public.decisions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "decisions_delete" ON public.decisions;
CREATE POLICY "decisions_delete" ON public.decisions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Voting (005_voting.sql) ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "votings_insert" ON public.votings;
CREATE POLICY "votings_insert" ON public.votings
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "votings_update" ON public.votings;
CREATE POLICY "votings_update" ON public.votings
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Documents DELETE (006_documents.sql) ─────────────────────────────────────

DROP POLICY IF EXISTS "documents_delete" ON public.documents;
CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'corp_secretary')
  );

-- ── Shareholder Meetings (008_shareholder_meetings.sql) ──────────────────────

DROP POLICY IF EXISTS "sh_meetings_insert" ON public.shareholder_meetings;
CREATE POLICY "sh_meetings_insert" ON public.shareholder_meetings
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_meetings_update" ON public.shareholder_meetings;
CREATE POLICY "sh_meetings_update" ON public.shareholder_meetings
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_meetings_delete" ON public.shareholder_meetings;
CREATE POLICY "sh_meetings_delete" ON public.shareholder_meetings
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- Shareholder agenda items
DROP POLICY IF EXISTS "sh_agenda_insert" ON public.shareholder_agenda_items;
CREATE POLICY "sh_agenda_insert" ON public.shareholder_agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shareholder_meetings sm
      WHERE sm.id = meeting_id
        AND sm.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_agenda_update" ON public.shareholder_agenda_items;
CREATE POLICY "sh_agenda_update" ON public.shareholder_agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.shareholder_meetings sm
      WHERE sm.id = meeting_id
        AND sm.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_agenda_delete" ON public.shareholder_agenda_items;
CREATE POLICY "sh_agenda_delete" ON public.shareholder_agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.shareholder_meetings sm
      WHERE sm.id = meeting_id
        AND sm.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Board Tasks (014_board_tasks.sql) ────────────────────────────────────────

DROP POLICY IF EXISTS "board_tasks_insert" ON public.board_tasks;
CREATE POLICY "board_tasks_insert" ON public.board_tasks
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary', 'board_member')
  );

DROP POLICY IF EXISTS "board_tasks_update" ON public.board_tasks;
CREATE POLICY "board_tasks_update" ON public.board_tasks
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND (
      created_by = auth.uid()
      OR public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
    )
  );

DROP POLICY IF EXISTS "board_tasks_delete" ON public.board_tasks;
CREATE POLICY "board_tasks_delete" ON public.board_tasks
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Doc Links — already updated, but ensure corp_secretary ───────────────────

DROP POLICY IF EXISTS "doc_links_insert" ON public.doc_links;
CREATE POLICY "doc_links_insert" ON public.doc_links
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "doc_links_update" ON public.doc_links;
CREATE POLICY "doc_links_update" ON public.doc_links
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "doc_links_delete" ON public.doc_links;
CREATE POLICY "doc_links_delete" ON public.doc_links
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Agenda Briefs (024_agenda_briefs.sql) ────────────────────────────────────

DROP POLICY IF EXISTS "agenda_briefs_insert" ON public.agenda_briefs;
CREATE POLICY "agenda_briefs_insert" ON public.agenda_briefs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_briefs_update" ON public.agenda_briefs;
CREATE POLICY "agenda_briefs_update" ON public.agenda_briefs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_briefs_delete" ON public.agenda_briefs;
CREATE POLICY "agenda_briefs_delete" ON public.agenda_briefs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Agenda Briefs Lang (025_agenda_briefs_lang.sql) ──────────────────────────

DROP POLICY IF EXISTS "agenda_brief_langs_insert" ON public.agenda_brief_langs;
CREATE POLICY "agenda_brief_langs_insert" ON public.agenda_brief_langs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agenda_briefs ab
      JOIN public.agenda_items ai ON ai.id = ab.agenda_item_id
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ab.id = brief_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_brief_langs_update" ON public.agenda_brief_langs;
CREATE POLICY "agenda_brief_langs_update" ON public.agenda_brief_langs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_briefs ab
      JOIN public.agenda_items ai ON ai.id = ab.agenda_item_id
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ab.id = brief_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Work Plans (033_workplan_admin.sql) ──────────────────────────────────────

DROP POLICY IF EXISTS "work_plans_insert" ON public.board_work_plans;
CREATE POLICY "work_plans_insert" ON public.board_work_plans
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "work_plans_update" ON public.board_work_plans;
CREATE POLICY "work_plans_update" ON public.board_work_plans
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "work_plans_delete" ON public.board_work_plans;
CREATE POLICY "work_plans_delete" ON public.board_work_plans
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- Work plan meetings
DROP POLICY IF EXISTS "wp_meetings_insert" ON public.work_plan_meetings;
CREATE POLICY "wp_meetings_insert" ON public.work_plan_meetings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_work_plans wp
      WHERE wp.id = plan_id
        AND wp.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_meetings_update" ON public.work_plan_meetings;
CREATE POLICY "wp_meetings_update" ON public.work_plan_meetings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans wp
      WHERE wp.id = plan_id
        AND wp.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_meetings_delete" ON public.work_plan_meetings;
CREATE POLICY "wp_meetings_delete" ON public.work_plan_meetings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans wp
      WHERE wp.id = plan_id
        AND wp.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- Work plan agenda items
DROP POLICY IF EXISTS "wp_agenda_insert" ON public.work_plan_agenda_items;
CREATE POLICY "wp_agenda_insert" ON public.work_plan_agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_plan_meetings wm
      JOIN public.board_work_plans wp ON wp.id = wm.plan_id
      WHERE wm.id = meeting_id
        AND wp.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_agenda_update" ON public.work_plan_agenda_items;
CREATE POLICY "wp_agenda_update" ON public.work_plan_agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.work_plan_meetings wm
      JOIN public.board_work_plans wp ON wp.id = wm.plan_id
      WHERE wm.id = meeting_id
        AND wp.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_agenda_delete" ON public.work_plan_agenda_items;
CREATE POLICY "wp_agenda_delete" ON public.work_plan_agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.work_plan_meetings wm
      JOIN public.board_work_plans wp ON wp.id = wm.plan_id
      WHERE wm.id = meeting_id
        AND wp.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── NS Meeting Voting (034_ns_meeting_voting.sql) ───────────────────────────

DROP POLICY IF EXISTS "ns_meetings_insert" ON public.ns_meetings;
CREATE POLICY "ns_meetings_insert" ON public.ns_meetings
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "ns_meetings_update" ON public.ns_meetings;
CREATE POLICY "ns_meetings_update" ON public.ns_meetings
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "ns_meetings_delete" ON public.ns_meetings;
CREATE POLICY "ns_meetings_delete" ON public.ns_meetings
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- NS meeting agenda items
DROP POLICY IF EXISTS "ns_agenda_items_insert" ON public.ns_agenda_items;
CREATE POLICY "ns_agenda_items_insert" ON public.ns_agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ns_meetings nm
      WHERE nm.id = meeting_id
        AND nm.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "ns_agenda_items_update" ON public.ns_agenda_items;
CREATE POLICY "ns_agenda_items_update" ON public.ns_agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.ns_meetings nm
      WHERE nm.id = meeting_id
        AND nm.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "ns_agenda_items_delete" ON public.ns_agenda_items;
CREATE POLICY "ns_agenda_items_delete" ON public.ns_agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.ns_meetings nm
      WHERE nm.id = meeting_id
        AND nm.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Video Conferences ────────────────────────────────────────────────────────
-- video_conferences policies may use creator check already, ensure corp_secretary can delete

DROP POLICY IF EXISTS "vc_delete" ON public.video_conferences;
CREATE POLICY "vc_delete" ON public.video_conferences
  FOR DELETE USING (
    organization_id = public.get_my_org_id()
    AND (
      created_by = auth.uid()
      OR public.get_my_role() IN ('admin', 'corp_secretary')
    )
  );


-- ============================================================
-- 042_profile_details.sql
-- ============================================================
-- ============================================================
-- Migration 042: Profile Details & Avatar
-- Расширенные профили пользователей: биография, фото, контакты
-- ============================================================

-- 1. Добавить avatar_url в основную таблицу profiles (нужен везде)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Создать таблицу profile_details для биографических данных
CREATE TABLE IF NOT EXISTS public.profile_details (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Статус в совете
  board_status    text CHECK (board_status IN ('independent', 'executive', 'non_executive', 'employee')),

  -- Текущая должность (3 языка)
  current_position_ru  text,
  current_position_en  text,
  current_position_uz  text,

  -- Текущая компания (3 языка)
  current_company_ru   text,
  current_company_en   text,
  current_company_uz   text,

  -- Подразделение (3 языка)
  department_ru        text,
  department_en        text,
  department_uz        text,

  -- Краткая биография (3 языка)
  short_bio_ru         text,
  short_bio_en         text,
  short_bio_uz         text,

  -- Образование (3 языка)
  education_ru         text,
  education_en         text,
  education_uz         text,

  -- Опыт работы (3 языка)
  work_experience_ru   text,
  work_experience_en   text,
  work_experience_uz   text,

  -- Контакты
  phone                text,
  contact_email        text,
  linkedin             text,
  telegram             text,

  -- Настройки приватности
  is_profile_public    boolean NOT NULL DEFAULT true,
  show_contacts        boolean NOT NULL DEFAULT false,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_details_profile ON public.profile_details(profile_id);

-- 3. RLS
ALTER TABLE public.profile_details ENABLE ROW LEVEL SECURITY;

-- SELECT: все могут видеть (контакты фильтруются на уровне приложения)
CREATE POLICY "profile_details_select" ON public.profile_details
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_id
    )
  );

-- INSERT: только свой профиль или admin
CREATE POLICY "profile_details_insert" ON public.profile_details
  FOR INSERT WITH CHECK (
    profile_id = auth.uid()
    OR public.get_my_role() = 'admin'
  );

-- UPDATE: только свой профиль или admin
CREATE POLICY "profile_details_update" ON public.profile_details
  FOR UPDATE USING (
    profile_id = auth.uid()
    OR public.get_my_role() = 'admin'
  );

-- DELETE: только admin
CREATE POLICY "profile_details_delete" ON public.profile_details
  FOR DELETE USING (
    public.get_my_role() = 'admin'
  );

-- 4. Обновить кэш PostgREST
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 043_voting_reminder_notification.sql
-- ============================================================
-- ============================================================
-- Migration 043: Уведомления о голосованиях
-- Добавить тип voting_reminder и триггер для напоминания
-- ============================================================

-- 1. Добавить новый тип в enum
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'voting_reminder';

-- 2. Триггер: при создании нового голосования — уведомить всех board_member и chairman
CREATE OR REPLACE FUNCTION public.fn_notify_voting_created()
RETURNS trigger AS $$
DECLARE
  member RECORD;
BEGIN
  -- Уведомить всех board_member и chairman из той же организации
  FOR member IN
    SELECT p.id AS user_id
    FROM public.profiles p
    WHERE p.organization_id = NEW.org_id
      AND p.role IN ('board_member', 'chairman')
      AND p.id != auth.uid()
  LOOP
    INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
    VALUES (
      member.user_id,
      'voting_reminder',
      NEW.title,
      'Начато новое голосование. Пожалуйста, проголосуйте.',
      'voting',
      NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_voting_created ON public.votings;
CREATE TRIGGER trg_notify_voting_created
  AFTER INSERT ON public.votings
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_voting_created();

-- 3. Обновить кэш PostgREST
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 044_fix_corp_secretary_permissions.sql
-- ============================================================
-- ============================================================
-- Migration 044: ИСПРАВЛЕННАЯ версия 041
-- Расширение прав corp_secretary — с правильными именами колонок
-- ============================================================

-- ── Meetings ─────────────────────────────────────────────────
-- Колонка: organization_id

DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
CREATE POLICY "meetings_insert" ON public.meetings
  FOR INSERT WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
CREATE POLICY "meetings_update" ON public.meetings
  FOR UPDATE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;
CREATE POLICY "meetings_delete" ON public.meetings
  FOR DELETE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Agenda Items ─────────────────────────────────────────────
-- JOIN через meetings → organization_id

DROP POLICY IF EXISTS "agenda_items_insert" ON public.agenda_items;
CREATE POLICY "agenda_items_insert" ON public.agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_items_update" ON public.agenda_items;
CREATE POLICY "agenda_items_update" ON public.agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_items_delete" ON public.agenda_items;
CREATE POLICY "agenda_items_delete" ON public.agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Decisions ────────────────────────────────────────────────

DROP POLICY IF EXISTS "decisions_insert" ON public.decisions;
CREATE POLICY "decisions_insert" ON public.decisions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "decisions_update" ON public.decisions;
CREATE POLICY "decisions_update" ON public.decisions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "decisions_delete" ON public.decisions;
CREATE POLICY "decisions_delete" ON public.decisions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Votings ──────────────────────────────────────────────────
-- Колонка: org_id

DROP POLICY IF EXISTS "votings_insert" ON public.votings;
CREATE POLICY "votings_insert" ON public.votings
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "votings_update" ON public.votings;
CREATE POLICY "votings_update" ON public.votings
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Documents ────────────────────────────────────────────────
-- Колонка: org_id

DROP POLICY IF EXISTS "documents_delete" ON public.documents;
CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'corp_secretary')
  );

-- ── Shareholder Meetings ─────────────────────────────────────
-- Колонка: organization_id

DROP POLICY IF EXISTS "sh_meetings_insert" ON public.shareholder_meetings;
CREATE POLICY "sh_meetings_insert" ON public.shareholder_meetings
  FOR INSERT WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_meetings_update" ON public.shareholder_meetings;
CREATE POLICY "sh_meetings_update" ON public.shareholder_meetings
  FOR UPDATE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_meetings_delete" ON public.shareholder_meetings;
CREATE POLICY "sh_meetings_delete" ON public.shareholder_meetings
  FOR DELETE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- Shareholder agenda items (FK через shareholder_meetings)
DROP POLICY IF EXISTS "sh_agenda_insert" ON public.shareholder_agenda_items;
CREATE POLICY "sh_agenda_insert" ON public.shareholder_agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shareholder_meetings sm
      WHERE sm.id = meeting_id
        AND sm.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_agenda_update" ON public.shareholder_agenda_items;
CREATE POLICY "sh_agenda_update" ON public.shareholder_agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.shareholder_meetings sm
      WHERE sm.id = meeting_id
        AND sm.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_agenda_delete" ON public.shareholder_agenda_items;
CREATE POLICY "sh_agenda_delete" ON public.shareholder_agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.shareholder_meetings sm
      WHERE sm.id = meeting_id
        AND sm.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Board Tasks ──────────────────────────────────────────────
-- Колонка: organization_id

DROP POLICY IF EXISTS "board_tasks_insert" ON public.board_tasks;
CREATE POLICY "board_tasks_insert" ON public.board_tasks
  FOR INSERT WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary', 'board_member')
  );

DROP POLICY IF EXISTS "board_tasks_update" ON public.board_tasks;
CREATE POLICY "board_tasks_update" ON public.board_tasks
  FOR UPDATE USING (
    organization_id = public.get_my_org_id()
    AND (
      created_by = auth.uid()
      OR public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
    )
  );

DROP POLICY IF EXISTS "board_tasks_delete" ON public.board_tasks;
CREATE POLICY "board_tasks_delete" ON public.board_tasks
  FOR DELETE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Doc Links ────────────────────────────────────────────────
-- Колонка: org_id

DROP POLICY IF EXISTS "doc_links_insert" ON public.doc_links;
CREATE POLICY "doc_links_insert" ON public.doc_links
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "doc_links_update" ON public.doc_links;
CREATE POLICY "doc_links_update" ON public.doc_links
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "doc_links_delete" ON public.doc_links;
CREATE POLICY "doc_links_delete" ON public.doc_links
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Agenda Briefs ────────────────────────────────────────────
-- FK: agenda_id → agenda_items → meetings

DROP POLICY IF EXISTS "agenda_briefs_insert" ON public.agenda_briefs;
CREATE POLICY "agenda_briefs_insert" ON public.agenda_briefs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_briefs_update" ON public.agenda_briefs;
CREATE POLICY "agenda_briefs_update" ON public.agenda_briefs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_briefs_delete" ON public.agenda_briefs;
CREATE POLICY "agenda_briefs_delete" ON public.agenda_briefs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Board Work Plans ─────────────────────────────────────────
-- Колонка: organization_id

DROP POLICY IF EXISTS "work_plans_insert" ON public.board_work_plans;
CREATE POLICY "work_plans_insert" ON public.board_work_plans
  FOR INSERT WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "work_plans_update" ON public.board_work_plans;
CREATE POLICY "work_plans_update" ON public.board_work_plans
  FOR UPDATE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "work_plans_delete" ON public.board_work_plans;
CREATE POLICY "work_plans_delete" ON public.board_work_plans
  FOR DELETE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- Board plan meetings (FK: plan_id → board_work_plans)
DROP POLICY IF EXISTS "wp_meetings_insert" ON public.board_plan_meetings;
CREATE POLICY "wp_meetings_insert" ON public.board_plan_meetings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_work_plans wp
      WHERE wp.id = plan_id
        AND wp.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_meetings_update" ON public.board_plan_meetings;
CREATE POLICY "wp_meetings_update" ON public.board_plan_meetings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans wp
      WHERE wp.id = plan_id
        AND wp.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_meetings_delete" ON public.board_plan_meetings;
CREATE POLICY "wp_meetings_delete" ON public.board_plan_meetings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans wp
      WHERE wp.id = plan_id
        AND wp.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- Board plan agenda items (FK: plan_meeting_id → board_plan_meetings)
DROP POLICY IF EXISTS "wp_agenda_insert" ON public.board_plan_agenda_items;
CREATE POLICY "wp_agenda_insert" ON public.board_plan_agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings wm
      JOIN public.board_work_plans wp ON wp.id = wm.plan_id
      WHERE wm.id = plan_meeting_id
        AND wp.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_agenda_update" ON public.board_plan_agenda_items;
CREATE POLICY "wp_agenda_update" ON public.board_plan_agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings wm
      JOIN public.board_work_plans wp ON wp.id = wm.plan_id
      WHERE wm.id = plan_meeting_id
        AND wp.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_agenda_delete" ON public.board_plan_agenda_items;
CREATE POLICY "wp_agenda_delete" ON public.board_plan_agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings wm
      JOIN public.board_work_plans wp ON wp.id = wm.plan_id
      WHERE wm.id = plan_meeting_id
        AND wp.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Обновить кэш PostgREST ──────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 045_document_language.sql
-- ============================================================
-- ============================================================
-- Migration 045: Добавить поле language в таблицу documents
-- Для раздельной загрузки материалов по языкам (ru / uz / en)
-- ============================================================

-- 1. Добавляем колонку language (nullable для обратной совместимости)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS language text;

-- 2. Индекс для быстрого поиска по agenda_item_id + language
CREATE INDEX IF NOT EXISTS idx_documents_agenda_lang
  ON public.documents(agenda_item_id, language);

-- 3. Исправить RLS: разрешить corp_secretary загружать документы
DROP POLICY IF EXISTS "documents_insert" ON public.documents;
CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- 4. Добавить флаг materials_ready в meetings
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS materials_ready boolean NOT NULL DEFAULT false;

-- 5. Обновить кэш PostgREST
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 046_message_soft_delete.sql
-- ============================================================
-- ============================================================
-- Board Platform — Soft delete for chat messages
-- Запускать в Supabase SQL Editor
-- ============================================================

-- Добавляем is_deleted в личные сообщения
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

-- Добавляем is_deleted в сообщения групп
ALTER TABLE public.chat_group_messages
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

-- ============================================================
-- RLS: Отправитель может пометить своё сообщение как удалённое
-- (отдельная политика от messages_update_read, они ORятся)
-- ============================================================

-- Личные сообщения: отправитель может обновить is_deleted
DROP POLICY IF EXISTS "messages_update_deleted" ON public.messages;
CREATE POLICY "messages_update_deleted" ON public.messages
  FOR UPDATE
  USING (sender_id = public.get_my_profile_id())
  WITH CHECK (is_deleted = true);

-- Групповые сообщения: отправитель может обновить is_deleted
DROP POLICY IF EXISTS "group_messages_update_deleted" ON public.chat_group_messages;
CREATE POLICY "group_messages_update_deleted" ON public.chat_group_messages
  FOR UPDATE
  USING (sender_id = public.get_my_profile_id())
  WITH CHECK (is_deleted = true);


-- ============================================================
-- 046_audit_logs.sql
-- ============================================================
-- ============================================================
-- Migration 046: Журнал действий пользователей (Audit Log)
-- Append-only таблица для логирования всех действий в системе
-- Идемпотентная: безопасно запускать повторно
-- ============================================================

-- ── 0. Очистка: удаляем триггеры от предыдущей попытки (если остались) ──

DROP TRIGGER IF EXISTS trg_audit_meetings ON public.meetings;
DROP TRIGGER IF EXISTS trg_audit_agenda_items ON public.agenda_items;
DROP TRIGGER IF EXISTS trg_audit_documents ON public.documents;
DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
DROP TRIGGER IF EXISTS trg_audit_tasks ON public.board_tasks;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='votes') THEN
    DROP TRIGGER IF EXISTS trg_audit_votes ON public.votes;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='votings') THEN
    DROP TRIGGER IF EXISTS trg_audit_votings ON public.votings;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='board_work_plans') THEN
    DROP TRIGGER IF EXISTS trg_audit_work_plans ON public.board_work_plans;
  END IF;
END $$;

-- Удаляем функции от предыдущей попытки
DROP FUNCTION IF EXISTS public.audit_meeting_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_agenda_item_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_vote_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_document_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_profile_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_voting_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_work_plan_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_task_changes() CASCADE;
DROP FUNCTION IF EXISTS public.log_audit_event(text,text,text,text,text,uuid,uuid,text,text,jsonb,text) CASCADE;

-- ── 1. Создаём таблицу audit_logs ──

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Кто выполнил действие
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name       text,
  user_email      text,
  user_role       text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,

  -- Что произошло
  action_type     text NOT NULL,
  action_label    text,

  -- Над чем произошло
  entity_type     text,
  entity_id       text,
  entity_title    text,

  -- Связи (опциональные)
  meeting_id      uuid,
  agenda_item_id  uuid,
  file_id         text,
  file_language   text,

  -- Дополнительные данные
  metadata        jsonb DEFAULT '{}'::jsonb,
  ip_address      text,
  user_agent      text,
  status          text NOT NULL DEFAULT 'success'
);

-- ── 2. Индексы ──

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON public.audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_meeting_id  ON public.audit_logs(meeting_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id      ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status      ON public.audit_logs(status);

-- ── 3. RLS ──

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'corp_secretary')
  );

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── 4. Функция-хелпер для логирования (SECURITY DEFINER) ──

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action_type text,
  p_action_label text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_entity_title text DEFAULT NULL,
  p_meeting_id uuid DEFAULT NULL,
  p_agenda_item_id uuid DEFAULT NULL,
  p_file_id text DEFAULT NULL,
  p_file_language text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_status text DEFAULT 'success'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _user_id uuid;
  _user_name text;
  _user_email text;
  _user_role text;
  _org_id uuid;
BEGIN
  _user_id := auth.uid();

  SELECT p.full_name, p.email, p.role::text, p.organization_id
  INTO _user_name, _user_email, _user_role, _org_id
  FROM public.profiles p
  WHERE p.id = _user_id
  LIMIT 1;

  INSERT INTO public.audit_logs (
    user_id, user_name, user_email, user_role, organization_id,
    action_type, action_label,
    entity_type, entity_id, entity_title,
    meeting_id, agenda_item_id, file_id, file_language,
    metadata, status
  ) VALUES (
    _user_id, _user_name, _user_email, _user_role, _org_id,
    p_action_type, p_action_label,
    p_entity_type, p_entity_id, p_entity_title,
    p_meeting_id, p_agenda_item_id, p_file_id, p_file_language,
    p_metadata, p_status
  );
END;
$$;

-- ── 5. Триггер: заседания ──

CREATE OR REPLACE FUNCTION public.audit_meeting_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _title text; _meta jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _title := coalesce(NEW.title, NEW.title_ru, NEW.title_en, NEW.title_uz);
    PERFORM public.log_audit_event('meeting_create','Создание заседания','meeting',NEW.id::text,_title,NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _title := coalesce(NEW.title, NEW.title_ru, NEW.title_en, NEW.title_uz);
    _meta := jsonb_build_object('old_status',OLD.status,'new_status',NEW.status);
    PERFORM public.log_audit_event('meeting_update','Редактирование заседания','meeting',NEW.id::text,_title,NEW.id,NULL,NULL,NULL,_meta);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _title := coalesce(OLD.title, OLD.title_ru, OLD.title_en, OLD.title_uz);
    PERFORM public.log_audit_event('meeting_delete','Удаление заседания','meeting',OLD.id::text,_title,OLD.id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_meetings
  AFTER INSERT OR UPDATE OR DELETE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.audit_meeting_changes();

-- ── 6. Триггер: вопросы повестки ──

CREATE OR REPLACE FUNCTION public.audit_agenda_item_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _title text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _title := coalesce(NEW.title, NEW.title_ru, NEW.title_en, NEW.title_uz);
    PERFORM public.log_audit_event('agenda_item_create','Создание вопроса повестки','agenda_item',NEW.id::text,_title,NEW.meeting_id,NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _title := coalesce(NEW.title, NEW.title_ru, NEW.title_en, NEW.title_uz);
    PERFORM public.log_audit_event('agenda_item_update','Редактирование вопроса повестки','agenda_item',NEW.id::text,_title,NEW.meeting_id,NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _title := coalesce(OLD.title, OLD.title_ru, OLD.title_en, OLD.title_uz);
    PERFORM public.log_audit_event('agenda_item_delete','Удаление вопроса повестки','agenda_item',OLD.id::text,_title,OLD.meeting_id,OLD.id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_agenda_items
  AFTER INSERT OR UPDATE OR DELETE ON public.agenda_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_agenda_item_changes();

-- ── 7. Триггер: голоса (votes) ──

CREATE OR REPLACE FUNCTION public.audit_vote_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _voting_title text; _agenda_id uuid; _meta jsonb;
BEGIN
  SELECT v.title, v.agenda_item_id
  INTO _voting_title, _agenda_id
  FROM public.votings v WHERE v.id = NEW.voting_id;

  IF TG_OP = 'INSERT' THEN
    _meta := jsonb_build_object('vote_value', NEW.choice);
    PERFORM public.log_audit_event('vote_cast','Голосование','vote',NEW.id::text,_voting_title,NULL,_agenda_id,NULL,NULL,_meta);
  ELSIF TG_OP = 'UPDATE' AND OLD.choice IS DISTINCT FROM NEW.choice THEN
    _meta := jsonb_build_object('old_vote',OLD.choice,'new_vote',NEW.choice);
    PERFORM public.log_audit_event('vote_change','Изменение голоса','vote',NEW.id::text,_voting_title,NULL,_agenda_id,NULL,NULL,_meta);
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='votes') THEN
    EXECUTE 'CREATE TRIGGER trg_audit_votes AFTER INSERT OR UPDATE ON public.votes FOR EACH ROW EXECUTE FUNCTION public.audit_vote_changes()';
  END IF;
END $$;

-- ── 8. Триггер: документы ──

CREATE OR REPLACE FUNCTION public.audit_document_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _meta jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _meta := jsonb_build_object('file_name',NEW.file_name,'language',NEW.language);
    PERFORM public.log_audit_event('file_upload','Загрузка файла','file',NEW.id::text,NEW.file_name,NEW.meeting_id,NEW.agenda_item_id,NEW.id::text,NEW.language,_meta);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _meta := jsonb_build_object('file_name',OLD.file_name,'language',OLD.language);
    PERFORM public.log_audit_event('file_delete','Удаление файла','file',OLD.id::text,OLD.file_name,OLD.meeting_id,OLD.agenda_item_id,OLD.id::text,OLD.language,_meta);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_documents
  AFTER INSERT OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_document_changes();

-- ── 9. Триггер: изменение ролей ──

CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _meta jsonb;
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    _meta := jsonb_build_object('old_role',OLD.role::text,'new_role',NEW.role::text);
    PERFORM public.log_audit_event('user_role_change','Изменение роли пользователя','user',NEW.id::text,NEW.full_name,NULL,NULL,NULL,NULL,_meta);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_profiles
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profile_changes();

-- ── 10. Триггер: голосования (votings) ──

CREATE OR REPLACE FUNCTION public.audit_voting_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _meta jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event('voting_create','Создание голосования','voting',NEW.id::text,NEW.title,NULL,NEW.agenda_item_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    _meta := jsonb_build_object('old_status',OLD.status,'new_status',NEW.status);
    PERFORM public.log_audit_event('voting_status_change','Изменение статуса голосования','voting',NEW.id::text,NEW.title,NULL,NEW.agenda_item_id,NULL,NULL,_meta);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='votings') THEN
    EXECUTE 'CREATE TRIGGER trg_audit_votings AFTER INSERT OR UPDATE ON public.votings FOR EACH ROW EXECUTE FUNCTION public.audit_voting_changes()';
  END IF;
END $$;

-- ── 11. Триггер: план работ ──

CREATE OR REPLACE FUNCTION public.audit_work_plan_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _title text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _title := coalesce(NEW.title, NEW.title_ru, '');
    PERFORM public.log_audit_event('work_plan_create','Создание записи плана работ','work_plan',NEW.id::text,_title);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _title := coalesce(NEW.title, NEW.title_ru, '');
    PERFORM public.log_audit_event('work_plan_update','Редактирование записи плана работ','work_plan',NEW.id::text,_title);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _title := coalesce(OLD.title, OLD.title_ru, '');
    PERFORM public.log_audit_event('work_plan_delete','Удаление записи плана работ','work_plan',OLD.id::text,_title);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='board_work_plans') THEN
    EXECUTE 'CREATE TRIGGER trg_audit_work_plans AFTER INSERT OR UPDATE OR DELETE ON public.board_work_plans FOR EACH ROW EXECUTE FUNCTION public.audit_work_plan_changes()';
  END IF;
END $$;

-- ── 12. Триггер: поручения ──

CREATE OR REPLACE FUNCTION public.audit_task_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _meta jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event('task_create','Создание поручения','task',NEW.id::text,NEW.title);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _meta := jsonb_build_object('old_status',OLD.status,'new_status',NEW.status);
    PERFORM public.log_audit_event('task_update','Редактирование поручения','task',NEW.id::text,NEW.title,NULL,NULL,NULL,NULL,_meta);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit_event('task_delete','Удаление поручения','task',OLD.id::text,OLD.title);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.board_tasks
  FOR EACH ROW EXECUTE FUNCTION public.audit_task_changes();

-- ── 13. Обновить кэш PostgREST ──
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 047_message_edit.sql
-- ============================================================
-- ============================================================
-- Board Platform — Edit (update body) for own chat messages
-- Запускать в Supabase SQL Editor
-- ============================================================

-- Добавляем is_edited в личные сообщения
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;

-- Добавляем is_edited в сообщения групп
ALTER TABLE public.chat_group_messages
  ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;

-- ============================================================
-- RLS: Отправитель может редактировать своё (не удалённое) сообщение
-- ============================================================

-- Личные сообщения: отправитель может обновить body + is_edited
DROP POLICY IF EXISTS "messages_update_edited" ON public.messages;
CREATE POLICY "messages_update_edited" ON public.messages
  FOR UPDATE
  USING (sender_id = public.get_my_profile_id() AND is_deleted = false)
  WITH CHECK (is_edited = true AND is_deleted = false);

-- Групповые сообщения: отправитель может обновить body + is_edited
DROP POLICY IF EXISTS "group_messages_update_edited" ON public.chat_group_messages;
CREATE POLICY "group_messages_update_edited" ON public.chat_group_messages
  FOR UPDATE
  USING (sender_id = public.get_my_profile_id() AND is_deleted = false)
  WITH CHECK (is_edited = true AND is_deleted = false);


-- ============================================================
-- 048_video_conference.sql
-- ============================================================
-- 048_video_conference.sql
-- Add video conference fields to the meetings table

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS video_conference_url          text,
  ADD COLUMN IF NOT EXISTS video_conference_provider     text,
  ADD COLUMN IF NOT EXISTS video_conference_enabled      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_conference_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS video_conference_started_by   uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS video_conference_title        text,
  ADD COLUMN IF NOT EXISTS video_conference_notes        text;

-- Extend notification_type enum with new value
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'meeting_video_conference_activated';

-- ─── Trigger function: notify all org members when VC is activated ─────────────

CREATE OR REPLACE FUNCTION public.notify_video_conference_activated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  meeting_title text;
  org_member    RECORD;
BEGIN
  -- Only fire when video_conference_enabled transitions false → true
  IF (OLD.video_conference_enabled IS DISTINCT FROM NEW.video_conference_enabled)
     AND NEW.video_conference_enabled = true THEN

    meeting_title := COALESCE(NEW.title_ru, NEW.title, '');

    FOR org_member IN
      SELECT id FROM public.profiles
      WHERE organization_id = NEW.organization_id
    LOOP
      INSERT INTO public.notifications
        (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        org_member.id,
        'meeting_video_conference_activated',
        'Видеоконференция активирована',
        'Для заседания «' || meeting_title || '» активирована видеоконференция. Вы можете подключиться по кнопке в карточке заседания.',
        'ns_meeting',
        NEW.id::text
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_video_conference_activated ON public.meetings;
CREATE TRIGGER on_video_conference_activated
  AFTER UPDATE ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_video_conference_activated();


-- ============================================================
-- 049_notifications_multilingual.sql
-- ============================================================
-- ============================================================
-- 049: Add multilingual fields to notifications
-- Title/body in uz and en, populated from source entity where available.
-- ============================================================

-- 1. Add columns
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS body_uz  text,
  ADD COLUMN IF NOT EXISTS body_en  text;

-- Backfill: existing Russian title/body stay as-is; uz/en remain NULL
-- (frontend will auto-translate them on demand)


-- 2. Update notify_task_assigned — use multilingual task title
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _task       record;
  _assignee_user_id uuid;
BEGIN
  SELECT title, title_uz, title_en
    INTO _task
    FROM public.board_tasks WHERE id = NEW.task_id;

  SELECT user_id INTO _assignee_user_id
    FROM public.profiles WHERE id = NEW.assignee_profile_id;

  IF _assignee_user_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
       related_entity_type, related_entity_id)
    VALUES (
      _assignee_user_id,
      'task_assigned',
      'Новое поручение',
      coalesce(_task.title, 'Поручение'),
      'Yangi topshiriq',
      'New Task',
      coalesce(_task.title_uz, _task.title, 'Topshiriq'),
      coalesce(_task.title_en, _task.title, 'Task'),
      'task',
      NEW.task_id::text
    );
  END IF;

  RETURN NEW;
END;
$$;


-- 3. Update notify_task_status_changed — use multilingual task title + status
CREATE OR REPLACE FUNCTION public.notify_task_status_changed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec            record;
  _task           record;
  _status_label_ru text;
  _status_label_uz text;
  _status_label_en text;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT title, title_uz, title_en
    INTO _task
    FROM public.board_tasks WHERE id = NEW.id;

  _status_label_ru := CASE NEW.status
    WHEN 'open'        THEN 'Открыто'
    WHEN 'in_progress' THEN 'В работе'
    WHEN 'done'        THEN 'Выполнено'
    WHEN 'canceled'    THEN 'Отменено'
    WHEN 'overdue'     THEN 'Просрочено'
    ELSE NEW.status
  END;

  _status_label_uz := CASE NEW.status
    WHEN 'open'        THEN 'Ochiq'
    WHEN 'in_progress' THEN 'Jarayonda'
    WHEN 'done'        THEN 'Bajarildi'
    WHEN 'canceled'    THEN 'Bekor qilindi'
    WHEN 'overdue'     THEN 'Muddati o''tdi'
    ELSE NEW.status
  END;

  _status_label_en := CASE NEW.status
    WHEN 'open'        THEN 'Open'
    WHEN 'in_progress' THEN 'In Progress'
    WHEN 'done'        THEN 'Done'
    WHEN 'canceled'    THEN 'Canceled'
    WHEN 'overdue'     THEN 'Overdue'
    ELSE NEW.status
  END;

  FOR _rec IN
    SELECT p.user_id
    FROM public.board_task_assignees bta
    JOIN public.profiles p ON p.id = bta.assignee_profile_id
    WHERE bta.task_id = NEW.id
  LOOP
    IF _rec.user_id <> auth.uid() THEN
      INSERT INTO public.notifications
        (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
         related_entity_type, related_entity_id)
      VALUES (
        _rec.user_id,
        'task_status_changed',
        'Статус поручения изменён',
        coalesce(_task.title, '') || ' → ' || _status_label_ru,
        'Topshiriq holati o''zgardi',
        'Task status changed',
        coalesce(_task.title_uz, _task.title, '') || ' → ' || _status_label_uz,
        coalesce(_task.title_en, _task.title, '') || ' → ' || _status_label_en,
        'task',
        NEW.id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- 4. Update notify_task_comment
CREATE OR REPLACE FUNCTION public.notify_task_comment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec            record;
  _task           record;
  _author_name    text;
  _author_user_id uuid;
BEGIN
  SELECT title, title_uz, title_en
    INTO _task
    FROM public.board_tasks WHERE id = NEW.task_id;

  SELECT full_name, user_id
    INTO _author_name, _author_user_id
    FROM public.profiles WHERE id = NEW.author_profile_id;

  FOR _rec IN
    SELECT DISTINCT p.user_id
    FROM public.board_task_assignees bta
    JOIN public.profiles p ON p.id = bta.assignee_profile_id
    WHERE bta.task_id = NEW.task_id
  LOOP
    IF _rec.user_id <> _author_user_id THEN
      INSERT INTO public.notifications
        (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
         related_entity_type, related_entity_id)
      VALUES (
        _rec.user_id,
        'task_comment',
        'Новый комментарий',
        coalesce(_author_name, 'Пользователь') || ': ' || left(NEW.body, 100),
        'Yangi izoh',
        'New comment',
        coalesce(_author_name, 'Foydalanuvchi') || ': ' || left(NEW.body, 100),
        coalesce(_author_name, 'User') || ': ' || left(NEW.body, 100),
        'task',
        NEW.task_id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- 5. Update notify_meeting_invitation — use multilingual meeting title
CREATE OR REPLACE FUNCTION public.notify_meeting_invitation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
BEGIN
  IF NEW.status <> 'scheduled' THEN RETURN NEW; END IF;

  FOR _rec IN
    SELECT user_id FROM public.profiles WHERE org_id = NEW.org_id
  LOOP
    IF _rec.user_id <> auth.uid() THEN
      INSERT INTO public.notifications
        (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
         related_entity_type, related_entity_id)
      VALUES (
        _rec.user_id,
        'meeting_invitation',
        'Новое заседание',
        coalesce(NEW.title_ru, NEW.title, 'Заседание'),
        'Yangi majlis',
        'New Meeting',
        coalesce(NEW.title_uz, NEW.title, 'Majlis'),
        coalesce(NEW.title_en, NEW.title, 'Meeting'),
        'meeting',
        NEW.id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- 6. Update notify_video_conference_activated — use multilingual meeting title
CREATE OR REPLACE FUNCTION public.notify_video_conference_activated()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
BEGIN
  -- Only fire when video_conference_enabled goes from false/null → true
  IF NOT (COALESCE(OLD.video_conference_enabled, false) = false
          AND NEW.video_conference_enabled = true) THEN
    RETURN NEW;
  END IF;

  FOR _rec IN
    SELECT user_id FROM public.profiles WHERE org_id = NEW.org_id
  LOOP
    INSERT INTO public.notifications
      (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
       related_entity_type, related_entity_id)
    VALUES (
      _rec.user_id,
      'meeting_video_conference_activated',
      'Видеоконференция активирована',
      'Для заседания «' || coalesce(NEW.title_ru, NEW.title, '') || '» активирована видеоконференция. Вы можете подключиться по кнопке в карточке заседания.',
      'Видеоконференция фаоллаштирилди',
      'Video conference activated',
      '«' || coalesce(NEW.title_uz, NEW.title, '') || '» мажлиси учун видеоконференция фаоллаштирилди. Мажлис карточкасидаги тугма орқали уланишингиз мумкин.',
      'Video conference for "' || coalesce(NEW.title_en, NEW.title, '') || '" has been activated. You can join using the button on the meeting card.',
      'ns_meeting',
      NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 050_organization_multilingual.sql
-- ============================================================
-- ============================================================
-- 050: Add multilingual name fields to organizations
-- name_uz (Uzbek Cyrillic), name_en (English)
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS name_uz text,
  ADD COLUMN IF NOT EXISTS name_en text;

-- Populate for the existing organization
UPDATE public.organizations
SET
  name_uz = '«Ҳудудий электр тармоқлари» АЖ',
  name_en = 'JSC "Regional Electrical Power Networks"'
WHERE name ILIKE '%электр%' OR name ILIKE '%электрические%';


-- ============================================================
-- 051_agenda_item_comments.sql
-- ============================================================
-- ============================================================
-- Migration 051: Обсуждение вопросов повестки (Agenda Item Comments)
-- Таблица для комментариев к вопросам повестки заседаний НС
-- Идемпотентная: безопасно запускать повторно
-- ============================================================

-- ── 0. Extend notification_type enum ──
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'agenda_item_comment';

-- ── 1. Таблица agenda_item_comments ──

CREATE TABLE IF NOT EXISTS public.agenda_item_comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  meeting_id        uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  agenda_item_id    uuid NOT NULL REFERENCES public.agenda_items(id) ON DELETE CASCADE,

  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name         text NOT NULL DEFAULT '',
  user_role         text NOT NULL DEFAULT '',

  parent_comment_id uuid REFERENCES public.agenda_item_comments(id) ON DELETE CASCADE,

  content           text NOT NULL DEFAULT '',

  is_deleted        boolean NOT NULL DEFAULT false
);

-- ── 2. Индексы ──

CREATE INDEX IF NOT EXISTS idx_aic_agenda_item_id    ON public.agenda_item_comments(agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_aic_meeting_id        ON public.agenda_item_comments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_aic_parent_comment_id ON public.agenda_item_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_aic_created_at        ON public.agenda_item_comments(created_at);

-- ── 3. RLS ──

ALTER TABLE public.agenda_item_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: все участники одной организации (те же, кто видят заседания)
DROP POLICY IF EXISTS "aic_select" ON public.agenda_item_comments;
CREATE POLICY "aic_select" ON public.agenda_item_comments
  FOR SELECT TO authenticated
  USING (
    meeting_id IN (
      SELECT m.id FROM public.meetings m
      WHERE m.organization_id = public.get_my_org_id()
    )
  );

-- INSERT: только board_member, corp_secretary, admin, chairman
DROP POLICY IF EXISTS "aic_insert" ON public.agenda_item_comments;
CREATE POLICY "aic_insert" ON public.agenda_item_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.get_my_role() IN ('admin', 'corp_secretary', 'board_member', 'chairman')
  );

-- UPDATE: только автор или admin
DROP POLICY IF EXISTS "aic_update" ON public.agenda_item_comments;
CREATE POLICY "aic_update" ON public.agenda_item_comments
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_my_role() = 'admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.get_my_role() = 'admin'
  );

-- DELETE: только автор или admin
DROP POLICY IF EXISTS "aic_delete" ON public.agenda_item_comments;
CREATE POLICY "aic_delete" ON public.agenda_item_comments
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_my_role() = 'admin'
  );

-- ── 4. Триггер: уведомления при добавлении комментария ──

CREATE OR REPLACE FUNCTION public.notify_agenda_item_comment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _meeting     record;
  _agenda      record;
  _author_name text;
  _recipient   record;
  _title_ru    text;
  _title_en    text;
  _title_uz    text;
  _body_ru     text;
  _body_en     text;
  _body_uz     text;
  _parent_author_id uuid;
BEGIN
  -- Получаем данные заседания
  SELECT id, title, title_ru, title_en, title_uz, organization_id
    INTO _meeting
    FROM public.meetings WHERE id = NEW.meeting_id;

  -- Получаем данные вопроса повестки
  SELECT id, title, title_ru, title_en, title_uz
    INTO _agenda
    FROM public.agenda_items WHERE id = NEW.agenda_item_id;

  _author_name := NEW.user_name;

  _title_ru := 'Новый комментарий';
  _title_en := 'New comment';
  _title_uz := 'Янги изоҳ';

  _body_ru := coalesce(_author_name, 'Пользователь') || ' оставил комментарий к вопросу «' || coalesce(_agenda.title_ru, _agenda.title, '') || '»';
  _body_en := coalesce(_author_name, 'User') || ' commented on agenda item "' || coalesce(_agenda.title_en, _agenda.title, '') || '"';
  _body_uz := coalesce(_author_name, 'Фойдаланувчи') || ' «' || coalesce(_agenda.title_uz, _agenda.title, '') || '» саволига изоҳ қолдирди';

  -- Если это ответ — уведомляем автора родительского комментария
  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT user_id INTO _parent_author_id
      FROM public.agenda_item_comments
      WHERE id = NEW.parent_comment_id;

    IF _parent_author_id IS NOT NULL AND _parent_author_id != NEW.user_id THEN
      _title_ru := 'Ответ на ваш комментарий';
      _title_en := 'Reply to your comment';
      _title_uz := 'Изоҳингизга жавоб';

      INSERT INTO public.notifications
        (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
         related_entity_type, related_entity_id)
      VALUES (
        _parent_author_id,
        'agenda_item_comment',
        _title_ru, _body_ru, _title_uz, _title_en, _body_uz, _body_en,
        'ns_meeting', NEW.meeting_id::text
      );
    END IF;
  ELSE
    -- Уведомляем всех участников организации (кроме автора) с ролями board_member, admin, corp_secretary, chairman
    FOR _recipient IN
      SELECT p.id AS profile_id
        FROM public.profiles p
        WHERE p.organization_id = _meeting.organization_id
          AND p.id != NEW.user_id
          AND p.role IN ('admin', 'corp_secretary', 'board_member', 'chairman')
    LOOP
      INSERT INTO public.notifications
        (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
         related_entity_type, related_entity_id)
      VALUES (
        _recipient.profile_id,
        'agenda_item_comment',
        _title_ru, _body_ru, _title_uz, _title_en, _body_uz, _body_en,
        'ns_meeting', NEW.meeting_id::text
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_agenda_item_comment ON public.agenda_item_comments;
CREATE TRIGGER trg_notify_agenda_item_comment
  AFTER INSERT ON public.agenda_item_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_agenda_item_comment();

-- ── 5. Триггер: обновление updated_at ──

CREATE OR REPLACE FUNCTION public.aic_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aic_updated_at ON public.agenda_item_comments;
CREATE TRIGGER trg_aic_updated_at
  BEFORE UPDATE ON public.agenda_item_comments
  FOR EACH ROW EXECUTE FUNCTION public.aic_set_updated_at();

-- ── 6. Обновить кэш PostgREST ──
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 052_education_structured.sql
-- ============================================================
-- ============================================================
-- Migration 052: Structured Education Entries
-- Структурированные записи об образовании
-- ============================================================

-- Добавить JSONB-колонку для структурированного образования
-- Формат: массив объектов [{degree, specialty, institution, year_start, year_end}]
-- Каждое поле на 3 языках: _ru, _en, _uz
ALTER TABLE public.profile_details
  ADD COLUMN IF NOT EXISTS education_entries jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profile_details.education_entries IS
  'Structured education records: [{degree_ru, degree_en, degree_uz, specialty_ru, specialty_en, specialty_uz, institution_ru, institution_en, institution_uz, year_start, year_end}]';

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 053_documents_doc_type.sql
-- ============================================================
-- ============================================================
-- 053: Add doc_type to documents
-- Distinguishes: 'protocol', 'agenda', NULL (material)
-- ============================================================

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS doc_type text;

-- Mark existing meeting-level docs (no agenda_item_id) as protocol
UPDATE public.documents
SET doc_type = 'protocol'
WHERE agenda_item_id IS NULL AND doc_type IS NULL;


-- ============================================================
-- 053_fix_vc_trigger.sql
-- ============================================================
-- ============================================================
-- Migration 053: Fix video conference activation trigger
-- Исправление триггера уведомлений при активации видеоконференции
-- Проблема: триггер ссылался на profiles.user_id и profiles.org_id,
-- но в реальной БД это profiles.id и profiles.organization_id
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_video_conference_activated()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
BEGIN
  -- Only fire when video_conference_enabled goes from false/null → true
  IF NOT (COALESCE(OLD.video_conference_enabled, false) = false
          AND NEW.video_conference_enabled = true) THEN
    RETURN NEW;
  END IF;

  -- Get all profiles in the same organization via the meeting's org
  FOR _rec IN
    SELECT p.id AS recipient
    FROM public.profiles p
    WHERE p.organization_id = NEW.organization_id
  LOOP
    INSERT INTO public.notifications
      (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
       related_entity_type, related_entity_id)
    VALUES (
      _rec.recipient,
      'meeting_video_conference_activated',
      'Видеоконференция активирована',
      'Для заседания «' || coalesce(NEW.title_ru, NEW.title, '') || '» активирована видеоконференция. Вы можете подключиться по кнопке в карточке заседания.',
      'Видеоконференция фаоллаштирилди',
      'Video conference activated',
      '«' || coalesce(NEW.title_uz, NEW.title, '') || '» мажлиси учун видеоконференция фаоллаштирилди. Мажлис карточкасидаги тугма орқали уланишингиз мумкин.',
      'Video conference for "' || coalesce(NEW.title_en, NEW.title, '') || '" has been activated. You can join using the button on the meeting card.',
      'ns_meeting',
      NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 054_fix_localization.sql
-- ============================================================
-- ============================================================
-- Migration 054: Fix localization issues
-- 1. Fix notify_meeting_invitation trigger (wrong column names in 049)
-- 2. Add EN/UZ translations for existing meetings
-- 3. Add EN/UZ translations for existing agenda items
-- 4. Patch existing notifications missing title_en/body_en
-- ============================================================

-- ── 1. Fix notify_meeting_invitation (was using user_id/org_id — wrong) ───────

CREATE OR REPLACE FUNCTION public.notify_meeting_invitation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
BEGIN
  IF NEW.status <> 'scheduled' THEN RETURN NEW; END IF;

  FOR _rec IN
    SELECT p.id AS recipient
    FROM public.profiles p
    WHERE p.organization_id = NEW.organization_id
  LOOP
    IF _rec.recipient <> auth.uid() THEN
      INSERT INTO public.notifications
        (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
         related_entity_type, related_entity_id)
      VALUES (
        _rec.recipient,
        'meeting_invitation',
        coalesce(NEW.title_ru, NEW.title, 'Новое заседание'),
        coalesce(NEW.title_ru, NEW.title, 'Заседание'),
        'Янги йиғилиш',
        'New Meeting',
        coalesce(NEW.title_uz, NEW.title, 'Мажлис'),
        coalesce(NEW.title_en, NEW.title, 'Meeting'),
        'ns_meeting',
        NEW.id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ── 2. Update meetings — add EN and UZ translations ────────────────────────────

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on Business Plan Approval for 2026 (New Edition)',
  title_uz = '2026 йилга бизнес-режани янги таҳрирда тасдиқлаш бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%утверждению БП на 2026%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on Energy Audit',
  title_uz = 'Энергетик аудит бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%энергоаудит%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on Q1 2026 Results',
  title_uz = '2026 йилнинг 1-чорак якунлари бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%итогам 1 квартала 2026%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on Annual General Shareholders Meeting Matters',
  title_uz = 'Йиллик умумий акциядорлар йиғилиши масалалари бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%годового Общего собрания акционеров%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on 2025 Annual Results',
  title_uz = '2025 йил якунлари бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%итогам 2025 года%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on Resolution Execution and Annual Control',
  title_uz = 'Қарорларни бажариш ва йиллик назорат бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%исполнению решений и годовому контролю%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on Chairman Election, Q2 Procurement Plan Approval and Committee Formation',
  title_uz = 'КК раисини сайлаш, 2-чорак харид режасини тасдиқлаш ва қўмиталарни ташкил этиш бўйича йиғилиш',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%выбору председателя%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on External Auditor Approval',
  title_uz = 'Ташқи аудиторни тасдиқлаш бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%утверждению внешнего аудитора%'
  AND (title_en IS NULL OR title_en = '');

-- ── 3. Update agenda_items — add EN and UZ translations ───────────────────────

UPDATE public.agenda_items SET
  title_en = 'On Approval of the Business Plan of JSC "Regional Electrical Power Networks" for 2026 (New Edition)',
  title_uz = 'АЖ "Минтақавий электр тармоқлари"нинг 2026 йилга мўлжалланган бизнес-режасини янги таҳрирда тасдиқлаш тўғрисида',
  presenter_en = 'M. Muydinov — Head of Economic Analysis Department',
  presenter_uz = 'М.Муйдинов — иқтисодий таҳлил бошқармаси бошлиғи',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%утверждении Бизнес-плана%2026%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.agenda_items SET
  title_en = 'On Review of the Report on Cost Reduction Measures of JSC "Regional Electrical Power Networks" for Q1 2026',
  title_uz = 'АЖ "Минтақавий электр тармоқлари"нинг 2026 йил 1-чорак якунлари бўйича таннарх камайтириш чора-тадбирлари ижросини кўриб чиқиш тўғрисида',
  presenter_en = 'M. Muydinov — Head of Economic Analysis Department',
  presenter_uz = 'М.Муйдинов — иқтисодий таҳлил бошқармаси бошлиғи',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%снижению себестоимости%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.agenda_items SET
  title_en = 'On Conducting an Energy Audit at JSC "Regional Electrical Power Networks" and Establishing a Systematic Approach to Energy and Gas Conservation',
  title_uz = 'АЖ "Минтақавий электр тармоқлари"да энергетик аудит ўтказиш ва электр энергияси ва газни тежашга тизимли ёндашувни йўлга қўйиш масаласини кўриб чиқиш',
  presenter_en = 'B. Tadzhibaev — Company Energy Manager',
  presenter_uz = 'Б.Тажибаев — компания энергетик менежери',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%энергетического аудита%'
  AND (title_en IS NULL OR title_en = '');

-- ── 4. Patch existing notifications missing title_en ──────────────────────────

-- meeting_invitation notifications: title should be "New Meeting"
UPDATE public.notifications SET
  title_en = 'New Meeting',
  title_uz = 'Янги йиғилиш'
WHERE type = 'meeting_invitation'
  AND (title_en IS NULL OR title_en = '');

-- meeting_video_conference_activated: title should be "Video conference activated"
UPDATE public.notifications SET
  title_en = 'Video conference activated',
  title_uz = 'Видеоконференция фаоллаштирилди'
WHERE type = 'meeting_video_conference_activated'
  AND (title_en IS NULL OR title_en = '');

-- task_assigned notifications
UPDATE public.notifications SET
  title_en = 'New Task',
  title_uz = 'Янги топшириқ'
WHERE type = 'task_assigned'
  AND (title_en IS NULL OR title_en = '');

-- task_comment notifications
UPDATE public.notifications SET
  title_en = 'New Comment',
  title_uz = 'Янги изоҳ'
WHERE type = 'task_comment'
  AND (title_en IS NULL OR title_en = '');

-- voting_reminder notifications
UPDATE public.notifications SET
  title_en = 'Voting Reminder',
  title_uz = 'Овоз бериш эслатмаси'
WHERE type = 'voting_reminder'
  AND (title_en IS NULL OR title_en = '');


-- ============================================================
-- 055_committees.sql
-- ============================================================
-- ============================================================
-- 055: Committees module
-- 4 committees, members, meetings, agenda items, votings, votes
-- ============================================================

-- 1. Committees
CREATE TABLE IF NOT EXISTS public.committees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id),
  name        TEXT NOT NULL,
  name_uz     TEXT,
  name_en     TEXT,
  type        TEXT NOT NULL CHECK (type IN ('audit','strategy','nominations','anticorruption')),
  description TEXT,
  created_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.committees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "committees_select" ON public.committees FOR SELECT TO authenticated USING (
  org_id = public.get_my_org_id()
);
CREATE POLICY "committees_insert" ON public.committees FOR INSERT TO authenticated WITH CHECK (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "committees_update" ON public.committees FOR UPDATE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "committees_delete" ON public.committees FOR DELETE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);

-- 2. Committee Members
CREATE TABLE IF NOT EXISTS public.committee_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id UUID NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('chair','member')),
  added_by     UUID REFERENCES public.profiles(id),
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(committee_id, profile_id)
);

ALTER TABLE public.committee_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmembers_select" ON public.committee_members FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.committees c WHERE c.id = committee_id AND c.org_id = public.get_my_org_id())
);
CREATE POLICY "cmembers_insert" ON public.committee_members FOR INSERT TO authenticated WITH CHECK (
  public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cmembers_delete" ON public.committee_members FOR DELETE TO authenticated USING (
  public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cmembers_update" ON public.committee_members FOR UPDATE TO authenticated USING (
  public.get_my_role() IN ('admin','corp_secretary')
);

-- 3. Committee Meetings
CREATE TABLE IF NOT EXISTS public.committee_meetings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id UUID NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL REFERENCES public.organizations(id),
  title        TEXT NOT NULL,
  title_uz     TEXT,
  title_en     TEXT,
  start_at     TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed')),
  location     TEXT,
  notes        TEXT,
  created_by   UUID REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.committee_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmeetings_select" ON public.committee_meetings FOR SELECT TO authenticated USING (
  org_id = public.get_my_org_id()
);
CREATE POLICY "cmeetings_insert" ON public.committee_meetings FOR INSERT TO authenticated WITH CHECK (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cmeetings_update" ON public.committee_meetings FOR UPDATE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cmeetings_delete" ON public.committee_meetings FOR DELETE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);

-- 4. Committee Agenda Items
CREATE TABLE IF NOT EXISTS public.committee_agenda_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   UUID NOT NULL REFERENCES public.committee_meetings(id) ON DELETE CASCADE,
  committee_id UUID NOT NULL REFERENCES public.committees(id),
  org_id       UUID NOT NULL REFERENCES public.organizations(id),
  title        TEXT NOT NULL,
  title_uz     TEXT,
  title_en     TEXT,
  presenter    TEXT,
  order_index  INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.committee_agenda_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cagenda_select" ON public.committee_agenda_items FOR SELECT TO authenticated USING (
  org_id = public.get_my_org_id()
);
CREATE POLICY "cagenda_insert" ON public.committee_agenda_items FOR INSERT TO authenticated WITH CHECK (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cagenda_update" ON public.committee_agenda_items FOR UPDATE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cagenda_delete" ON public.committee_agenda_items FOR DELETE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);

-- 5. Committee Votings
CREATE TABLE IF NOT EXISTS public.committee_votings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id UUID NOT NULL REFERENCES public.committee_agenda_items(id) ON DELETE CASCADE,
  committee_id   UUID NOT NULL REFERENCES public.committees(id),
  org_id         UUID NOT NULL REFERENCES public.organizations(id),
  title          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  total_members  INT NOT NULL DEFAULT 5,
  created_by     UUID REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at      TIMESTAMPTZ
);

ALTER TABLE public.committee_votings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cvotings_select" ON public.committee_votings FOR SELECT TO authenticated USING (
  org_id = public.get_my_org_id()
);
CREATE POLICY "cvotings_insert" ON public.committee_votings FOR INSERT TO authenticated WITH CHECK (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cvotings_update" ON public.committee_votings FOR UPDATE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);

-- 6. Committee Votes
CREATE TABLE IF NOT EXISTS public.committee_votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voting_id  UUID NOT NULL REFERENCES public.committee_votings(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES public.organizations(id),
  voter_id   UUID NOT NULL REFERENCES public.profiles(id),
  choice     TEXT NOT NULL CHECK (choice IN ('for','against','abstain')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(voting_id, voter_id)
);

ALTER TABLE public.committee_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cvotes_select" ON public.committee_votes FOR SELECT TO authenticated USING (
  org_id = public.get_my_org_id()
);
CREATE POLICY "cvotes_insert" ON public.committee_votes FOR INSERT TO authenticated WITH CHECK (
  voter_id = auth.uid()
  AND org_id = public.get_my_org_id()
  AND EXISTS (
    SELECT 1 FROM public.committee_votings cv WHERE cv.id = voting_id AND cv.status = 'open'
  )
);
CREATE POLICY "cvotes_update" ON public.committee_votes FOR UPDATE TO authenticated USING (
  voter_id = auth.uid()
);

-- 7. Documents: add committee_meeting_id column
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS committee_meeting_id UUID REFERENCES public.committee_meetings(id) ON DELETE CASCADE;

-- 8. Seed: insert the 4 committees for the existing org
INSERT INTO public.committees (org_id, name, name_uz, name_en, type, description)
SELECT
  id,
  'Комитет по аудиту',
  'Аудит қўмитаси',
  'Audit Committee',
  'audit',
  'Надзор за финансовой отчётностью, внутренним контролем и аудитом'
FROM public.organizations LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.committees (org_id, name, name_uz, name_en, type, description)
SELECT
  id,
  'Комитет по стратегии и инвестициям',
  'Стратегия ва инвестициялар қўмитаси',
  'Strategy & Investment Committee',
  'strategy',
  'Стратегическое планирование и инвестиционная политика'
FROM public.organizations LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.committees (org_id, name, name_uz, name_en, type, description)
SELECT
  id,
  'Комитет по назначениям и вознаграждениям',
  'Тайинлашлар ва мукофотлар қўмитаси',
  'Nominations & Remuneration Committee',
  'nominations',
  'Кадровая политика, назначения и система вознаграждений'
FROM public.organizations LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.committees (org_id, name, name_uz, name_en, type, description)
SELECT
  id,
  'Комитет по антикоррупции и этике',
  'Коррупцияга қарши ва этика қўмитаси',
  'Anti-Corruption & Ethics Committee',
  'anticorruption',
  'Соблюдение этических норм, антикоррупционная политика'
FROM public.organizations LIMIT 1
ON CONFLICT DO NOTHING;


-- ============================================================
-- 056_committees_multilingual_desc.sql
-- ============================================================
-- ============================================================
-- 056: Add multilingual description fields to committees
-- ============================================================

ALTER TABLE public.committees
  ADD COLUMN IF NOT EXISTS description_en TEXT,
  ADD COLUMN IF NOT EXISTS description_uz TEXT;

-- Update English and Uzbek descriptions for the 4 seeded committees
UPDATE public.committees SET
  description_en = 'Oversight of financial reporting, internal controls and audit',
  description_uz = 'Молиявий ҳисоботлар, ички назорат ва аудит устидан назорат'
WHERE type = 'audit';

UPDATE public.committees SET
  description_en = 'Strategic planning and investment policy',
  description_uz = 'Стратегик режалаштириш ва инвестиция сиёсати'
WHERE type = 'strategy';

UPDATE public.committees SET
  description_en = 'HR policy, appointments and remuneration system',
  description_uz = 'Кадрлар сиёсати, тайинлашлар ва мукофотлаш тизими'
WHERE type = 'nominations';

UPDATE public.committees SET
  description_en = 'Compliance with ethical standards and anti-corruption policy',
  description_uz = 'Этика нормаларига риоя қилиш, коррупцияга қарши сиёсат'
WHERE type = 'anticorruption';


-- ============================================================
-- 057_committee_agenda_comments.sql
-- ============================================================
-- ============================================================
-- 057: Committee agenda item comments (discussion)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.committee_agenda_comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  meeting_id        UUID NOT NULL REFERENCES public.committee_meetings(id) ON DELETE CASCADE,
  agenda_item_id    UUID NOT NULL REFERENCES public.committee_agenda_items(id) ON DELETE CASCADE,
  org_id            UUID NOT NULL REFERENCES public.organizations(id),

  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name         TEXT NOT NULL DEFAULT '',
  user_role         TEXT NOT NULL DEFAULT '',

  parent_comment_id UUID REFERENCES public.committee_agenda_comments(id) ON DELETE CASCADE,

  content           TEXT NOT NULL DEFAULT '',
  is_deleted        BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_cac_agenda_item_id ON public.committee_agenda_comments(agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_cac_meeting_id     ON public.committee_agenda_comments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_cac_created_at     ON public.committee_agenda_comments(created_at);

ALTER TABLE public.committee_agenda_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cac_select" ON public.committee_agenda_comments
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "cac_insert" ON public.committee_agenda_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND org_id = public.get_my_org_id()
  );

CREATE POLICY "cac_update" ON public.committee_agenda_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin')
  WITH CHECK (user_id = auth.uid() OR public.get_my_role() = 'admin');

CREATE POLICY "cac_delete" ON public.committee_agenda_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.cac_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS cac_updated_at ON public.committee_agenda_comments;
CREATE TRIGGER cac_updated_at
  BEFORE UPDATE ON public.committee_agenda_comments
  FOR EACH ROW EXECUTE FUNCTION public.cac_set_updated_at();


-- ============================================================
-- 058_regulations.sql
-- ============================================================
-- ============================================================
-- 058: Regulatory documents library
-- Categories (internal / external / reports) + uploaded files
-- ============================================================

-- ── Categories ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reg_categories (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL CHECK (kind IN ('internal','external','reports')),
  name        TEXT    NOT NULL DEFAULT '',
  name_en     TEXT,
  name_uz     TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regcat_org_kind ON public.reg_categories(org_id, kind);

ALTER TABLE public.reg_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regcat_select" ON public.reg_categories;
DROP POLICY IF EXISTS "regcat_insert" ON public.reg_categories;
DROP POLICY IF EXISTS "regcat_update" ON public.reg_categories;
DROP POLICY IF EXISTS "regcat_delete" ON public.reg_categories;

CREATE POLICY "regcat_select" ON public.reg_categories
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());

CREATE POLICY "regcat_insert" ON public.reg_categories
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin','corp_secretary'));

CREATE POLICY "regcat_update" ON public.reg_categories
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin','corp_secretary'));

CREATE POLICY "regcat_delete" ON public.reg_categories
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin','corp_secretary'));

-- ── Documents ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reg_documents (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id    UUID    NOT NULL REFERENCES public.reg_categories(id) ON DELETE CASCADE,

  title          TEXT    NOT NULL DEFAULT '',
  title_en       TEXT,
  title_uz       TEXT,

  description    TEXT,
  description_en TEXT,
  description_uz TEXT,

  effective_date DATE,
  version        TEXT    NOT NULL DEFAULT '1.0',
  issuing_body   TEXT,

  file_name      TEXT    NOT NULL DEFAULT '',
  file_size      BIGINT  NOT NULL DEFAULT 0,
  mime_type      TEXT    NOT NULL DEFAULT '',
  storage_path   TEXT    NOT NULL DEFAULT '',

  uploaded_by    UUID    REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_archived    BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regdoc_category  ON public.reg_documents(category_id);
CREATE INDEX IF NOT EXISTS idx_regdoc_org       ON public.reg_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_regdoc_archived  ON public.reg_documents(is_archived);

ALTER TABLE public.reg_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regdoc_select" ON public.reg_documents;
DROP POLICY IF EXISTS "regdoc_insert" ON public.reg_documents;
DROP POLICY IF EXISTS "regdoc_update" ON public.reg_documents;
DROP POLICY IF EXISTS "regdoc_delete" ON public.reg_documents;

CREATE POLICY "regdoc_select" ON public.reg_documents
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());

CREATE POLICY "regdoc_insert" ON public.reg_documents
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin','corp_secretary'));

CREATE POLICY "regdoc_update" ON public.reg_documents
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin','corp_secretary'));

CREATE POLICY "regdoc_delete" ON public.reg_documents
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin','corp_secretary'));

-- ── Seed default categories ───────────────────────────────────
DO $$
DECLARE v_org UUID;
BEGIN
  SELECT id INTO v_org FROM public.organizations LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;

  INSERT INTO public.reg_categories (org_id, kind, name, name_en, name_uz, order_index) VALUES
    -- Internal documents
    (v_org, 'internal', 'Устав общества',             'Company Charter',        'Жамият устави',          1),
    (v_org, 'internal', 'Положения',                  'Regulations',            'Низомлар',               2),
    (v_org, 'internal', 'Другие внутренние документы','Other Internal Documents','Бошқа ички ҳужжатлар',  3),
    -- External regulations
    (v_org, 'external', 'Регулирование энергорынка',    'Energy Market Regulations',     'Энергия бозорини тартибга солиш',     10),
    (v_org, 'external', 'Тарифное регулирование',       'Tariff Regulations',            'Тариф тартибга солиш',                11),
    (v_org, 'external', 'Постановления и указы',        'Decrees and Orders',            'Қарорлар ва фармойишлар',             12),
    (v_org, 'external', 'Другое внешнее регулирование', 'Other External Regulations',    'Бошқа ташқи тартибга солиш',         13),
    -- Reports
    (v_org, 'reports',  'Отчёты по МСФО',              'IFRS Reports',                  'ХЗМС ҳисоботлари',                   20),
    (v_org, 'reports',  'ESG-отчёты',                  'ESG Reports',                   'ESG ҳисоботлари',                    21),
    (v_org, 'reports',  'Рейтинговые отчёты',           'Rating Reports',                'Рейтинг ҳисоботлари',                22),
    (v_org, 'reports',  'Отчёты внутреннего аудита',    'Internal Audit Reports',        'Ички аудит ҳисоботлари',             23),
    (v_org, 'reports',  'Отчёты о закупках',            'Procurement Reports',           'Харид ҳисоботлари',                  24)
  ON CONFLICT (org_id, kind, name) DO NOTHING;
END $$;


-- ============================================================
-- 058b_regulations_cleanup.sql
-- ============================================================
-- ============================================================
-- 058b: Fix duplicate / stale reg_categories from double-run
-- Run this ONCE to clean up the mess, then it's safe to re-run.
-- ============================================================

-- 1. Remove old split "Положение о..." rows that are now consolidated
DELETE FROM public.reg_categories
WHERE name IN (
  'Положение о НС',
  'Положение о Правлении',
  'Положение о внутреннем аудите'
);

-- 2. Remove exact duplicates: keep the earliest row per (org_id, kind, name)
DELETE FROM public.reg_categories a
USING public.reg_categories b
WHERE a.org_id = b.org_id
  AND a.kind   = b.kind
  AND a.name   = b.name
  AND a.created_at > b.created_at;

-- 3. Add unique constraint so this can never happen again
ALTER TABLE public.reg_categories
  DROP CONSTRAINT IF EXISTS uq_regcat_org_kind_name;

ALTER TABLE public.reg_categories
  ADD CONSTRAINT uq_regcat_org_kind_name UNIQUE (org_id, kind, name);

