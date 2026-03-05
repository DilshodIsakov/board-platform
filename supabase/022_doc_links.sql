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
