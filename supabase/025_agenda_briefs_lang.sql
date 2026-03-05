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
