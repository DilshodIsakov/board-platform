-- ============================================================
-- Migration 041: Расширение прав corp_secretary
-- Добавить corp_secretary ко всем RLS-политикам, где есть admin/chairman
-- (кроме управления пользователями — остаётся только admin)
-- ============================================================

-- ── Meetings (002_meetings.sql) ──────────────────────────────────────────────

DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
CREATE POLICY "meetings_insert" ON public.meetings
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
CREATE POLICY "meetings_update" ON public.meetings
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;
CREATE POLICY "meetings_delete" ON public.meetings
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Agenda Items & Decisions (003_agenda_decisions.sql) ──────────────────────

DROP POLICY IF EXISTS "agenda_items_insert" ON public.agenda_items;
CREATE POLICY "agenda_items_insert" ON public.agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_items_update" ON public.agenda_items;
CREATE POLICY "agenda_items_update" ON public.agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_items_delete" ON public.agenda_items;
CREATE POLICY "agenda_items_delete" ON public.agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "decisions_insert" ON public.decisions;
CREATE POLICY "decisions_insert" ON public.decisions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.org_id = public.get_my_org_id()
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
        AND m.org_id = public.get_my_org_id()
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
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Voting (005_voting.sql) ──────────────────────────────────────────────────

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

-- ── Documents DELETE (006_documents.sql) ─────────────────────────────────────

DROP POLICY IF EXISTS "documents_delete" ON public.documents;
CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'corp_secretary')
  );

-- ── Shareholder Meetings (008_shareholder_meetings.sql) ──────────────────────

DROP POLICY IF EXISTS "sh_meetings_insert" ON public.shareholder_meetings;
CREATE POLICY "sh_meetings_insert" ON public.shareholder_meetings
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_meetings_update" ON public.shareholder_meetings;
CREATE POLICY "sh_meetings_update" ON public.shareholder_meetings
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_meetings_delete" ON public.shareholder_meetings;
CREATE POLICY "sh_meetings_delete" ON public.shareholder_meetings
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- Shareholder agenda items
DROP POLICY IF EXISTS "sh_agenda_insert" ON public.shareholder_agenda_items;
CREATE POLICY "sh_agenda_insert" ON public.shareholder_agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shareholder_meetings sm
      WHERE sm.id = meeting_id
        AND sm.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_agenda_update" ON public.shareholder_agenda_items;
CREATE POLICY "sh_agenda_update" ON public.shareholder_agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.shareholder_meetings sm
      WHERE sm.id = meeting_id
        AND sm.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "sh_agenda_delete" ON public.shareholder_agenda_items;
CREATE POLICY "sh_agenda_delete" ON public.shareholder_agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.shareholder_meetings sm
      WHERE sm.id = meeting_id
        AND sm.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Board Tasks (014_board_tasks.sql) ────────────────────────────────────────

DROP POLICY IF EXISTS "board_tasks_insert" ON public.board_tasks;
CREATE POLICY "board_tasks_insert" ON public.board_tasks
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary', 'board_member')
  );

DROP POLICY IF EXISTS "board_tasks_update" ON public.board_tasks;
CREATE POLICY "board_tasks_update" ON public.board_tasks
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND (
      created_by = auth.uid()
      OR public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
    )
  );

DROP POLICY IF EXISTS "board_tasks_delete" ON public.board_tasks;
CREATE POLICY "board_tasks_delete" ON public.board_tasks
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Doc Links — already updated, but ensure corp_secretary ───────────────────

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

-- ── Agenda Briefs (024_agenda_briefs.sql) ────────────────────────────────────

DROP POLICY IF EXISTS "agenda_briefs_insert" ON public.agenda_briefs;
CREATE POLICY "agenda_briefs_insert" ON public.agenda_briefs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_briefs_update" ON public.agenda_briefs;
CREATE POLICY "agenda_briefs_update" ON public.agenda_briefs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_briefs_delete" ON public.agenda_briefs;
CREATE POLICY "agenda_briefs_delete" ON public.agenda_briefs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Agenda Briefs Lang (025_agenda_briefs_lang.sql) ──────────────────────────

DROP POLICY IF EXISTS "agenda_brief_langs_insert" ON public.agenda_brief_langs;
CREATE POLICY "agenda_brief_langs_insert" ON public.agenda_brief_langs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agenda_briefs ab
      JOIN public.agenda_items ai ON ai.id = ab.agenda_item_id
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ab.id = brief_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "agenda_brief_langs_update" ON public.agenda_brief_langs;
CREATE POLICY "agenda_brief_langs_update" ON public.agenda_brief_langs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.agenda_briefs ab
      JOIN public.agenda_items ai ON ai.id = ab.agenda_item_id
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ab.id = brief_id
        AND m.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Work Plans (033_workplan_admin.sql) ──────────────────────────────────────

DROP POLICY IF EXISTS "work_plans_insert" ON public.board_work_plans;
CREATE POLICY "work_plans_insert" ON public.board_work_plans
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "work_plans_update" ON public.board_work_plans;
CREATE POLICY "work_plans_update" ON public.board_work_plans
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "work_plans_delete" ON public.board_work_plans;
CREATE POLICY "work_plans_delete" ON public.board_work_plans
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- Work plan meetings
DROP POLICY IF EXISTS "wp_meetings_insert" ON public.work_plan_meetings;
CREATE POLICY "wp_meetings_insert" ON public.work_plan_meetings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_work_plans wp
      WHERE wp.id = plan_id
        AND wp.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_meetings_update" ON public.work_plan_meetings;
CREATE POLICY "wp_meetings_update" ON public.work_plan_meetings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans wp
      WHERE wp.id = plan_id
        AND wp.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_meetings_delete" ON public.work_plan_meetings;
CREATE POLICY "wp_meetings_delete" ON public.work_plan_meetings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans wp
      WHERE wp.id = plan_id
        AND wp.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- Work plan agenda items
DROP POLICY IF EXISTS "wp_agenda_insert" ON public.work_plan_agenda_items;
CREATE POLICY "wp_agenda_insert" ON public.work_plan_agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_plan_meetings wm
      JOIN public.board_work_plans wp ON wp.id = wm.plan_id
      WHERE wm.id = meeting_id
        AND wp.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_agenda_update" ON public.work_plan_agenda_items;
CREATE POLICY "wp_agenda_update" ON public.work_plan_agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.work_plan_meetings wm
      JOIN public.board_work_plans wp ON wp.id = wm.plan_id
      WHERE wm.id = meeting_id
        AND wp.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "wp_agenda_delete" ON public.work_plan_agenda_items;
CREATE POLICY "wp_agenda_delete" ON public.work_plan_agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.work_plan_meetings wm
      JOIN public.board_work_plans wp ON wp.id = wm.plan_id
      WHERE wm.id = meeting_id
        AND wp.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── NS Meeting Voting (034_ns_meeting_voting.sql) ───────────────────────────

DROP POLICY IF EXISTS "ns_meetings_insert" ON public.ns_meetings;
CREATE POLICY "ns_meetings_insert" ON public.ns_meetings
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "ns_meetings_update" ON public.ns_meetings;
CREATE POLICY "ns_meetings_update" ON public.ns_meetings
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "ns_meetings_delete" ON public.ns_meetings;
CREATE POLICY "ns_meetings_delete" ON public.ns_meetings
  FOR DELETE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- NS meeting agenda items
DROP POLICY IF EXISTS "ns_agenda_items_insert" ON public.ns_agenda_items;
CREATE POLICY "ns_agenda_items_insert" ON public.ns_agenda_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ns_meetings nm
      WHERE nm.id = meeting_id
        AND nm.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "ns_agenda_items_update" ON public.ns_agenda_items;
CREATE POLICY "ns_agenda_items_update" ON public.ns_agenda_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.ns_meetings nm
      WHERE nm.id = meeting_id
        AND nm.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

DROP POLICY IF EXISTS "ns_agenda_items_delete" ON public.ns_agenda_items;
CREATE POLICY "ns_agenda_items_delete" ON public.ns_agenda_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.ns_meetings nm
      WHERE nm.id = meeting_id
        AND nm.org_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman', 'corp_secretary')
  );

-- ── Video Conferences ────────────────────────────────────────────────────────
-- video_conferences policies may use creator check already, ensure corp_secretary can delete

DROP POLICY IF EXISTS "vc_delete" ON public.video_conferences;
CREATE POLICY "vc_delete" ON public.video_conferences
  FOR DELETE USING (
    organization_id = public.get_my_org_id()
    AND (
      created_by = auth.uid()
      OR public.get_my_role() IN ('admin', 'corp_secretary')
    )
  );
