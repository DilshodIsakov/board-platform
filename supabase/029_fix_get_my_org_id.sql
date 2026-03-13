-- ============================================================
-- 029: Fix get_my_org_id() for single-company schema
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.organizations LIMIT 1;
$$;

-- Fix board_tasks INSERT policy to include corp_secretary role
DROP POLICY IF EXISTS "board_tasks_insert" ON public.board_tasks;

CREATE POLICY "board_tasks_insert" ON public.board_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_org_id()
    AND (
      SELECT role::text FROM public.profiles WHERE id = auth.uid()
    ) IN ('admin', 'chairman', 'board_member', 'corp_secretary')
  );
