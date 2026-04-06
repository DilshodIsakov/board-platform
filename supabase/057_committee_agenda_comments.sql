-- ============================================================
-- 057: Committee agenda item comments (discussion)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.committee_agenda_comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  meeting_id        UUID NOT NULL REFERENCES public.committee_meetings(id) ON DELETE CASCADE,
  agenda_item_id    UUID NOT NULL REFERENCES public.committee_agenda_items(id) ON DELETE CASCADE,
  org_id            UUID NOT NULL REFERENCES public.organizations(id),

  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name         TEXT NOT NULL DEFAULT '',
  user_role         TEXT NOT NULL DEFAULT '',

  parent_comment_id UUID REFERENCES public.committee_agenda_comments(id) ON DELETE CASCADE,

  content           TEXT NOT NULL DEFAULT '',
  is_deleted        BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_cac_agenda_item_id ON public.committee_agenda_comments(agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_cac_meeting_id     ON public.committee_agenda_comments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_cac_created_at     ON public.committee_agenda_comments(created_at);

ALTER TABLE public.committee_agenda_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cac_select" ON public.committee_agenda_comments
  FOR SELECT TO authenticated
  USING (org_id = public.get_my_org_id());

CREATE POLICY "cac_insert" ON public.committee_agenda_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND org_id = public.get_my_org_id()
  );

CREATE POLICY "cac_update" ON public.committee_agenda_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin')
  WITH CHECK (user_id = auth.uid() OR public.get_my_role() = 'admin');

CREATE POLICY "cac_delete" ON public.committee_agenda_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.cac_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS cac_updated_at ON public.committee_agenda_comments;
CREATE TRIGGER cac_updated_at
  BEFORE UPDATE ON public.committee_agenda_comments
  FOR EACH ROW EXECUTE FUNCTION public.cac_set_updated_at();
