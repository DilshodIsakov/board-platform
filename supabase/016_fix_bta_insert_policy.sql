-- Исправление RLS: разрешить создателю задачи добавлять исполнителей
-- Запускать в Supabase SQL Editor

-- Удалить старую политику
DROP POLICY IF EXISTS "bta_insert" ON public.board_task_assignees;

-- Новая политика: admin/chairman ИЛИ создатель задачи могут добавлять исполнителей
CREATE POLICY "bta_insert" ON public.board_task_assignees
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
    AND (
      public.get_my_role() IN ('admin','chairman')
      OR EXISTS (
        SELECT 1 FROM public.board_tasks t
        WHERE t.id = task_id AND t.created_by = auth.uid()
      )
    )
  );

-- Аналогично для удаления: создатель задачи тоже может удалять исполнителей
DROP POLICY IF EXISTS "bta_delete" ON public.board_task_assignees;

CREATE POLICY "bta_delete" ON public.board_task_assignees
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_tasks t
      WHERE t.id = task_id AND t.organization_id = public.get_my_org_id()
    )
    AND (
      public.get_my_role() IN ('admin','chairman')
      OR EXISTS (
        SELECT 1 FROM public.board_tasks t
        WHERE t.id = task_id AND t.created_by = auth.uid()
      )
    )
  );
