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
