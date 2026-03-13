-- ============================================================
-- Board Platform — Work Plan: multilingual fields + admin CRUD
-- Run AFTER 018_board_work_plans.sql
-- ============================================================

-- ── Multilingual title for board_work_plans ────────────────────────────────
ALTER TABLE public.board_work_plans ADD COLUMN IF NOT EXISTS title_ru text;
ALTER TABLE public.board_work_plans ADD COLUMN IF NOT EXISTS title_uz text;
ALTER TABLE public.board_work_plans ADD COLUMN IF NOT EXISTS title_en text;
ALTER TABLE public.board_work_plans ADD COLUMN IF NOT EXISTS source_language text NOT NULL DEFAULT 'ru';

-- ── Multilingual title for board_plan_agenda_items ─────────────────────────
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS title_ru text;
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS title_uz text;
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS title_en text;
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS source_language text NOT NULL DEFAULT 'ru';
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS translation_status_ru text NOT NULL DEFAULT 'original';
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS translation_status_uz text NOT NULL DEFAULT 'missing';
ALTER TABLE public.board_plan_agenda_items ADD COLUMN IF NOT EXISTS translation_status_en text NOT NULL DEFAULT 'missing';

-- ── Backfill existing data ─────────────────────────────────────────────────
UPDATE public.board_work_plans SET title_ru = title WHERE title_ru IS NULL;
UPDATE public.board_plan_agenda_items SET title_ru = title WHERE title_ru IS NULL;

-- ── RLS: UPDATE & DELETE for board_work_plans ──────────────────────────────
DROP POLICY IF EXISTS "bwp_update" ON public.board_work_plans;
CREATE POLICY "bwp_update" ON public.board_work_plans
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman')
  )
  WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman')
  );

DROP POLICY IF EXISTS "bwp_delete" ON public.board_work_plans;
CREATE POLICY "bwp_delete" ON public.board_work_plans
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman')
  );

-- ── RLS: UPDATE & DELETE for board_plan_meetings ───────────────────────────
DROP POLICY IF EXISTS "bpm_update" ON public.board_plan_meetings;
CREATE POLICY "bpm_update" ON public.board_plan_meetings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans p
      WHERE p.id = plan_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_work_plans p
      WHERE p.id = plan_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  );

DROP POLICY IF EXISTS "bpm_delete" ON public.board_plan_meetings;
CREATE POLICY "bpm_delete" ON public.board_plan_meetings
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans p
      WHERE p.id = plan_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  );

-- ── RLS: UPDATE & DELETE for board_plan_agenda_items ──────────────────────
DROP POLICY IF EXISTS "bpai_update" ON public.board_plan_agenda_items;
CREATE POLICY "bpai_update" ON public.board_plan_agenda_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings pm
      JOIN public.board_work_plans p ON p.id = pm.plan_id
      WHERE pm.id = plan_meeting_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings pm
      JOIN public.board_work_plans p ON p.id = pm.plan_id
      WHERE pm.id = plan_meeting_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  );

DROP POLICY IF EXISTS "bpai_delete" ON public.board_plan_agenda_items;
CREATE POLICY "bpai_delete" ON public.board_plan_agenda_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings pm
      JOIN public.board_work_plans p ON p.id = pm.plan_id
      WHERE pm.id = plan_meeting_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  );
