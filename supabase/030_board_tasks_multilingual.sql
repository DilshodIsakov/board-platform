-- 030_board_tasks_multilingual.sql
-- Add multilingual fields to board_tasks table (backward-compatible)

ALTER TABLE public.board_tasks
  ADD COLUMN IF NOT EXISTS source_language text NOT NULL DEFAULT 'ru',
  ADD COLUMN IF NOT EXISTS title_ru    text,
  ADD COLUMN IF NOT EXISTS title_uz    text,
  ADD COLUMN IF NOT EXISTS title_en    text,
  ADD COLUMN IF NOT EXISTS description_ru text,
  ADD COLUMN IF NOT EXISTS description_uz text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS translation_status_ru text NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS translation_status_uz text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_status_en text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_updated_at timestamptz;

-- Migrate existing data: copy title/description into _ru columns
UPDATE public.board_tasks
SET
  title_ru              = title,
  description_ru        = description,
  translation_status_ru = 'original'
WHERE title_ru IS NULL;

-- Add a GIN index for full-text search across all language title columns (optional, for performance)
-- CREATE INDEX IF NOT EXISTS board_tasks_title_gin
--   ON public.board_tasks USING gin(
--     to_tsvector('simple', coalesce(title_ru,'') || ' ' || coalesce(title_uz,'') || ' ' || coalesce(title_en,''))
--   );
