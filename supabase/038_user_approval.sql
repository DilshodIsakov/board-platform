-- 038: User approval system
-- Self-registered users need admin approval before accessing the platform.
-- Admin-created/invited users are approved immediately.

-- 1. Add approval_status column (existing users are 'approved' by default)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';

-- 2. Recreate trigger: self-registered users get 'pending' status
CREATE OR REPLACE FUNCTION public.create_profile_on_email_confirmed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _full_name text;
  _org_id uuid;
BEGIN
  IF new.email_confirmed_at IS NOT NULL AND old.email_confirmed_at IS NULL THEN
    _full_name := coalesce(new.raw_user_meta_data ->> 'full_name', new.email);
    SELECT id INTO _org_id FROM public.organizations LIMIT 1;

    INSERT INTO public.profiles (id, organization_id, email, full_name, role, approval_status)
    VALUES (new.id, _org_id, new.email, _full_name, 'board_member', 'pending')
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN new;
END;
$$;

-- Restore trigger (may have been dropped)
DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_profile_on_email_confirmed();
