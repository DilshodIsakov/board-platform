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
