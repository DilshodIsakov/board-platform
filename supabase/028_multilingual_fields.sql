-- ============================================================
-- 028: Add multilingual fields (_ru, _uz, _en) for structured entities
-- Copies current single-language values into *_ru fields
-- Does NOT touch: chat messages, comments, uploaded files, doc_links
-- ============================================================

-- ========================
-- 1. meetings
-- ========================
ALTER TABLE IF EXISTS public.meetings
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.meetings SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;

-- ========================
-- 2. agenda_items
-- ========================
ALTER TABLE IF EXISTS public.agenda_items
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS presenter_ru text,
  ADD COLUMN IF NOT EXISTS presenter_uz text,
  ADD COLUMN IF NOT EXISTS presenter_en text;

UPDATE public.agenda_items SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;
UPDATE public.agenda_items SET presenter_ru = presenter WHERE presenter_ru IS NULL AND presenter IS NOT NULL;

-- ========================
-- 3. decisions
-- ========================
ALTER TABLE IF EXISTS public.decisions
  ADD COLUMN IF NOT EXISTS decision_text_ru text,
  ADD COLUMN IF NOT EXISTS decision_text_uz text,
  ADD COLUMN IF NOT EXISTS decision_text_en text;

UPDATE public.decisions SET decision_text_ru = decision_text WHERE decision_text_ru IS NULL AND decision_text IS NOT NULL;

-- ========================
-- 4. board_tasks
-- ========================
ALTER TABLE IF EXISTS public.board_tasks
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS description_ru text,
  ADD COLUMN IF NOT EXISTS description_uz text,
  ADD COLUMN IF NOT EXISTS description_en text;

UPDATE public.board_tasks SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;
UPDATE public.board_tasks SET description_ru = description WHERE description_ru IS NULL AND description IS NOT NULL;

-- ========================
-- 5. votings
-- ========================
ALTER TABLE IF EXISTS public.votings
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS description_ru text,
  ADD COLUMN IF NOT EXISTS description_uz text,
  ADD COLUMN IF NOT EXISTS description_en text;

UPDATE public.votings SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;
UPDATE public.votings SET description_ru = description WHERE description_ru IS NULL AND description IS NOT NULL;

-- ========================
-- 6. video_conferences
-- ========================
ALTER TABLE IF EXISTS public.video_conferences
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.video_conferences SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;

-- ========================
-- 7. board_work_plans
-- ========================
ALTER TABLE IF EXISTS public.board_work_plans
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.board_work_plans SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;

-- ========================
-- 8. plan_meetings
-- ========================
ALTER TABLE IF EXISTS public.plan_meetings
  ADD COLUMN IF NOT EXISTS planned_date_range_text_ru text,
  ADD COLUMN IF NOT EXISTS planned_date_range_text_uz text,
  ADD COLUMN IF NOT EXISTS planned_date_range_text_en text;

UPDATE public.plan_meetings SET planned_date_range_text_ru = planned_date_range_text WHERE planned_date_range_text_ru IS NULL AND planned_date_range_text IS NOT NULL;

-- ========================
-- 9. plan_agenda_items
-- ========================
ALTER TABLE IF EXISTS public.plan_agenda_items
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.plan_agenda_items SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;

-- ========================
-- 10. shareholder_meetings
-- ========================
ALTER TABLE IF EXISTS public.shareholder_meetings
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.shareholder_meetings SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;

-- ========================
-- 11. shareholder_agenda_items
-- ========================
ALTER TABLE IF EXISTS public.shareholder_agenda_items
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.shareholder_agenda_items SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;

-- ========================
-- 12. shareholder_materials
-- ========================
ALTER TABLE IF EXISTS public.shareholder_materials
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text;

UPDATE public.shareholder_materials SET title_ru = title WHERE title_ru IS NULL AND title IS NOT NULL;
