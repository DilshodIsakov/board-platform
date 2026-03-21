-- ============================================================
-- 049: Add multilingual fields to notifications
-- Title/body in uz and en, populated from source entity where available.
-- ============================================================

-- 1. Add columns
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS title_uz text,
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS body_uz  text,
  ADD COLUMN IF NOT EXISTS body_en  text;

-- Backfill: existing Russian title/body stay as-is; uz/en remain NULL
-- (frontend will auto-translate them on demand)


-- 2. Update notify_task_assigned — use multilingual task title
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _task       record;
  _assignee_user_id uuid;
BEGIN
  SELECT title, title_uz, title_en
    INTO _task
    FROM public.board_tasks WHERE id = NEW.task_id;

  SELECT user_id INTO _assignee_user_id
    FROM public.profiles WHERE id = NEW.assignee_profile_id;

  IF _assignee_user_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
       related_entity_type, related_entity_id)
    VALUES (
      _assignee_user_id,
      'task_assigned',
      'Новое поручение',
      coalesce(_task.title, 'Поручение'),
      'Yangi topshiriq',
      'New Task',
      coalesce(_task.title_uz, _task.title, 'Topshiriq'),
      coalesce(_task.title_en, _task.title, 'Task'),
      'task',
      NEW.task_id::text
    );
  END IF;

  RETURN NEW;
END;
$$;


-- 3. Update notify_task_status_changed — use multilingual task title + status
CREATE OR REPLACE FUNCTION public.notify_task_status_changed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec            record;
  _task           record;
  _status_label_ru text;
  _status_label_uz text;
  _status_label_en text;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT title, title_uz, title_en
    INTO _task
    FROM public.board_tasks WHERE id = NEW.id;

  _status_label_ru := CASE NEW.status
    WHEN 'open'        THEN 'Открыто'
    WHEN 'in_progress' THEN 'В работе'
    WHEN 'done'        THEN 'Выполнено'
    WHEN 'canceled'    THEN 'Отменено'
    WHEN 'overdue'     THEN 'Просрочено'
    ELSE NEW.status
  END;

  _status_label_uz := CASE NEW.status
    WHEN 'open'        THEN 'Ochiq'
    WHEN 'in_progress' THEN 'Jarayonda'
    WHEN 'done'        THEN 'Bajarildi'
    WHEN 'canceled'    THEN 'Bekor qilindi'
    WHEN 'overdue'     THEN 'Muddati o''tdi'
    ELSE NEW.status
  END;

  _status_label_en := CASE NEW.status
    WHEN 'open'        THEN 'Open'
    WHEN 'in_progress' THEN 'In Progress'
    WHEN 'done'        THEN 'Done'
    WHEN 'canceled'    THEN 'Canceled'
    WHEN 'overdue'     THEN 'Overdue'
    ELSE NEW.status
  END;

  FOR _rec IN
    SELECT p.user_id
    FROM public.board_task_assignees bta
    JOIN public.profiles p ON p.id = bta.assignee_profile_id
    WHERE bta.task_id = NEW.id
  LOOP
    IF _rec.user_id <> auth.uid() THEN
      INSERT INTO public.notifications
        (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
         related_entity_type, related_entity_id)
      VALUES (
        _rec.user_id,
        'task_status_changed',
        'Статус поручения изменён',
        coalesce(_task.title, '') || ' → ' || _status_label_ru,
        'Topshiriq holati o''zgardi',
        'Task status changed',
        coalesce(_task.title_uz, _task.title, '') || ' → ' || _status_label_uz,
        coalesce(_task.title_en, _task.title, '') || ' → ' || _status_label_en,
        'task',
        NEW.id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- 4. Update notify_task_comment
CREATE OR REPLACE FUNCTION public.notify_task_comment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec            record;
  _task           record;
  _author_name    text;
  _author_user_id uuid;
BEGIN
  SELECT title, title_uz, title_en
    INTO _task
    FROM public.board_tasks WHERE id = NEW.task_id;

  SELECT full_name, user_id
    INTO _author_name, _author_user_id
    FROM public.profiles WHERE id = NEW.author_profile_id;

  FOR _rec IN
    SELECT DISTINCT p.user_id
    FROM public.board_task_assignees bta
    JOIN public.profiles p ON p.id = bta.assignee_profile_id
    WHERE bta.task_id = NEW.task_id
  LOOP
    IF _rec.user_id <> _author_user_id THEN
      INSERT INTO public.notifications
        (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
         related_entity_type, related_entity_id)
      VALUES (
        _rec.user_id,
        'task_comment',
        'Новый комментарий',
        coalesce(_author_name, 'Пользователь') || ': ' || left(NEW.body, 100),
        'Yangi izoh',
        'New comment',
        coalesce(_author_name, 'Foydalanuvchi') || ': ' || left(NEW.body, 100),
        coalesce(_author_name, 'User') || ': ' || left(NEW.body, 100),
        'task',
        NEW.task_id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- 5. Update notify_meeting_invitation — use multilingual meeting title
CREATE OR REPLACE FUNCTION public.notify_meeting_invitation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
BEGIN
  IF NEW.status <> 'scheduled' THEN RETURN NEW; END IF;

  FOR _rec IN
    SELECT user_id FROM public.profiles WHERE org_id = NEW.org_id
  LOOP
    IF _rec.user_id <> auth.uid() THEN
      INSERT INTO public.notifications
        (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
         related_entity_type, related_entity_id)
      VALUES (
        _rec.user_id,
        'meeting_invitation',
        'Новое заседание',
        coalesce(NEW.title_ru, NEW.title, 'Заседание'),
        'Yangi majlis',
        'New Meeting',
        coalesce(NEW.title_uz, NEW.title, 'Majlis'),
        coalesce(NEW.title_en, NEW.title, 'Meeting'),
        'meeting',
        NEW.id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- 6. Update notify_video_conference_activated — use multilingual meeting title
CREATE OR REPLACE FUNCTION public.notify_video_conference_activated()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
BEGIN
  -- Only fire when video_conference_enabled goes from false/null → true
  IF NOT (COALESCE(OLD.video_conference_enabled, false) = false
          AND NEW.video_conference_enabled = true) THEN
    RETURN NEW;
  END IF;

  FOR _rec IN
    SELECT user_id FROM public.profiles WHERE org_id = NEW.org_id
  LOOP
    INSERT INTO public.notifications
      (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
       related_entity_type, related_entity_id)
    VALUES (
      _rec.user_id,
      'meeting_video_conference_activated',
      'Видеоконференция активирована',
      'Для заседания «' || coalesce(NEW.title_ru, NEW.title, '') || '» активирована видеоконференция. Вы можете подключиться по кнопке в карточке заседания.',
      'Видеоконференция фаоллаштирилди',
      'Video conference activated',
      '«' || coalesce(NEW.title_uz, NEW.title, '') || '» мажлиси учун видеоконференция фаоллаштирилди. Мажлис карточкасидаги тугма орқали уланишингиз мумкин.',
      'Video conference for "' || coalesce(NEW.title_en, NEW.title, '') || '" has been activated. You can join using the button on the meeting card.',
      'ns_meeting',
      NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;
