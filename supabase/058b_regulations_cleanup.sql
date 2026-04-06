-- ============================================================
-- 058b: Fix duplicate / stale reg_categories from double-run
-- Run this ONCE to clean up the mess, then it's safe to re-run.
-- ============================================================

-- 1. Remove old split "Положение о..." rows that are now consolidated
DELETE FROM public.reg_categories
WHERE name IN (
  'Положение о НС',
  'Положение о Правлении',
  'Положение о внутреннем аудите'
);

-- 2. Remove exact duplicates: keep the earliest row per (org_id, kind, name)
DELETE FROM public.reg_categories a
USING public.reg_categories b
WHERE a.org_id = b.org_id
  AND a.kind   = b.kind
  AND a.name   = b.name
  AND a.created_at > b.created_at;

-- 3. Add unique constraint so this can never happen again
ALTER TABLE public.reg_categories
  DROP CONSTRAINT IF EXISTS uq_regcat_org_kind_name;

ALTER TABLE public.reg_categories
  ADD CONSTRAINT uq_regcat_org_kind_name UNIQUE (org_id, kind, name);
