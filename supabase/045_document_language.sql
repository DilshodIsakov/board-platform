-- ============================================================
-- Migration 045: Добавить поле language в таблицу documents
-- Для раздельной загрузки материалов по языкам (ru / uz / en)
-- ============================================================

-- 1. Добавляем колонку language (nullable для обратной совместимости)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS language text;

-- 2. Индекс для быстрого поиска по agenda_item_id + language
CREATE INDEX IF NOT EXISTS idx_documents_agenda_lang
  ON public.documents(agenda_item_id, language);

-- 3. Обновить кэш PostgREST
NOTIFY pgrst, 'reload schema';
