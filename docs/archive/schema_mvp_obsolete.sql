-- ============================================================
-- Board Platform — MVP Schema
-- Запускать в Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. ORGANIZATIONS
-- Сейчас одна запись. org_id на всех таблицах для будущего SaaS.
-- ============================================================

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(500) not null,
  created_at timestamptz  not null default now(),
  created_by uuid         references auth.users(id),
  is_active  boolean      not null default true
);

alter table public.organizations enable row level security;

-- Видишь только свою организацию (через profiles)
create policy "org_select" on public.organizations
  for select using (
    id in (select org_id from public.profiles where user_id = auth.uid())
  );

-- Обновлять может только admin своей организации
create policy "org_update" on public.organizations
  for update using (
    id in (
      select org_id from public.profiles
      where user_id = auth.uid() and role = 'admin'
    )
  );


-- 2. PROFILES
-- 1:1 с auth.users. Хранит роль, org_id, бизнес-данные.
-- ============================================================

create type public.app_role as enum (
  'chairman',
  'board_member',
  'executive',
  'admin',
  'auditor',
  'department_head'
);

create table public.profiles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid         not null unique references auth.users(id) on delete cascade,
  org_id     uuid         not null references public.organizations(id),
  role       app_role     not null default 'board_member',
  full_name  varchar(255) not null default '',
  position   varchar(255) default '',
  is_active  boolean      not null default true,
  created_at timestamptz  not null default now()
);

create index idx_profiles_org_id   on public.profiles(org_id);
create index idx_profiles_org_role on public.profiles(org_id, role);

alter table public.profiles enable row level security;

-- Все видят профили своей организации
create policy "profiles_select" on public.profiles
  for select using (
    org_id in (select org_id from public.profiles where user_id = auth.uid())
  );

-- Пользователь может редактировать свой профиль (имя, должность)
create policy "profiles_update_self" on public.profiles
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Admin может создавать профили в своей организации
create policy "profiles_insert_admin" on public.profiles
  for insert with check (
    org_id in (
      select org_id from public.profiles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Admin может обновлять любые профили в своей организации
create policy "profiles_update_admin" on public.profiles
  for update using (
    org_id in (
      select org_id from public.profiles
      where user_id = auth.uid() and role = 'admin'
    )
  );


-- 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
-- Используются в RLS-политиках и клиентском коде.
-- ============================================================

-- Получить org_id текущего пользователя
create or replace function public.get_my_org_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select org_id from public.profiles where user_id = auth.uid() limit 1;
$$;

-- Получить роль текущего пользователя
create or replace function public.get_my_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select role from public.profiles where user_id = auth.uid() limit 1;
$$;

-- Получить profile id текущего пользователя
create or replace function public.get_my_profile_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select id from public.profiles where user_id = auth.uid() limit 1;
$$;


-- 4. ТРИГГЕР: автосоздание профиля при регистрации
-- Берёт org_id из user_metadata (передаётся при signUp).
-- Если org_id не передан — берёт первую активную организацию (MVP: одна компания).
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  _org_id uuid;
  _full_name text;
  _role public.app_role;
begin
  -- org_id из metadata или первая активная организация
  _org_id := coalesce(
    (new.raw_user_meta_data ->> 'org_id')::uuid,
    (select id from public.organizations where is_active = true limit 1)
  );

  -- Если организации нет — не создаём профиль (пользователь увидит ошибку)
  if _org_id is null then
    return new;
  end if;

  _full_name := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  _role := coalesce(
    (new.raw_user_meta_data ->> 'role')::public.app_role,
    'board_member'
  );

  insert into public.profiles (user_id, org_id, full_name, role)
  values (new.id, _org_id, _full_name, _role);

  return new;
end;
$$;

-- Привязываем триггер к auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- 5. SEED: организация по умолчанию (MVP)
-- ============================================================

insert into public.organizations (name)
values ('Наблюдательный совет')
on conflict do nothing;
