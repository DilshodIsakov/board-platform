-- ============================================================
-- Migration 062: Комментарии к документам (Document Comments)
-- Режим рецензирования: комментарии к выделенному фрагменту .docx
-- и к ячейке/диапазону .xlsx. Нити ответов + статус open/resolved.
-- Привязаны к конкретной версии документа (version_no).
--
-- Источник документа полиморфен (source_type):
--   'document'      → public.documents
--   'reg_document'  → public.reg_documents
-- document_id хранит id из соответствующей таблицы (без жёсткого FK).
--
-- Построена по образцу 051_agenda_item_comments. Идемпотентная.
-- ============================================================

-- ── 0. Расширяем enum типов уведомлений ──
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'document_comment';

-- ── 1. Таблица document_comments ──

CREATE TABLE IF NOT EXISTS public.document_comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  document_id       uuid NOT NULL,                 -- id из documents или reg_documents
  source_type       text NOT NULL DEFAULT 'document',  -- 'document' | 'reg_document'
  version_no        int  NOT NULL DEFAULT 1,        -- к какой версии документа относится

  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name         text NOT NULL DEFAULT '',
  user_role         text NOT NULL DEFAULT '',

  parent_comment_id uuid REFERENCES public.document_comments(id) ON DELETE CASCADE,

  -- Привязка к фрагменту:
  --   docx: { "type":"docx", "startBlock":12, "startOffset":40, "endBlock":13, "endOffset":88 }
  --   xlsx: { "type":"xlsx", "sheet":"Лист1", "start":"B4", "end":"D9" }
  anchor            jsonb,
  quoted_text       text,                       -- процитированный фрагмент (для отображения)

  content           text NOT NULL DEFAULT '',
  status            text NOT NULL DEFAULT 'open',  -- 'open' | 'resolved'
  resolved_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at       timestamptz,

  is_deleted        boolean NOT NULL DEFAULT false
);

-- Апгрейд ранее созданной таблицы + снятие старого жёсткого FK на documents
ALTER TABLE public.document_comments ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'document';
ALTER TABLE public.document_comments DROP CONSTRAINT IF EXISTS document_comments_document_id_fkey;

-- ── 2. Индексы ──

CREATE INDEX IF NOT EXISTS idx_dc_document_id        ON public.document_comments(document_id, source_type);
CREATE INDEX IF NOT EXISTS idx_dc_document_version   ON public.document_comments(document_id, version_no);
CREATE INDEX IF NOT EXISTS idx_dc_parent_comment_id  ON public.document_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_dc_created_at         ON public.document_comments(created_at);

-- ── 3. RLS ──

ALTER TABLE public.document_comments ENABLE ROW LEVEL SECURITY;

-- Документ принадлежит моей организации (в одной из таблиц-источников)
-- SELECT: все участники организации
DROP POLICY IF EXISTS "dc_select" ON public.document_comments;
CREATE POLICY "dc_select" ON public.document_comments
  FOR SELECT TO authenticated
  USING (
    (source_type = 'document'     AND document_id IN (SELECT d.id FROM public.documents d     WHERE d.org_id = public.get_my_org_id()))
    OR
    (source_type = 'reg_document' AND document_id IN (SELECT r.id FROM public.reg_documents r WHERE r.org_id = public.get_my_org_id()))
  );

-- INSERT: роли-комментаторы (admin, corp_secretary, board_member, chairman, executive)
DROP POLICY IF EXISTS "dc_insert" ON public.document_comments;
CREATE POLICY "dc_insert" ON public.document_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.get_my_role() IN ('admin', 'corp_secretary', 'board_member', 'chairman', 'executive')
    AND (
      (source_type = 'document'     AND document_id IN (SELECT d.id FROM public.documents d     WHERE d.org_id = public.get_my_org_id()))
      OR
      (source_type = 'reg_document' AND document_id IN (SELECT r.id FROM public.reg_documents r WHERE r.org_id = public.get_my_org_id()))
    )
  );

-- UPDATE: автор (правка своего/мягкое удаление) ИЛИ admin/corp_secretary (resolve)
DROP POLICY IF EXISTS "dc_update" ON public.document_comments;
CREATE POLICY "dc_update" ON public.document_comments
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'corp_secretary')
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'corp_secretary')
  );

-- DELETE: автор или admin
DROP POLICY IF EXISTS "dc_delete" ON public.document_comments;
CREATE POLICY "dc_delete" ON public.document_comments
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_my_role() = 'admin'
  );

-- ── 4. Триггер: уведомления при добавлении комментария ──

CREATE OR REPLACE FUNCTION public.notify_document_comment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _doc_title   text;
  _org_id      uuid;
  _author_name text;
  _recipient   record;
  _title_ru    text;
  _title_en    text;
  _title_uz    text;
  _body_ru     text;
  _body_en     text;
  _body_uz     text;
  _parent_author_id uuid;
BEGIN
  -- Метаданные документа из соответствующей таблицы-источника
  IF NEW.source_type = 'reg_document' THEN
    SELECT coalesce(title, file_name, ''), org_id INTO _doc_title, _org_id
      FROM public.reg_documents WHERE id = NEW.document_id;
  ELSE
    SELECT coalesce(title, file_name, ''), org_id INTO _doc_title, _org_id
      FROM public.documents WHERE id = NEW.document_id;
  END IF;

  _author_name := NEW.user_name;

  _title_ru := 'Новый комментарий к документу';
  _title_en := 'New comment on a document';
  _title_uz := 'Ҳужжатга янги изоҳ';

  _body_ru := coalesce(_author_name, 'Пользователь') || ' оставил комментарий к документу «' || coalesce(_doc_title, '') || '»';
  _body_en := coalesce(_author_name, 'User') || ' commented on document "' || coalesce(_doc_title, '') || '"';
  _body_uz := coalesce(_author_name, 'Фойдаланувчи') || ' «' || coalesce(_doc_title, '') || '» ҳужжатига изоҳ қолдирди';

  IF NEW.parent_comment_id IS NOT NULL THEN
    -- Ответ — уведомляем автора родительского комментария
    SELECT user_id INTO _parent_author_id
      FROM public.document_comments
      WHERE id = NEW.parent_comment_id;

    IF _parent_author_id IS NOT NULL AND _parent_author_id != NEW.user_id THEN
      _title_ru := 'Ответ на ваш комментарий';
      _title_en := 'Reply to your comment';
      _title_uz := 'Изоҳингизга жавоб';

      INSERT INTO public.notifications
        (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
         related_entity_type, related_entity_id)
      VALUES (
        _parent_author_id,
        'document_comment',
        _title_ru, _body_ru, _title_uz, _title_en, _body_uz, _body_en,
        'document', NEW.document_id::text
      );
    END IF;
  ELSE
    -- Корневой комментарий — уведомляем участников-комментаторов организации (кроме автора)
    FOR _recipient IN
      SELECT p.id AS profile_id
        FROM public.profiles p
        WHERE p.organization_id = _org_id
          AND p.id != NEW.user_id
          AND p.role IN ('admin', 'corp_secretary', 'board_member', 'chairman', 'executive')
    LOOP
      INSERT INTO public.notifications
        (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
         related_entity_type, related_entity_id)
      VALUES (
        _recipient.profile_id,
        'document_comment',
        _title_ru, _body_ru, _title_uz, _title_en, _body_uz, _body_en,
        'document', NEW.document_id::text
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_document_comment ON public.document_comments;
CREATE TRIGGER trg_notify_document_comment
  AFTER INSERT ON public.document_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_document_comment();

-- ── 5. Триггер: обновление updated_at ──

CREATE OR REPLACE FUNCTION public.dc_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dc_updated_at ON public.document_comments;
CREATE TRIGGER trg_dc_updated_at
  BEFORE UPDATE ON public.document_comments
  FOR EACH ROW EXECUTE FUNCTION public.dc_set_updated_at();

-- ── 6. Обновить кэш PostgREST ──
NOTIFY pgrst, 'reload schema';
