-- ============================================================
-- 027: Admin User Management — new roles + role_details field
-- ============================================================

-- 1. Add new role values to the enum
-- PostgreSQL enums can only be extended with ADD VALUE
do $$
begin
  -- Add 'executive' (Член Правления)
  if not exists (select 1 from pg_enum where enumlabel = 'executive' and enumtypid = (select oid from pg_type where typname = 'user_role')) then
    alter type public.user_role add value 'executive';
  end if;
  -- Add 'employee' (Сотрудник)
  if not exists (select 1 from pg_enum where enumlabel = 'employee' and enumtypid = (select oid from pg_type where typname = 'user_role')) then
    alter type public.user_role add value 'employee';
  end if;
  -- Add 'auditor' (Внутренний аудитор)
  if not exists (select 1 from pg_enum where enumlabel = 'auditor' and enumtypid = (select oid from pg_type where typname = 'user_role')) then
    alter type public.user_role add value 'auditor';
  end if;
end
$$;

-- 2. Add role_details column (free-text supplement to the main role)
alter table public.profiles add column if not exists role_details text;

-- 3. Add INSERT policy for admins (needed to create profiles for new users)
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles
  for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 4. Add DELETE policy for admins
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
  for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
