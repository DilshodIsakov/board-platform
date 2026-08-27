-- ============================================================
-- COPY-PASTE READY: Single-Company User Profile + Roles
-- Paste this into Supabase SQL Editor and Run
-- ============================================================

-- 1. Create user_role enum (if not exists)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'corp_secretary', 'board_member', 'management');
  end if;
end
$$;

-- 2. Create new profiles table for single-company
create table if not exists public.profiles_new (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'board_member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Migrate data (if old profiles table exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'profiles' and table_schema = 'public') then
    if (select count(*) from public.profiles_new) = 0 then
      insert into public.profiles_new (id, email, full_name, role, created_at, updated_at)
      select 
        user_id, 
        coalesce(au.email, ''), 
        coalesce(p.full_name, ''), 
        case when p.role::text = 'admin' then 'admin'::public.user_role else 'board_member'::public.user_role end,
        p.created_at, 
        now()
      from public.profiles p
      join auth.users au on au.id = p.user_id
      on conflict (id) do nothing;
    end if;
  end if;
end
$$;

-- 4. Swap tables (drop old, rename new)
drop table if exists public.profiles cascade;
alter table public.profiles_new rename to profiles;

-- 5. Create indexes
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_created_at on public.profiles(created_at);

-- 6. Enable RLS
alter table public.profiles enable row level security;

-- 7. Drop old policies if they exist
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_insert_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_update_own_profile" on public.profiles;
drop policy if exists "profiles_update_role_as_admin" on public.profiles;

-- 8. Create RLS policies
-- SELECT: All authenticated users can view all profiles
create policy "profiles_select_authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');

-- UPDATE own profile: Users can update their own profile fields (except role)
create policy "profiles_update_own_profile" on public.profiles
  for update 
  using (auth.uid() = id)
  with check (
    auth.uid() = id and
    (select role from public.profiles where id = auth.uid()) = 
    (select role from public.profiles where id = auth.uid())
  );

-- UPDATE role as admin: Only admin users can update role
create policy "profiles_update_role_as_admin" on public.profiles
  for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 9. Create trigger function
create or replace function public.create_profile_on_email_confirmed()
returns trigger
language plpgsql security definer
set search_path = 'public'
as $$
declare
  _full_name text;
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    _full_name := coalesce(new.raw_user_meta_data ->> 'full_name', new.email);
    
    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email, _full_name, 'board_member')
    on conflict (id) do nothing;
  end if;
  
  return new;
end;
$$;

-- Attach trigger
drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update on auth.users
  for each row
  execute function public.create_profile_on_email_confirmed();

-- 10. Helper functions
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.get_user_role()
returns public.user_role
language sql stable security definer
set search_path = 'public'
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

-- ============================================================
-- VERIFICATION QUERIES (Run these to verify everything works)
-- ============================================================

-- Check profiles table exists and has correct structure
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'profiles' ORDER BY ordinal_position;

-- Check enum values
-- SELECT enum_range(NULL::public.user_role);

-- Check policies
-- SELECT policyname FROM pg_policies WHERE tablename = 'profiles';

-- Check trigger
-- SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_email_confirmed';

-- Check test user (if exists, make it admin)
-- UPDATE public.profiles SET role = 'admin' 
-- WHERE email = 'test@example.com' LIMIT 1;
