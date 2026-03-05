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
