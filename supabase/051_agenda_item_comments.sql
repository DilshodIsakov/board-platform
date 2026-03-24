-- ============================================================
-- Migration 051: Обсуждение вопросов повестки (Agenda Item Comments)
-- Таблица для комментариев к вопросам повестки заседаний НС
-- Идемпотентная: безопасно запускать повторно
-- ============================================================

-- ── 0. Extend notification_type enum ──
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'agenda_item_comment';

-- ── 1. Таблица agenda_item_comments ──

CREATE TABLE IF NOT EXISTS public.agenda_item_comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  meeting_id        uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  agenda_item_id    uuid NOT NULL REFERENCES public.agenda_items(id) ON DELETE CASCADE,

  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name         text NOT NULL DEFAULT '',
  user_role         text NOT NULL DEFAULT '',

  parent_comment_id uuid REFERENCES public.agenda_item_comments(id) ON DELETE CASCADE,

  content           text NOT NULL DEFAULT '',

  is_deleted        boolean NOT NULL DEFAULT false
);

-- ── 2. Индексы ──

CREATE INDEX IF NOT EXISTS idx_aic_agenda_item_id    ON public.agenda_item_comments(agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_aic_meeting_id        ON public.agenda_item_comments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_aic_parent_comment_id ON public.agenda_item_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_aic_created_at        ON public.agenda_item_comments(created_at);

-- ── 3. RLS ──

ALTER TABLE public.agenda_item_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: все участники одной организации (те же, кто видят заседания)
DROP POLICY IF EXISTS "aic_select" ON public.agenda_item_comments;
CREATE POLICY "aic_select" ON public.agenda_item_comments
  FOR SELECT TO authenticated
  USING (
    meeting_id IN (
      SELECT m.id FROM public.meetings m
      WHERE m.organization_id = public.get_my_org_id()
    )
  );

-- INSERT: только board_member, corp_secretary, admin, chairman
DROP POLICY IF EXISTS "aic_insert" ON public.agenda_item_comments;
CREATE POLICY "aic_insert" ON public.agenda_item_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.get_my_role() IN ('admin', 'corp_secretary', 'board_member', 'chairman')
  );

-- UPDATE: только автор или admin
DROP POLICY IF EXISTS "aic_update" ON public.agenda_item_comments;
CREATE POLICY "aic_update" ON public.agenda_item_comments
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_my_role() = 'admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.get_my_role() = 'admin'
  );

-- DELETE: только автор или admin
DROP POLICY IF EXISTS "aic_delete" ON public.agenda_item_comments;
CREATE POLICY "aic_delete" ON public.agenda_item_comments
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_my_role() = 'admin'
  );

-- ── 4. Триггер: уведомления при добавлении комментария ──

CREATE OR REPLACE FUNCTION public.notify_agenda_item_comment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _meeting     record;
  _agenda      record;
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
  -- Получаем данные заседания
  SELECT id, title, title_ru, title_en, title_uz, organization_id
    INTO _meeting
    FROM public.meetings WHERE id = NEW.meeting_id;

  -- Получаем данные вопроса повестки
  SELECT id, title, title_ru, title_en, title_uz
    INTO _agenda
    FROM public.agenda_items WHERE id = NEW.agenda_item_id;

  _author_name := NEW.user_name;

  _title_ru := 'Новый комментарий';
  _title_en := 'New comment';
  _title_uz := 'Янги изоҳ';

  _body_ru := coalesce(_author_name, 'Пользователь') || ' оставил комментарий к вопросу «' || coalesce(_agenda.title_ru, _agenda.title, '') || '»';
  _body_en := coalesce(_author_name, 'User') || ' commented on agenda item "' || coalesce(_agenda.title_en, _agenda.title, '') || '"';
  _body_uz := coalesce(_author_name, 'Фойдаланувчи') || ' «' || coalesce(_agenda.title_uz, _agenda.title, '') || '» саволига изоҳ қолдирди';

  -- Если это ответ — уведомляем автора родительского комментария
  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT user_id INTO _parent_author_id
      FROM public.agenda_item_comments
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
        'agenda_item_comment',
        _title_ru, _body_ru, _title_uz, _title_en, _body_uz, _body_en,
        'ns_meeting', NEW.meeting_id::text
      );
    END IF;
  ELSE
    -- Уведомляем всех участников организации (кроме автора) с ролями board_member, admin, corp_secretary, chairman
    FOR _recipient IN
      SELECT p.id AS profile_id
        FROM public.profiles p
        WHERE p.organization_id = _meeting.organization_id
          AND p.id != NEW.user_id
          AND p.role IN ('admin', 'corp_secretary', 'board_member', 'chairman')
    LOOP
      INSERT INTO public.notifications
        (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
         related_entity_type, related_entity_id)
      VALUES (
        _recipient.profile_id,
        'agenda_item_comment',
        _title_ru, _body_ru, _title_uz, _title_en, _body_uz, _body_en,
        'ns_meeting', NEW.meeting_id::text
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_agenda_item_comment ON public.agenda_item_comments;
CREATE TRIGGER trg_notify_agenda_item_comment
  AFTER INSERT ON public.agenda_item_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_agenda_item_comment();

-- ── 5. Триггер: обновление updated_at ──

CREATE OR REPLACE FUNCTION public.aic_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aic_updated_at ON public.agenda_item_comments;
CREATE TRIGGER trg_aic_updated_at
  BEFORE UPDATE ON public.agenda_item_comments
  FOR EACH ROW EXECUTE FUNCTION public.aic_set_updated_at();

-- ── 6. Обновить кэш PostgREST ──
NOTIFY pgrst, 'reload schema';
