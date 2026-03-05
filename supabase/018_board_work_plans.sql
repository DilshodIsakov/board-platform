-- ============================================================
-- Board Platform — План работ Наблюдательного совета
-- Запускать ПОСЛЕ schema.sql, 002_meetings.sql
-- ============================================================

-- 1. ТАБЛИЦЫ
-- ============================================================

CREATE TABLE IF NOT EXISTS public.board_work_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title           text NOT NULL,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  status          text NOT NULL DEFAULT 'approved'
                    CHECK (status IN ('draft', 'approved', 'archived')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.board_plan_meetings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                 uuid NOT NULL REFERENCES public.board_work_plans(id) ON DELETE CASCADE,
  meeting_number          int  NOT NULL,
  planned_date_range_text text NOT NULL,
  planned_date_from       date NOT NULL,
  planned_date_to         date NOT NULL,
  status                  text NOT NULL DEFAULT 'planned'
                            CHECK (status IN ('planned', 'completed', 'canceled')),
  linked_meeting_id       uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id, meeting_number)
);

CREATE TABLE IF NOT EXISTS public.board_plan_agenda_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_meeting_id uuid NOT NULL REFERENCES public.board_plan_meetings(id) ON DELETE CASCADE,
  order_no        int  NOT NULL,
  title           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_meeting_id, order_no)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_bwp_org ON public.board_work_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_bpm_plan ON public.board_plan_meetings(plan_id);
CREATE INDEX IF NOT EXISTS idx_bpai_meeting ON public.board_plan_agenda_items(plan_meeting_id);

-- RLS
ALTER TABLE public.board_work_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_plan_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_plan_agenda_items ENABLE ROW LEVEL SECURITY;

-- Политики: чтение для всех аутентифицированных из своей организации
CREATE POLICY "bwp_select" ON public.board_work_plans
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id());

CREATE POLICY "bwp_insert" ON public.board_work_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman')
  );

CREATE POLICY "bpm_select" ON public.board_plan_meetings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_work_plans p
      WHERE p.id = plan_id AND p.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "bpm_insert" ON public.board_plan_meetings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_work_plans p
      WHERE p.id = plan_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  );

CREATE POLICY "bpai_select" ON public.board_plan_agenda_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings pm
      JOIN public.board_work_plans p ON p.id = pm.plan_id
      WHERE pm.id = plan_meeting_id AND p.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "bpai_insert" ON public.board_plan_agenda_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_plan_meetings pm
      JOIN public.board_work_plans p ON p.id = pm.plan_id
      WHERE pm.id = plan_meeting_id AND p.organization_id = public.get_my_org_id()
    )
    AND public.get_my_role() IN ('admin', 'chairman')
  );


-- 2. Расширение таблицы meetings: добавить source и plan_meeting_id
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.meetings ADD COLUMN source text DEFAULT 'manual';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'plan_meeting_id'
  ) THEN
    ALTER TABLE public.meetings ADD COLUMN plan_meeting_id uuid REFERENCES public.board_plan_meetings(id) ON DELETE SET NULL;
  END IF;
END
$$;
