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

-- 3. Исправить RLS: разрешить corp_secretary загружать документы
DROP POLICY IF EXISTS "documents_insert" ON public.documents;
CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- 4. Добавить флаг materials_ready в meetings
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS materials_ready boolean NOT NULL DEFAULT false;

-- 5. Обновить кэш PostgREST
NOTIFY pgrst, 'reload schema';
