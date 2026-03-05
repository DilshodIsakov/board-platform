-- ============================================================
-- Фикс триггеров уведомлений: profiles.user_id → profiles.id,
-- meetings.org_id → meetings.organization_id
-- Запускать если 017_notifications.sql уже применён
-- ============================================================

-- 2.1 task_assigned
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _task_title text;
  _assignee_id uuid;
BEGIN
  SELECT title INTO _task_title FROM public.board_tasks WHERE id = NEW.task_id;
  -- profiles.id = auth.uid(), нет отдельного user_id
  _assignee_id := NEW.assignee_profile_id;

  IF _assignee_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
    VALUES (
      _assignee_id,
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

-- 2.2 task_status_changed
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
    SELECT p.id AS profile_id
    FROM public.board_task_assignees bta
    JOIN public.profiles p ON p.id = bta.assignee_profile_id
    WHERE bta.task_id = NEW.id
  LOOP
    IF _rec.profile_id <> auth.uid() THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.profile_id,
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

-- 2.3 task_comment
CREATE OR REPLACE FUNCTION public.notify_task_comment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
  _task_title text;
  _author_name text;
BEGIN
  SELECT title INTO _task_title FROM public.board_tasks WHERE id = NEW.task_id;
  SELECT full_name INTO _author_name FROM public.profiles WHERE id = NEW.author_profile_id;

  FOR _rec IN
    SELECT DISTINCT p.id AS profile_id
    FROM public.board_task_assignees bta
    JOIN public.profiles p ON p.id = bta.assignee_profile_id
    WHERE bta.task_id = NEW.task_id
  LOOP
    IF _rec.profile_id <> NEW.author_profile_id THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.profile_id,
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

-- 2.4 personal_message
CREATE OR REPLACE FUNCTION public.notify_personal_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _sender_name text;
BEGIN
  SELECT full_name INTO _sender_name FROM public.profiles WHERE id = NEW.sender_id;

  -- receiver_id уже является profile.id = auth.uid()
  IF NEW.receiver_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
    VALUES (
      NEW.receiver_id,
      'personal_message',
      'Сообщение от ' || coalesce(_sender_name, 'Пользователь'),
      left(NEW.body, 100),
      'message',
      NEW.id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 2.5 group_message
CREATE OR REPLACE FUNCTION public.notify_group_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
  _sender_name text;
  _group_name text;
BEGIN
  SELECT full_name INTO _sender_name FROM public.profiles WHERE id = NEW.sender_id;
  SELECT name INTO _group_name FROM public.chat_groups WHERE id = NEW.group_id;

  FOR _rec IN
    SELECT p.id AS profile_id
    FROM public.chat_group_members cgm
    JOIN public.profiles p ON p.id = cgm.profile_id
    WHERE cgm.group_id = NEW.group_id
  LOOP
    IF _rec.profile_id <> NEW.sender_id THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.profile_id,
        'group_message',
        _group_name || ': ' || coalesce(_sender_name, 'Пользователь'),
        left(NEW.content, 100),
        'group_message',
        NEW.group_id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 2.6 meeting_invitation
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
    SELECT id AS profile_id FROM public.profiles WHERE organization_id = NEW.organization_id
  LOOP
    IF _rec.profile_id <> auth.uid() THEN
      INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        _rec.profile_id,
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
