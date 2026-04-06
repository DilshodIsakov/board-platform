-- ============================================================
-- 055: Committees module
-- 4 committees, members, meetings, agenda items, votings, votes
-- ============================================================

-- 1. Committees
CREATE TABLE IF NOT EXISTS public.committees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id),
  name        TEXT NOT NULL,
  name_uz     TEXT,
  name_en     TEXT,
  type        TEXT NOT NULL CHECK (type IN ('audit','strategy','nominations','anticorruption')),
  description TEXT,
  created_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.committees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "committees_select" ON public.committees FOR SELECT TO authenticated USING (
  org_id = public.get_my_org_id()
);
CREATE POLICY "committees_insert" ON public.committees FOR INSERT TO authenticated WITH CHECK (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "committees_update" ON public.committees FOR UPDATE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "committees_delete" ON public.committees FOR DELETE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);

-- 2. Committee Members
CREATE TABLE IF NOT EXISTS public.committee_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id UUID NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('chair','member')),
  added_by     UUID REFERENCES public.profiles(id),
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(committee_id, profile_id)
);

ALTER TABLE public.committee_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmembers_select" ON public.committee_members FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.committees c WHERE c.id = committee_id AND c.org_id = public.get_my_org_id())
);
CREATE POLICY "cmembers_insert" ON public.committee_members FOR INSERT TO authenticated WITH CHECK (
  public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cmembers_delete" ON public.committee_members FOR DELETE TO authenticated USING (
  public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cmembers_update" ON public.committee_members FOR UPDATE TO authenticated USING (
  public.get_my_role() IN ('admin','corp_secretary')
);

-- 3. Committee Meetings
CREATE TABLE IF NOT EXISTS public.committee_meetings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id UUID NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL REFERENCES public.organizations(id),
  title        TEXT NOT NULL,
  title_uz     TEXT,
  title_en     TEXT,
  start_at     TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed')),
  location     TEXT,
  notes        TEXT,
  created_by   UUID REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.committee_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmeetings_select" ON public.committee_meetings FOR SELECT TO authenticated USING (
  org_id = public.get_my_org_id()
);
CREATE POLICY "cmeetings_insert" ON public.committee_meetings FOR INSERT TO authenticated WITH CHECK (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cmeetings_update" ON public.committee_meetings FOR UPDATE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cmeetings_delete" ON public.committee_meetings FOR DELETE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);

-- 4. Committee Agenda Items
CREATE TABLE IF NOT EXISTS public.committee_agenda_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   UUID NOT NULL REFERENCES public.committee_meetings(id) ON DELETE CASCADE,
  committee_id UUID NOT NULL REFERENCES public.committees(id),
  org_id       UUID NOT NULL REFERENCES public.organizations(id),
  title        TEXT NOT NULL,
  title_uz     TEXT,
  title_en     TEXT,
  presenter    TEXT,
  order_index  INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.committee_agenda_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cagenda_select" ON public.committee_agenda_items FOR SELECT TO authenticated USING (
  org_id = public.get_my_org_id()
);
CREATE POLICY "cagenda_insert" ON public.committee_agenda_items FOR INSERT TO authenticated WITH CHECK (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cagenda_update" ON public.committee_agenda_items FOR UPDATE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cagenda_delete" ON public.committee_agenda_items FOR DELETE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);

-- 5. Committee Votings
CREATE TABLE IF NOT EXISTS public.committee_votings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id UUID NOT NULL REFERENCES public.committee_agenda_items(id) ON DELETE CASCADE,
  committee_id   UUID NOT NULL REFERENCES public.committees(id),
  org_id         UUID NOT NULL REFERENCES public.organizations(id),
  title          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  total_members  INT NOT NULL DEFAULT 5,
  created_by     UUID REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at      TIMESTAMPTZ
);

ALTER TABLE public.committee_votings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cvotings_select" ON public.committee_votings FOR SELECT TO authenticated USING (
  org_id = public.get_my_org_id()
);
CREATE POLICY "cvotings_insert" ON public.committee_votings FOR INSERT TO authenticated WITH CHECK (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);
CREATE POLICY "cvotings_update" ON public.committee_votings FOR UPDATE TO authenticated USING (
  org_id = public.get_my_org_id()
  AND public.get_my_role() IN ('admin','corp_secretary')
);

-- 6. Committee Votes
CREATE TABLE IF NOT EXISTS public.committee_votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voting_id  UUID NOT NULL REFERENCES public.committee_votings(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES public.organizations(id),
  voter_id   UUID NOT NULL REFERENCES public.profiles(id),
  choice     TEXT NOT NULL CHECK (choice IN ('for','against','abstain')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(voting_id, voter_id)
);

ALTER TABLE public.committee_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cvotes_select" ON public.committee_votes FOR SELECT TO authenticated USING (
  org_id = public.get_my_org_id()
);
CREATE POLICY "cvotes_insert" ON public.committee_votes FOR INSERT TO authenticated WITH CHECK (
  voter_id = auth.uid()
  AND org_id = public.get_my_org_id()
  AND EXISTS (
    SELECT 1 FROM public.committee_votings cv WHERE cv.id = voting_id AND cv.status = 'open'
  )
);
CREATE POLICY "cvotes_update" ON public.committee_votes FOR UPDATE TO authenticated USING (
  voter_id = auth.uid()
);

-- 7. Documents: add committee_meeting_id column
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS committee_meeting_id UUID REFERENCES public.committee_meetings(id) ON DELETE CASCADE;

-- 8. Seed: insert the 4 committees for the existing org
INSERT INTO public.committees (org_id, name, name_uz, name_en, type, description)
SELECT
  id,
  'Комитет по аудиту',
  'Аудит қўмитаси',
  'Audit Committee',
  'audit',
  'Надзор за финансовой отчётностью, внутренним контролем и аудитом'
FROM public.organizations LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.committees (org_id, name, name_uz, name_en, type, description)
SELECT
  id,
  'Комитет по стратегии и инвестициям',
  'Стратегия ва инвестициялар қўмитаси',
  'Strategy & Investment Committee',
  'strategy',
  'Стратегическое планирование и инвестиционная политика'
FROM public.organizations LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.committees (org_id, name, name_uz, name_en, type, description)
SELECT
  id,
  'Комитет по назначениям и вознаграждениям',
  'Тайинлашлар ва мукофотлар қўмитаси',
  'Nominations & Remuneration Committee',
  'nominations',
  'Кадровая политика, назначения и система вознаграждений'
FROM public.organizations LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.committees (org_id, name, name_uz, name_en, type, description)
SELECT
  id,
  'Комитет по антикоррупции и этике',
  'Коррупцияга қарши ва этика қўмитаси',
  'Anti-Corruption & Ethics Committee',
  'anticorruption',
  'Соблюдение этических норм, антикоррупционная политика'
FROM public.organizations LIMIT 1
ON CONFLICT DO NOTHING;
