-- ============================================================
-- Migration 063: Авто-очистка данных рецензирования при удалении документа
--
-- Полиморфный рефактор (061/062) снял жёсткий FK document_comments/
-- document_versions → documents, поэтому удаление документа/материала больше
-- не каскадит и оставляет «осиротевшие» комментарии и версии.
--
-- Здесь:
--   1) триггеры AFTER DELETE на documents и reg_documents, удаляющие
--      связанные document_comments / document_versions по (document_id, source_type);
--   2) одноразовая зачистка уже накопившихся сирот.
--
-- Идемпотентная: безопасно запускать повторно.
-- ============================================================

-- ── 1. Функция очистки (общая для обоих источников) ──
-- Источник передаётся аргументом триггера: 'document' | 'reg_document'.

CREATE OR REPLACE FUNCTION public.cleanup_document_review_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _src text := TG_ARGV[0];
BEGIN
  -- Реплаи удаляются каскадом по parent_comment_id (ON DELETE CASCADE),
  -- поэтому достаточно удалить все комментарии этого документа.
  DELETE FROM public.document_comments
    WHERE document_id = OLD.id AND source_type = _src;

  DELETE FROM public.document_versions
    WHERE document_id = OLD.id AND source_type = _src;

  RETURN OLD;
END;
$$;

-- ── 2. Триггеры на таблицы-источники ──

DROP TRIGGER IF EXISTS trg_cleanup_review_documents ON public.documents;
CREATE TRIGGER trg_cleanup_review_documents
  AFTER DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_document_review_data('document');

DROP TRIGGER IF EXISTS trg_cleanup_review_reg_documents ON public.reg_documents;
CREATE TRIGGER trg_cleanup_review_reg_documents
  AFTER DELETE ON public.reg_documents
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_document_review_data('reg_document');

-- ── 3. Одноразовая зачистка уже накопившихся сирот ──
-- (комментарии/версии, чей документ-источник уже удалён)

DELETE FROM public.document_comments dc
WHERE (dc.source_type = 'document'
         AND NOT EXISTS (SELECT 1 FROM public.documents d     WHERE d.id = dc.document_id))
   OR (dc.source_type = 'reg_document'
         AND NOT EXISTS (SELECT 1 FROM public.reg_documents r WHERE r.id = dc.document_id));

DELETE FROM public.document_versions dv
WHERE (dv.source_type = 'document'
         AND NOT EXISTS (SELECT 1 FROM public.documents d     WHERE d.id = dv.document_id))
   OR (dv.source_type = 'reg_document'
         AND NOT EXISTS (SELECT 1 FROM public.reg_documents r WHERE r.id = dv.document_id));

-- ── 4. Обновить кэш PostgREST ──
NOTIFY pgrst, 'reload schema';
