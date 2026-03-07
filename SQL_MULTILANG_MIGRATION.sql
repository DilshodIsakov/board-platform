-- ============================================================
-- MIGRATION: Multilingual content support
-- Board Meetings (NS) and Shareholder Meetings (OSA)
-- Run once in Supabase SQL editor
-- ============================================================

-- ============================================================
-- 1. meetings table (NS заседания)
-- ============================================================

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS source_language  TEXT NOT NULL DEFAULT 'ru',
  ADD COLUMN IF NOT EXISTS title_ru          TEXT,
  ADD COLUMN IF NOT EXISTS title_uz          TEXT,
  ADD COLUMN IF NOT EXISTS title_en          TEXT,
  ADD COLUMN IF NOT EXISTS translation_status_ru TEXT NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS translation_status_uz TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_status_en TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS translation_updated_at TIMESTAMPTZ;

-- Migrate existing data: copy title → title_ru
UPDATE meetings
SET
  title_ru               = title,
  source_language        = 'ru',
  translation_status_ru  = 'original',
  translation_status_uz  = 'missing',
  translation_status_en  = 'missing'
WHERE title_ru IS NULL AND title IS NOT NULL;

-- ============================================================
-- 2. agenda_items table (повестка НС)
-- ============================================================

ALTER TABLE agenda_items
  ADD COLUMN IF NOT EXISTS title_ru TEXT,
  ADD COLUMN IF NOT EXISTS title_uz TEXT,
  ADD COLUMN IF NOT EXISTS title_en TEXT;

UPDATE agenda_items
SET title_ru = title
WHERE title_ru IS NULL AND title IS NOT NULL;

-- ============================================================
-- 3. shareholder_meetings table (ОСА)
-- ============================================================

ALTER TABLE shareholder_meetings
  ADD COLUMN IF NOT EXISTS source_language TEXT NOT NULL DEFAULT 'ru',
  ADD COLUMN IF NOT EXISTS title_ru        TEXT,
  ADD COLUMN IF NOT EXISTS title_uz        TEXT,
  ADD COLUMN IF NOT EXISTS title_en        TEXT;

UPDATE shareholder_meetings
SET
  title_ru        = title,
  source_language = 'ru'
WHERE title_ru IS NULL AND title IS NOT NULL;

-- ============================================================
-- 4. shareholder_agenda_items table (повестка ОСА)
--    Все три языка обязательны — хранятся как NOT NULL DEFAULT ''
--    Валидация на уровне frontend
-- ============================================================

ALTER TABLE shareholder_agenda_items
  ADD COLUMN IF NOT EXISTS title_ru TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS title_uz TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS title_en TEXT NOT NULL DEFAULT '';

UPDATE shareholder_agenda_items
SET title_ru = title
WHERE title_ru = '' AND title IS NOT NULL AND title <> '';

-- ============================================================
-- 5. Полезные индексы (опционально, для производительности)
-- ============================================================

CREATE INDEX IF NOT EXISTS meetings_source_language_idx
  ON meetings (source_language);

CREATE INDEX IF NOT EXISTS shareholder_meetings_source_language_idx
  ON shareholder_meetings (source_language);

-- ============================================================
-- READY. After running this migration:
-- 1. All existing NS meeting titles are copied to title_ru
-- 2. title_uz / title_en remain NULL (marked 'missing')
-- 3. Shareholder meeting titles copied to title_ru
-- 4. Shareholder agenda items' title_ru filled from title
-- ============================================================
