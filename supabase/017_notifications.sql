-- ============================================================
-- Board Platform — Notifications
-- Запускать ПОСЛЕ schema.sql, 004_chat.sql, 014_board_tasks.sql, 015_chat_groups.sql
-- ============================================================

-- 1. ТАБЛИЦА notifications
-- ============================================================

CREATE TYPE public.notification_type AS ENUM (
  'task_assigned',
  'task_status_changed',
  'task_comment',
  'personal_message',
  'group_message',
  'meeting_invitation'
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id        uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                notification_type NOT NULL,
  title               text         NOT NULL,
  body                text         NOT NULL DEFAULT '',
  is_read             boolean      NOT NULL DEFAULT false,
  related_entity_type text,        -- 'task', 'message', 'group_message', 'meeting'
  related_entity_id   text,        -- uuid или bigint в виде текста
  created_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: только свои уведомления
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

-- UPDATE: только свои (пометить прочитанным)
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (is_read = true);

-- INSERT: запрещён клиенту — только триггеры (SECURITY DEFINER)
-- Нет policy для INSERT = клиент не может вставлять напрямую

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;


-- 2. ТРИГГЕРЫ (все SECURITY DEFINER — обходят RLS)
-- ============================================================

-- 2.1 task_assigned: при добавлении исполнителя в поручение
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _task_title text;
  _assignee_user_id uuid;
BEGIN
  SELECT title INTO _task_title FROM public.board_tasks WHERE id = NEW.task_id;
  SELECT user_id INTO _assignee_user_id FROM public.profiles WHERE id = NEW.assignee_profile_id;

  IF _assignee_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
    VALUES (
      _assignee_user_id,
      'task_assigned',
      'Новое поручение',
      coalesce(_task_title, 'Поручение'),
      'task',
      NEW.task_id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_assigned
  AFTER INSERT ON public.board_task_assignees
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_assigned();


-- 2.2 task_status_changed: при смене статуса поручения
CREATE OR REPLACE FUNCTION public.notify_task_status_changed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
  _status_label text;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  _status_label := CASE NEW.status
    WHEN 'open' THEN 'Открыто'
    WHEN 'in_progress' THEN 'В работе'
    WHEN 'done' THEN 'Выполнено'
    WHEN 'canceled' THEN 'Отменено'
    WHEN 'overdue' THEN 'Просрочено'
    ELSE NEW.status
  END;

  FOR _rec IN
    SELECT p.user_id
    FROM public.board_task_assignees bta
    JOIN public.profiles p ON p.id = bta.assignee_profile_id
    WHERE bta.task_id = NEW.id
  LOOP
    -- Не уведомлять инициатора изменения
    IF _rec.user_id <> auth.uid() THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.user_id,
        'task_status_changed',
        'Статус поручения изменён',
        coalesce(NEW.title, '') || ' → ' || _status_label,
        'task',
        NEW.id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_status_changed
  AFTER UPDATE ON public.board_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_status_changed();


-- 2.3 task_comment: при добавлении комментария к поручению
CREATE OR REPLACE FUNCTION public.notify_task_comment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
  _task_title text;
  _author_name text;
  _author_user_id uuid;
BEGIN
  SELECT title INTO _task_title FROM public.board_tasks WHERE id = NEW.task_id;
  SELECT full_name, user_id INTO _author_name, _author_user_id FROM public.profiles WHERE id = NEW.author_profile_id;

  FOR _rec IN
    SELECT DISTINCT p.user_id
    FROM public.board_task_assignees bta
    JOIN public.profiles p ON p.id = bta.assignee_profile_id
    WHERE bta.task_id = NEW.task_id
  LOOP
    IF _rec.user_id <> _author_user_id THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.user_id,
        'task_comment',
        'Новый комментарий',
        coalesce(_author_name, 'Пользователь') || ': ' || left(NEW.body, 100),
        'task',
        NEW.task_id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_comment
  AFTER INSERT ON public.board_task_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_comment();


-- 2.4 personal_message: при отправке личного сообщения
CREATE OR REPLACE FUNCTION public.notify_personal_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _sender_name text;
  _receiver_user_id uuid;
  _body_text text;
BEGIN
  SELECT full_name INTO _sender_name FROM public.profiles WHERE id = NEW.sender_id;
  SELECT user_id INTO _receiver_user_id FROM public.profiles WHERE id = NEW.receiver_id;

  -- Используем имя файла если есть файл, иначе текст сообщения
  _body_text := CASE
    WHEN NEW.file_name IS NOT NULL THEN NEW.file_name
    ELSE left(NEW.content, 100)
  END;

  IF _receiver_user_id IS NOT NULL AND trim(_body_text) <> '' THEN
    INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
    VALUES (
      _receiver_user_id,
      'personal_message',
      'Сообщение от ' || coalesce(_sender_name, 'Пользователь'),
      _body_text,
      'message',
      NEW.id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_personal_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_personal_message();


-- 2.5 group_message: при отправке сообщения в группу
CREATE OR REPLACE FUNCTION public.notify_group_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
  _sender_name text;
  _group_name text;
  _sender_user_id uuid;
  _body_text text;
BEGIN
  SELECT full_name, user_id INTO _sender_name, _sender_user_id FROM public.profiles WHERE id = NEW.sender_id;
  SELECT name INTO _group_name FROM public.chat_groups WHERE id = NEW.group_id;

  -- Используем имя файла если есть файл, иначе текст сообщения
  _body_text := CASE
    WHEN NEW.file_name IS NOT NULL THEN NEW.file_name
    ELSE left(NEW.content, 100)
  END;

  IF trim(_body_text) <> '' THEN
    FOR _rec IN
      SELECT p.user_id
      FROM public.chat_group_members cgm
      JOIN public.profiles p ON p.id = cgm.profile_id
      WHERE cgm.group_id = NEW.group_id
    LOOP
      IF _rec.user_id <> _sender_user_id THEN
        INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
        VALUES (
          _rec.user_id,
          'group_message',
          _group_name || ': ' || coalesce(_sender_name, 'Пользователь'),
          _body_text,
          'group_message',
          NEW.group_id::text
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_group_message
  AFTER INSERT ON public.chat_group_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_group_message();


-- 2.6 meeting_invitation: при создании запланированного заседания
CREATE OR REPLACE FUNCTION public.notify_meeting_invitation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
BEGIN
  IF NEW.status <> 'scheduled' THEN
    RETURN NEW;
  END IF;

  FOR _rec IN
    SELECT user_id FROM public.profiles WHERE org_id = NEW.org_id
  LOOP
    IF _rec.user_id <> auth.uid() THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.user_id,
        'meeting_invitation',
        'Новое заседание',
        coalesce(NEW.title, 'Заседание'),
        'meeting',
        NEW.id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_meeting_invitation
  AFTER INSERT ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_meeting_invitation();
