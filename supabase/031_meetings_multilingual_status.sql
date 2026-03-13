-- ============================================================
-- 031: Add multilingual title columns + translation status
--      to meetings table (includes what 028 may have missed)
-- ============================================================

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS title_ru               text,
  ADD COLUMN IF NOT EXISTS title_uz               text,
  ADD COLUMN IF NOT EXISTS title_en               text,
  ADD COLUMN IF NOT EXISTS source_language        text NOT NULL DEFAULT 'ru',
  ADD COLUMN IF NOT EXISTS translation_status_ru  text NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS translation_status_uz  text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_status_en  text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_updated_at timestamptz;

-- Backfill title_ru from existing title for all rows
UPDATE public.meetings
SET title_ru = title
WHERE title_ru IS NULL AND title IS NOT NULL;
