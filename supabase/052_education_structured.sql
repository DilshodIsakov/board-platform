-- ============================================================
-- Migration 052: Structured Education Entries
-- Структурированные записи об образовании
-- ============================================================

-- Добавить JSONB-колонку для структурированного образования
-- Формат: массив объектов [{degree, specialty, institution, year_start, year_end}]
-- Каждое поле на 3 языках: _ru, _en, _uz
ALTER TABLE public.profile_details
  ADD COLUMN IF NOT EXISTS education_entries jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profile_details.education_entries IS
  'Structured education records: [{degree_ru, degree_en, degree_uz, specialty_ru, specialty_en, specialty_uz, institution_ru, institution_en, institution_uz, year_start, year_end}]';

NOTIFY pgrst, 'reload schema';
