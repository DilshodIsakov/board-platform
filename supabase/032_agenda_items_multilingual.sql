-- ============================================================
-- 032: Add multilingual fields + translation status to agenda_items
--      (title_ru/uz/en and presenter_ru/uz/en may already exist
--       from migration 028 if it was applied; using IF NOT EXISTS)
-- ============================================================

ALTER TABLE public.agenda_items
  ADD COLUMN IF NOT EXISTS title_ru               text,
  ADD COLUMN IF NOT EXISTS title_uz               text,
  ADD COLUMN IF NOT EXISTS title_en               text,
  ADD COLUMN IF NOT EXISTS presenter_ru           text,
  ADD COLUMN IF NOT EXISTS presenter_uz           text,
  ADD COLUMN IF NOT EXISTS presenter_en           text,
  ADD COLUMN IF NOT EXISTS source_language        text NOT NULL DEFAULT 'ru',
  ADD COLUMN IF NOT EXISTS translation_status_ru  text NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS translation_status_uz  text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_status_en  text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_updated_at timestamptz;

-- Backfill title_ru from existing title for all rows
UPDATE public.agenda_items
SET title_ru = title
WHERE title_ru IS NULL AND title IS NOT NULL;

-- Backfill presenter_ru from existing presenter for all rows
UPDATE public.agenda_items
SET presenter_ru = presenter
WHERE presenter_ru IS NULL AND presenter IS NOT NULL;
