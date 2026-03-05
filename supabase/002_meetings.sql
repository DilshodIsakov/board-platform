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
