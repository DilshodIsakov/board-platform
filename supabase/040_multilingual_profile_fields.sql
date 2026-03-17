-- Add multilingual fields for full_name and role_details
-- Existing full_name and role_details are used as Russian (default)
-- New columns for English and Uzbek translations

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name_en text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name_uz text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_details_en text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_details_uz text;

NOTIFY pgrst, 'reload schema';
