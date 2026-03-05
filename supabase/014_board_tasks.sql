-- Board Platform — Поручения Наблюдательного совета
-- Запускать ПОСЛЕ schema.sql, 002_meetings.sql, 003_agenda_decisions.sql в Supabase SQL Editor

-- ============================================================
-- 1. ТАБЛИЦЫ
-- ============================================================

-- Поручения
CREATE TABLE IF NOT EXISTS public.board_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  title         text NOT NULL,
  description   text,
  priority      text NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low','medium','high')),
  status        text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','done','canceled','overdue')),
  due_date      date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  related_meeting_id     uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  related_agenda_item_id uuid REFERENCES public.agenda_items(id) ON DELETE SET NULL
);

-- Назначения (многие-ко-многим)
CREATE TABLE IF NOT EXISTS public.board_task_assignees (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id             uuid NOT NULL REFERENCES public.board_tasks(id) ON DELETE CASCADE,
  assignee_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_in_task        text NOT NULL DEFAULT 'executor'
                        CHECK (role_in_task IN ('executor','co_executor','controller')),
  UNIQUE(task_id, assignee_profile_id)
);

-- Комментарии
CREATE TABLE IF NOT EXISTS public.board_task_comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid NOT NULL REFERENCES public.board_tasks(id) ON DELETE CASCADE,
  author_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body              text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Вложения
CREATE TABLE IF NOT EXISTS public.board_task_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES public.board_tasks(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  file_name   text NOT NULL,
  file_path   text NOT NULL,
  mime_type   text,
  file_size   bigint,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. ТРИГГЕР updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_board_tasks_updated_at ON public.board_tasks;
CREATE TRIGGER trg_board_tasks_updated_at
  BEFORE UPDATE ON public.board_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. ИНДЕКСЫ
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_board_tasks_org       ON public.board_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_board_tasks_status    ON public.board_tasks(status);
CREATE INDEX IF NOT EXISTS idx_board_tasks_due_date  ON public.board_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_board_tasks_created_by ON public.board_tasks(created_by);

CREATE INDEX IF NOT EXISTS idx_bta_task_id           ON public.board_task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_bta_assignee          ON public.board_task_assignees(assignee_profile_id);

CREATE INDEX IF NOT EXISTS idx_btc_task_id           ON public.board_task_comments(task_id);

CREATE INDEX IF NOT EXISTS idx_btatt_task_id         ON public.board_task_attachments(task_id);

-- ============================================================
-- 4. RLS
-- ============================================================

ALTER TABLE public.board_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_task_attachments ENABLE ROW LEVEL SECURITY;

-- ---- board_tasks ----

CREATE POLICY "board_tasks_select" ON public.board_tasks
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id());

CREATE POLICY "board_tasks_insert" ON public.board_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin','chairman','board_member')
  );

CREATE POLICY "board_tasks_update" ON public.board_tasks
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    AND (
      created_by = auth.uid()
      OR public.get_my_role() IN ('admin','chairman')
    )
  )
  WITH CHECK (
    organization_id = public.get_my_org_id()
  );

CREATE POLICY "board_tasks_delete" ON public.board_tasks
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin','chairman')
  );

-- ---- board_task_assignees ----

CREATE POLICY "bta_select" ON public.board_task_assignees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "bta_insert" ON public.board_task_assignees
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_my_role() IN ('admin','chairman')
    AND EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "bta_delete" ON public.board_task_assignees
  FOR DELETE TO authenticated
  USING (
    public.get_my_role() IN ('admin','chairman')
    AND EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

-- ---- board_task_comments ----

CREATE POLICY "btc_select" ON public.board_task_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "btc_insert" ON public.board_task_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "btc_delete" ON public.board_task_comments
  FOR DELETE TO authenticated
  USING (
    author_profile_id = auth.uid()
    OR public.get_my_role() IN ('admin','chairman')
  );

-- ---- board_task_attachments ----

CREATE POLICY "btatt_select" ON public.board_task_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "btatt_insert" ON public.board_task_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "btatt_delete" ON public.board_task_attachments
  FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.get_my_role() IN ('admin','chairman')
  );

-- ============================================================
-- 5. RPC: set_task_status (для исполнителей)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_task_status(p_task_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Проверка валидности статуса
  IF p_status NOT IN ('open','in_progress','done','canceled','overdue') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  -- Проверка что пользователь — assignee или создатель или admin/chairman
  IF NOT EXISTS (
    SELECT 1 FROM public.board_task_assignees
    WHERE task_id = p_task_id AND assignee_profile_id = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.board_tasks
    WHERE id = p_task_id AND created_by = auth.uid()
  )
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) NOT IN ('admin','chairman')
  THEN
    RAISE EXCEPTION 'Access denied: you are not an assignee, creator, or admin';
  END IF;

  -- Проверка что задача принадлежит организации пользователя
  IF NOT EXISTS (
    SELECT 1 FROM public.board_tasks t
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE t.id = p_task_id AND t.organization_id = p.organization_id
  ) THEN
    RAISE EXCEPTION 'Task not found in your organization';
  END IF;

  UPDATE public.board_tasks
  SET status = p_status, updated_at = now()
  WHERE id = p_task_id;
END;
$$;

-- ============================================================
-- 6. STORAGE BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('board-task-files', 'board-task-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "btf_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'board-task-files');

CREATE POLICY "btf_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'board-task-files');

CREATE POLICY "btf_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'board-task-files');

-- ============================================================
-- 7. SEED: тестовые поручения
-- ============================================================

DO $$
DECLARE
  v_org_id uuid;
  v_chairman uuid;
  v_admin uuid;
  v_exec1 uuid;
  v_exec2 uuid;
  v_bm1 uuid;
  v_bm2 uuid;
  v_task1 uuid;
  v_task2 uuid;
  v_task3 uuid;
  v_task4 uuid;
  v_task5 uuid;
BEGIN
  -- Получить org (первая организация)
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'No active organization'; END IF;

  -- Получить профили
  SELECT id INTO v_chairman FROM public.profiles WHERE organization_id = v_org_id AND role = 'chairman' LIMIT 1;
  SELECT id INTO v_admin    FROM public.profiles WHERE organization_id = v_org_id AND role = 'admin' LIMIT 1;
  SELECT id INTO v_exec1    FROM public.profiles WHERE organization_id = v_org_id AND role = 'executive' LIMIT 1;
  SELECT id INTO v_exec2    FROM public.profiles WHERE organization_id = v_org_id AND role = 'executive' OFFSET 1 LIMIT 1;
  SELECT id INTO v_bm1      FROM public.profiles WHERE organization_id = v_org_id AND role = 'board_member' LIMIT 1;
  SELECT id INTO v_bm2      FROM public.profiles WHERE organization_id = v_org_id AND role = 'board_member' OFFSET 1 LIMIT 1;

  -- Поручение 1: просроченное
  INSERT INTO public.board_tasks (id, organization_id, created_by, title, description, priority, status, due_date)
  VALUES (gen_random_uuid(), v_org_id, v_chairman,
    'Подготовить отчёт о финансовых результатах за Q4',
    'Необходимо подготовить сводный отчёт по финансовым результатам за 4-й квартал для рассмотрения на заседании НС.',
    'high', 'overdue', CURRENT_DATE - INTERVAL '10 days')
  RETURNING id INTO v_task1;

  -- Поручение 2: в работе
  INSERT INTO public.board_tasks (id, organization_id, created_by, title, description, priority, status, due_date)
  VALUES (gen_random_uuid(), v_org_id, v_chairman,
    'Разработать стратегию цифровой трансформации',
    'Подготовить дорожную карту цифровой трансформации на 2026-2028 гг. с учётом текущей ИТ-инфраструктуры.',
    'high', 'in_progress', CURRENT_DATE + INTERVAL '14 days')
  RETURNING id INTO v_task2;

  -- Поручение 3: открытое, средний приоритет
  INSERT INTO public.board_tasks (id, organization_id, created_by, title, description, priority, status, due_date)
  VALUES (gen_random_uuid(), v_org_id, v_admin,
    'Провести аудит договоров с контрагентами',
    'Проверить все действующие договоры с основными контрагентами на предмет соответствия новым требованиям.',
    'medium', 'open', CURRENT_DATE + INTERVAL '30 days')
  RETURNING id INTO v_task3;

  -- Поручение 4: выполнено
  INSERT INTO public.board_tasks (id, organization_id, created_by, title, description, priority, status, due_date)
  VALUES (gen_random_uuid(), v_org_id, v_chairman,
    'Утвердить положение о комитете по аудиту',
    'Доработать и утвердить положение о комитете по аудиту при Наблюдательном совете.',
    'low', 'done', CURRENT_DATE - INTERVAL '5 days')
  RETURNING id INTO v_task4;

  -- Поручение 5: открытое, на этой неделе
  INSERT INTO public.board_tasks (id, organization_id, created_by, title, description, priority, status, due_date)
  VALUES (gen_random_uuid(), v_org_id, v_admin,
    'Подготовить материалы к заседанию НС',
    'Собрать и систематизировать материалы повестки дня для предстоящего заседания Наблюдательного совета.',
    'medium', 'open', CURRENT_DATE + INTERVAL '5 days')
  RETURNING id INTO v_task5;

  -- Назначения
  IF v_exec1 IS NOT NULL THEN
    INSERT INTO public.board_task_assignees (task_id, assignee_profile_id, role_in_task) VALUES
      (v_task1, v_exec1, 'executor'),
      (v_task2, v_exec1, 'executor'),
      (v_task3, v_exec1, 'co_executor');
  END IF;

  IF v_exec2 IS NOT NULL THEN
    INSERT INTO public.board_task_assignees (task_id, assignee_profile_id, role_in_task) VALUES
      (v_task2, v_exec2, 'co_executor');
  END IF;

  IF v_bm1 IS NOT NULL THEN
    INSERT INTO public.board_task_assignees (task_id, assignee_profile_id, role_in_task) VALUES
      (v_task3, v_bm1, 'executor'),
      (v_task4, v_bm1, 'executor');
  END IF;

  IF v_bm2 IS NOT NULL THEN
    INSERT INTO public.board_task_assignees (task_id, assignee_profile_id, role_in_task) VALUES
      (v_task5, v_bm2, 'executor');
  END IF;

  IF v_admin IS NOT NULL THEN
    INSERT INTO public.board_task_assignees (task_id, assignee_profile_id, role_in_task) VALUES
      (v_task1, v_admin, 'controller'),
      (v_task5, v_admin, 'executor');
  END IF;

  -- Тестовые комментарии
  IF v_exec1 IS NOT NULL THEN
    INSERT INTO public.board_task_comments (task_id, author_profile_id, body) VALUES
      (v_task1, v_exec1, 'Начал сбор данных по финансовым результатам. Ожидаю данные от бухгалтерии.'),
      (v_task2, v_exec1, 'Провёл анализ текущей ИТ-инфраструктуры. Подготовил предварительный план.');
  END IF;

  IF v_chairman IS NOT NULL THEN
    INSERT INTO public.board_task_comments (task_id, author_profile_id, body) VALUES
      (v_task1, v_chairman, 'Прошу ускорить подготовку отчёта. Срок уже прошёл.');
  END IF;

  RAISE NOTICE 'Seed: created 5 board tasks with assignees and comments';
END;
$$;
