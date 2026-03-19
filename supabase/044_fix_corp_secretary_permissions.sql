-- ============================================================
-- Migration 044: ИСПРАВЛЕННАЯ версия 041
-- Расширение прав corp_secretary — с правильными именами колонок
-- ============================================================

-- ── Meetings ─────────────────────────────────────────────────
-- Колонка: organization_id

DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
CREATE POLICY "meetings_insert" ON public.meetings
  FOR INSERT WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
CREATE POLICY "meetings_update" ON public.meetings
  FOR UPDATE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;
CREATE POLICY "meetings_delete" ON public.meetings
  FOR DELETE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Agenda Items ─────────────────────────────────────────────
-- JOIN через meetings → organization_id

DROP POLICY IF EXISTS "agenda_items_insert" ON public.agenda_items;
CREATE POLICY "agenda_items_insert" ON public.agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_items_update" ON public.agenda_items;
CREATE POLICY "agenda_items_update" ON public.agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_items_delete" ON public.agenda_items;
CREATE POLICY "agenda_items_delete" ON public.agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Decisions ────────────────────────────────────────────────

DROP POLICY IF EXISTS "decisions_insert" ON public.decisions;
CREATE POLICY "decisions_insert" ON public.decisions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "decisions_update" ON public.decisions;
CREATE POLICY "decisions_update" ON public.decisions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "decisions_delete" ON public.decisions;
CREATE POLICY "decisions_delete" ON public.decisions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Votings ──────────────────────────────────────────────────
-- Колонка: org_id

DROP POLICY IF EXISTS "votings_insert" ON public.votings;
CREATE POLICY "votings_insert" ON public.votings
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "votings_update" ON public.votings;
CREATE POLICY "votings_update" ON public.votings
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Documents ────────────────────────────────────────────────
-- Колонка: org_id

DROP POLICY IF EXISTS "documents_delete" ON public.documents;
CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'corp_secretary')
  );

-- ── Shareholder Meetings ─────────────────────────────────────
-- Колонка: organization_id

DROP POLICY IF EXISTS "sh_meetings_insert" ON public.shareholder_meetings;
CREATE POLICY "sh_meetings_insert" ON public.shareholder_meetings
  FOR INSERT WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_meetings_update" ON public.shareholder_meetings;
CREATE POLICY "sh_meetings_update" ON public.shareholder_meetings
  FOR UPDATE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_meetings_delete" ON public.shareholder_meetings;
CREATE POLICY "sh_meetings_delete" ON public.shareholder_meetings
  FOR DELETE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- Shareholder agenda items (FK через shareholder_meetings)
DROP POLICY IF EXISTS "sh_agenda_insert" ON public.shareholder_agenda_items;
CREATE POLICY "sh_agenda_insert" ON public.shareholder_agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shareholder_meetings sm
      WHERE sm.id = meeting_id
        AND sm.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_agenda_update" ON public.shareholder_agenda_items;
CREATE POLICY "sh_agenda_update" ON public.shareholder_agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.shareholder_meetings sm
      WHERE sm.id = meeting_id
        AND sm.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_agenda_delete" ON public.shareholder_agenda_items;
CREATE POLICY "sh_agenda_delete" ON public.shareholder_agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.shareholder_meetings sm
      WHERE sm.id = meeting_id
        AND sm.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Board Tasks ──────────────────────────────────────────────
-- Колонка: organization_id

DROP POLICY IF EXISTS "board_tasks_insert" ON public.board_tasks;
CREATE POLICY "board_tasks_insert" ON public.board_tasks
  FOR INSERT WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary', 'board_member')
  );

DROP POLICY IF EXISTS "board_tasks_update" ON public.board_tasks;
CREATE POLICY "board_tasks_update" ON public.board_tasks
  FOR UPDATE USING (
    organization_id = public.get_my_org_id()
    AND (
      created_by = auth.uid()
      OR public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
    )
  );

DROP POLICY IF EXISTS "board_tasks_delete" ON public.board_tasks;
CREATE POLICY "board_tasks_delete" ON public.board_tasks
  FOR DELETE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Doc Links ────────────────────────────────────────────────
-- Колонка: org_id

DROP POLICY IF EXISTS "doc_links_insert" ON public.doc_links;
CREATE POLICY "doc_links_insert" ON public.doc_links
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "doc_links_update" ON public.doc_links;
CREATE POLICY "doc_links_update" ON public.doc_links
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "doc_links_delete" ON public.doc_links;
CREATE POLICY "doc_links_delete" ON public.doc_links
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Agenda Briefs ────────────────────────────────────────────
-- FK: agenda_id → agenda_items → meetings

DROP POLICY IF EXISTS "agenda_briefs_insert" ON public.agenda_briefs;
CREATE POLICY "agenda_briefs_insert" ON public.agenda_briefs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_briefs_update" ON public.agenda_briefs;
CREATE POLICY "agenda_briefs_update" ON public.agenda_briefs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_briefs_delete" ON public.agenda_briefs;
CREATE POLICY "agenda_briefs_delete" ON public.agenda_briefs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_id
        AND m.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Board Work Plans ─────────────────────────────────────────
-- Колонка: organization_id

DROP POLICY IF EXISTS "work_plans_insert" ON public.board_work_plans;
CREATE POLICY "work_plans_insert" ON public.board_work_plans
  FOR INSERT WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "work_plans_update" ON public.board_work_plans;
CREATE POLICY "work_plans_update" ON public.board_work_plans
  FOR UPDATE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "work_plans_delete" ON public.board_work_plans;
CREATE POLICY "work_plans_delete" ON public.board_work_plans
  FOR DELETE USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- Board plan meetings (FK: plan_id → board_work_plans)
DROP POLICY IF EXISTS "wp_meetings_insert" ON public.board_plan_meetings;
CREATE POLICY "wp_meetings_insert" ON public.board_plan_meetings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_work_plans wp
      WHERE wp.id = plan_id
        AND wp.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_meetings_update" ON public.board_plan_meetings;
CREATE POLICY "wp_meetings_update" ON public.board_plan_meetings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans wp
      WHERE wp.id = plan_id
        AND wp.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_meetings_delete" ON public.board_plan_meetings;
CREATE POLICY "wp_meetings_delete" ON public.board_plan_meetings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans wp
      WHERE wp.id = plan_id
        AND wp.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- Board plan agenda items (FK: plan_meeting_id → board_plan_meetings)
DROP POLICY IF EXISTS "wp_agenda_insert" ON public.board_plan_agenda_items;
CREATE POLICY "wp_agenda_insert" ON public.board_plan_agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings wm
      JOIN public.board_work_plans wp ON wp.id = wm.plan_id
      WHERE wm.id = plan_meeting_id
        AND wp.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_agenda_update" ON public.board_plan_agenda_items;
CREATE POLICY "wp_agenda_update" ON public.board_plan_agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings wm
      JOIN public.board_work_plans wp ON wp.id = wm.plan_id
      WHERE wm.id = plan_meeting_id
        AND wp.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_agenda_delete" ON public.board_plan_agenda_items;
CREATE POLICY "wp_agenda_delete" ON public.board_plan_agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings wm
      JOIN public.board_work_plans wp ON wp.id = wm.plan_id
      WHERE wm.id = plan_meeting_id
        AND wp.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Обновить кэш PostgREST ──────────────────────────────────
NOTIFY pgrst, 'reload schema';
