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
