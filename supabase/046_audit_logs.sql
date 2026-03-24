-- ============================================================
-- Migration 046: Журнал действий пользователей (Audit Log)
-- Append-only таблица для логирования всех действий в системе
-- Идемпотентная: безопасно запускать повторно
-- ============================================================

-- ── 0. Очистка: удаляем триггеры от предыдущей попытки (если остались) ──

DROP TRIGGER IF EXISTS trg_audit_meetings ON public.meetings;
DROP TRIGGER IF EXISTS trg_audit_agenda_items ON public.agenda_items;
DROP TRIGGER IF EXISTS trg_audit_documents ON public.documents;
DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
DROP TRIGGER IF EXISTS trg_audit_tasks ON public.board_tasks;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='votes') THEN
    DROP TRIGGER IF EXISTS trg_audit_votes ON public.votes;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='votings') THEN
    DROP TRIGGER IF EXISTS trg_audit_votings ON public.votings;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='board_work_plans') THEN
    DROP TRIGGER IF EXISTS trg_audit_work_plans ON public.board_work_plans;
  END IF;
END $$;

-- Удаляем функции от предыдущей попытки
DROP FUNCTION IF EXISTS public.audit_meeting_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_agenda_item_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_vote_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_document_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_profile_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_voting_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_work_plan_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_task_changes() CASCADE;
DROP FUNCTION IF EXISTS public.log_audit_event(text,text,text,text,text,uuid,uuid,text,text,jsonb,text) CASCADE;

-- ── 1. Создаём таблицу audit_logs ──

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Кто выполнил действие
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name       text,
  user_email      text,
  user_role       text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,

  -- Что произошло
  action_type     text NOT NULL,
  action_label    text,

  -- Над чем произошло
  entity_type     text,
  entity_id       text,
  entity_title    text,

  -- Связи (опциональные)
  meeting_id      uuid,
  agenda_item_id  uuid,
  file_id         text,
  file_language   text,

  -- Дополнительные данные
  metadata        jsonb DEFAULT '{}'::jsonb,
  ip_address      text,
  user_agent      text,
  status          text NOT NULL DEFAULT 'success'
);

-- ── 2. Индексы ──

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON public.audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_meeting_id  ON public.audit_logs(meeting_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id      ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status      ON public.audit_logs(status);

-- ── 3. RLS ──

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'corp_secretary')
  );

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── 4. Функция-хелпер для логирования (SECURITY DEFINER) ──

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action_type text,
  p_action_label text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_entity_title text DEFAULT NULL,
  p_meeting_id uuid DEFAULT NULL,
  p_agenda_item_id uuid DEFAULT NULL,
  p_file_id text DEFAULT NULL,
  p_file_language text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_status text DEFAULT 'success'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _user_id uuid;
  _user_name text;
  _user_email text;
  _user_role text;
  _org_id uuid;
BEGIN
  _user_id := auth.uid();

  SELECT p.full_name, p.email, p.role::text, p.organization_id
  INTO _user_name, _user_email, _user_role, _org_id
  FROM public.profiles p
  WHERE p.id = _user_id
  LIMIT 1;

  INSERT INTO public.audit_logs (
    user_id, user_name, user_email, user_role, organization_id,
    action_type, action_label,
    entity_type, entity_id, entity_title,
    meeting_id, agenda_item_id, file_id, file_language,
    metadata, status
  ) VALUES (
    _user_id, _user_name, _user_email, _user_role, _org_id,
    p_action_type, p_action_label,
    p_entity_type, p_entity_id, p_entity_title,
    p_meeting_id, p_agenda_item_id, p_file_id, p_file_language,
    p_metadata, p_status
  );
END;
$$;

-- ── 5. Триггер: заседания ──

CREATE OR REPLACE FUNCTION public.audit_meeting_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _title text; _meta jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _title := coalesce(NEW.title, NEW.title_ru, NEW.title_en, NEW.title_uz);
    PERFORM public.log_audit_event('meeting_create','Создание заседания','meeting',NEW.id::text,_title,NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _title := coalesce(NEW.title, NEW.title_ru, NEW.title_en, NEW.title_uz);
    _meta := jsonb_build_object('old_status',OLD.status,'new_status',NEW.status);
    PERFORM public.log_audit_event('meeting_update','Редактирование заседания','meeting',NEW.id::text,_title,NEW.id,NULL,NULL,NULL,_meta);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _title := coalesce(OLD.title, OLD.title_ru, OLD.title_en, OLD.title_uz);
    PERFORM public.log_audit_event('meeting_delete','Удаление заседания','meeting',OLD.id::text,_title,OLD.id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_meetings
  AFTER INSERT OR UPDATE OR DELETE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.audit_meeting_changes();

-- ── 6. Триггер: вопросы повестки ──

CREATE OR REPLACE FUNCTION public.audit_agenda_item_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _title text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _title := coalesce(NEW.title, NEW.title_ru, NEW.title_en, NEW.title_uz);
    PERFORM public.log_audit_event('agenda_item_create','Создание вопроса повестки','agenda_item',NEW.id::text,_title,NEW.meeting_id,NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _title := coalesce(NEW.title, NEW.title_ru, NEW.title_en, NEW.title_uz);
    PERFORM public.log_audit_event('agenda_item_update','Редактирование вопроса повестки','agenda_item',NEW.id::text,_title,NEW.meeting_id,NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _title := coalesce(OLD.title, OLD.title_ru, OLD.title_en, OLD.title_uz);
    PERFORM public.log_audit_event('agenda_item_delete','Удаление вопроса повестки','agenda_item',OLD.id::text,_title,OLD.meeting_id,OLD.id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_agenda_items
  AFTER INSERT OR UPDATE OR DELETE ON public.agenda_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_agenda_item_changes();

-- ── 7. Триггер: голоса (votes) ──

CREATE OR REPLACE FUNCTION public.audit_vote_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _voting_title text; _meeting_id uuid; _agenda_id uuid; _meta jsonb;
BEGIN
  SELECT v.title, v.meeting_id, v.agenda_item_id
  INTO _voting_title, _meeting_id, _agenda_id
  FROM public.votings v WHERE v.id = NEW.voting_id;

  IF TG_OP = 'INSERT' THEN
    _meta := jsonb_build_object('vote_value', NEW.value);
    PERFORM public.log_audit_event('vote_cast','Голосование','vote',NEW.id::text,_voting_title,_meeting_id,_agenda_id,NULL,NULL,_meta);
  ELSIF TG_OP = 'UPDATE' AND OLD.value IS DISTINCT FROM NEW.value THEN
    _meta := jsonb_build_object('old_vote',OLD.value,'new_vote',NEW.value);
    PERFORM public.log_audit_event('vote_change','Изменение голоса','vote',NEW.id::text,_voting_title,_meeting_id,_agenda_id,NULL,NULL,_meta);
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='votes') THEN
    EXECUTE 'CREATE TRIGGER trg_audit_votes AFTER INSERT OR UPDATE ON public.votes FOR EACH ROW EXECUTE FUNCTION public.audit_vote_changes()';
  END IF;
END $$;

-- ── 8. Триггер: документы ──

CREATE OR REPLACE FUNCTION public.audit_document_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _meta jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _meta := jsonb_build_object('file_name',NEW.name,'language',NEW.language);
    PERFORM public.log_audit_event('file_upload','Загрузка файла','file',NEW.id::text,NEW.name,NEW.meeting_id,NEW.agenda_item_id,NEW.id::text,NEW.language,_meta);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _meta := jsonb_build_object('file_name',OLD.name,'language',OLD.language);
    PERFORM public.log_audit_event('file_delete','Удаление файла','file',OLD.id::text,OLD.name,OLD.meeting_id,OLD.agenda_item_id,OLD.id::text,OLD.language,_meta);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_documents
  AFTER INSERT OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_document_changes();

-- ── 9. Триггер: изменение ролей ──

CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _meta jsonb;
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    _meta := jsonb_build_object('old_role',OLD.role::text,'new_role',NEW.role::text);
    PERFORM public.log_audit_event('user_role_change','Изменение роли пользователя','user',NEW.id::text,NEW.full_name,NULL,NULL,NULL,NULL,_meta);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_profiles
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profile_changes();

-- ── 10. Триггер: голосования (votings) ──

CREATE OR REPLACE FUNCTION public.audit_voting_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _meta jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event('voting_create','Создание голосования','voting',NEW.id::text,NEW.title,NEW.meeting_id,NEW.agenda_item_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    _meta := jsonb_build_object('old_status',OLD.status,'new_status',NEW.status);
    PERFORM public.log_audit_event('voting_status_change','Изменение статуса голосования','voting',NEW.id::text,NEW.title,NEW.meeting_id,NEW.agenda_item_id,NULL,NULL,_meta);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='votings') THEN
    EXECUTE 'CREATE TRIGGER trg_audit_votings AFTER INSERT OR UPDATE ON public.votings FOR EACH ROW EXECUTE FUNCTION public.audit_voting_changes()';
  END IF;
END $$;

-- ── 11. Триггер: план работ ──

CREATE OR REPLACE FUNCTION public.audit_work_plan_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _title text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _title := coalesce(NEW.title, NEW.title_ru, '');
    PERFORM public.log_audit_event('work_plan_create','Создание записи плана работ','work_plan',NEW.id::text,_title);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _title := coalesce(NEW.title, NEW.title_ru, '');
    PERFORM public.log_audit_event('work_plan_update','Редактирование записи плана работ','work_plan',NEW.id::text,_title);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _title := coalesce(OLD.title, OLD.title_ru, '');
    PERFORM public.log_audit_event('work_plan_delete','Удаление записи плана работ','work_plan',OLD.id::text,_title);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='board_work_plans') THEN
    EXECUTE 'CREATE TRIGGER trg_audit_work_plans AFTER INSERT OR UPDATE OR DELETE ON public.board_work_plans FOR EACH ROW EXECUTE FUNCTION public.audit_work_plan_changes()';
  END IF;
END $$;

-- ── 12. Триггер: поручения ──

CREATE OR REPLACE FUNCTION public.audit_task_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _meta jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event('task_create','Создание поручения','task',NEW.id::text,NEW.title);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _meta := jsonb_build_object('old_status',OLD.status,'new_status',NEW.status);
    PERFORM public.log_audit_event('task_update','Редактирование поручения','task',NEW.id::text,NEW.title,NULL,NULL,NULL,NULL,_meta);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit_event('task_delete','Удаление поручения','task',OLD.id::text,OLD.title);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.board_tasks
  FOR EACH ROW EXECUTE FUNCTION public.audit_task_changes();

-- ── 13. Обновить кэш PostgREST ──
NOTIFY pgrst, 'reload schema';
