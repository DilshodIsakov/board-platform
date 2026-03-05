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
