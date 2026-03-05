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
