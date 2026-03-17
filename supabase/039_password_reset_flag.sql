-- Add password_reset_required flag to profiles
-- When admin resets a user's password, this flag is set to true.
-- User can then change password without knowing the old one (via edge function).

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS password_reset_required boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
