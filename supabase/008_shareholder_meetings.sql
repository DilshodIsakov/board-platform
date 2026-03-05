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
