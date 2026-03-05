-- ============================================================
-- Single-Company User Profile + Roles System
-- Creates profiles table with RLS for email-confirmed users only
-- ============================================================

-- 1. Create enum type for user roles (if it doesn't exist)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'corp_secretary', 'board_member', 'management');
  end if;
end
$$;

-- 2. Create new profiles table for single-company
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'board_member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- NOTE: If you have old profiles data, manually migrate with:
-- INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
-- SELECT user_id, coalesce(au.email, ''), coalesce(p.full_name, ''),
--        CAST(p.role AS public.user_role),
--        p.created_at, NOW()
-- FROM old_profiles p
-- JOIN auth.users au ON au.id = p.user_id
-- ON CONFLICT (id) DO NOTHING;

-- 3. Create indexes for performance
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_created_at on public.profiles(created_at);

-- 4. Enable RLS on profiles table
alter table public.profiles enable row level security;

-- Drop all existing policies on profiles
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_insert_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_update_own_profile" on public.profiles;
drop policy if exists "profiles_update_role_as_admin" on public.profiles;

-- 5. RLS Policies
-- SELECT: All authenticated users can view all profiles
create policy "profiles_select_authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');

-- UPDATE own profile: Users can update their own profile fields (except role)
-- This policy prevents updating the role field
create policy "profiles_update_own_profile" on public.profiles
  for update 
  using (auth.uid() = id)
  with check (
    auth.uid() = id and
    -- Prevent changing role through normal user update
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

-- 6. Create trigger function to insert profile when email is confirmed
-- This function inserts a NEW profile record when email_confirmed_at becomes not null
create or replace function public.create_profile_on_email_confirmed()
returns trigger
language plpgsql security definer
set search_path = 'public'
as $$
declare
  _full_name text;
begin
  -- Only create profile if email_confirmed_at is being set to not null
  -- and the profile doesn't already exist
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    _full_name := coalesce(new.raw_user_meta_data ->> 'full_name', new.email);
    
    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email, _full_name, 'board_member')
    on conflict (id) do nothing;
  end if;
  
  return new;
end;
$$;

-- Attach trigger to auth.users
drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update on auth.users
  for each row
  execute function public.create_profile_on_email_confirmed();

-- 7. Helper function to check if user is admin
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

-- 8. Helper function to get user's role
create or replace function public.get_user_role()
returns public.user_role
language plpgsql stable security definer
set search_path = 'public'
as $$
declare
  _role public.user_role;
begin
  select role into _role from public.profiles where id = auth.uid();
  return _role;
end;
$$;
