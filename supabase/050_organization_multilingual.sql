-- ============================================================
-- 050: Add multilingual name fields to organizations
-- name_uz (Uzbek Cyrillic), name_en (English)
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS name_uz text,
  ADD COLUMN IF NOT EXISTS name_en text;

-- Populate for the existing organization
UPDATE public.organizations
SET
  name_uz = '«Ҳудудий электр тармоқлари» АЖ',
  name_en = 'JSC "Regional Electrical Power Networks"'
WHERE name ILIKE '%электр%' OR name ILIKE '%электрические%';
