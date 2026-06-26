-- ============================================================
-- Migration 061: Версионность документов (Document Versions)
-- Режим рецензирования: секретарь/админ загружает финальную версию
-- документа с учётом комментариев. Оригинал (запись в исходной таблице) =
-- версия 1, последующие версии хранятся здесь.
--
-- Источник документа полиморфен (source_type):
--   'document'      → public.documents      (материалы заседаний, комитетов)
--   'reg_document'  → public.reg_documents  (регламенты)
-- document_id хранит id из соответствующей таблицы (без жёсткого FK).
--
-- Идемпотентная: безопасно запускать повторно (в т.ч. поверх прежней версии).
-- ============================================================

-- ── 1. Таблица document_versions ──

CREATE TABLE IF NOT EXISTS public.document_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL,                 -- id из documents или reg_documents
  source_type   text NOT NULL DEFAULT 'document',  -- 'document' | 'reg_document'
  version_no    int  NOT NULL,                 -- 2, 3, 4 ...
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  file_size     bigint NOT NULL DEFAULT 0,
  mime_type     text NOT NULL DEFAULT 'application/octet-stream',
  uploaded_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  change_note   text,                          -- «Учтены комментарии НС»
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Апгрейд ранее созданной таблицы + снятие старого жёсткого FK на documents
ALTER TABLE public.document_versions ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'document';
ALTER TABLE public.document_versions DROP CONSTRAINT IF EXISTS document_versions_document_id_fkey;

CREATE INDEX IF NOT EXISTS idx_doc_versions_document ON public.document_versions(document_id, source_type);

-- ── 2. RLS ──

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- SELECT: все участники организации (документ принадлежит моей орг.)
DROP POLICY IF EXISTS "doc_versions_select" ON public.document_versions;
CREATE POLICY "doc_versions_select" ON public.document_versions
  FOR SELECT TO authenticated
  USING (
    (source_type = 'document'     AND document_id IN (SELECT d.id FROM public.documents d     WHERE d.org_id = public.get_my_org_id()))
    OR
    (source_type = 'reg_document' AND document_id IN (SELECT r.id FROM public.reg_documents r WHERE r.org_id = public.get_my_org_id()))
  );

-- INSERT: только admin / corp_secretary (загрузка финальной версии)
DROP POLICY IF EXISTS "doc_versions_insert" ON public.document_versions;
CREATE POLICY "doc_versions_insert" ON public.document_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_my_role() IN ('admin', 'corp_secretary')
    AND (
      (source_type = 'document'     AND document_id IN (SELECT d.id FROM public.documents d     WHERE d.org_id = public.get_my_org_id()))
      OR
      (source_type = 'reg_document' AND document_id IN (SELECT r.id FROM public.reg_documents r WHERE r.org_id = public.get_my_org_id()))
    )
  );

-- DELETE: только admin (на случай отката ошибочной загрузки)
DROP POLICY IF EXISTS "doc_versions_delete" ON public.document_versions;
CREATE POLICY "doc_versions_delete" ON public.document_versions
  FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin');

-- ── 3. Аудит загрузки версии ──

CREATE OR REPLACE FUNCTION public.audit_document_version_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _meta jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _meta := jsonb_build_object('version_no', NEW.version_no, 'file_name', NEW.file_name, 'source_type', NEW.source_type);
    PERFORM public.log_audit_event(
      'document_version_create', 'Загрузка новой версии документа',
      'document', NEW.document_id::text, NEW.file_name,
      NULL, NULL, NEW.document_id::text, NULL, _meta
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_document_versions ON public.document_versions;
CREATE TRIGGER trg_audit_document_versions
  AFTER INSERT ON public.document_versions
  FOR EACH ROW EXECUTE FUNCTION public.audit_document_version_changes();

-- ── 4. Обновить кэш PostgREST ──
NOTIFY pgrst, 'reload schema';
