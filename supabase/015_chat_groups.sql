-- Board Platform — Групповые чаты
-- Запускать ПОСЛЕ schema.sql, 004_chat.sql в Supabase SQL Editor

-- ============================================================
-- 1. ТАБЛИЦЫ
-- ============================================================

-- Группы
CREATE TABLE IF NOT EXISTS public.chat_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Участники группы
CREATE TABLE IF NOT EXISTS public.chat_group_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, profile_id)
);

-- Сообщения группы
CREATE TABLE IF NOT EXISTS public.chat_group_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. ИНДЕКСЫ
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_chat_groups_org        ON public.chat_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_cgm_group_id           ON public.chat_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_cgm_profile_id         ON public.chat_group_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_cgmsg_group_id         ON public.chat_group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_cgmsg_created_at       ON public.chat_group_messages(created_at);

-- ============================================================
-- 3. RLS
-- ============================================================

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_messages ENABLE ROW LEVEL SECURITY;

-- chat_groups: видят участники своей организации
CREATE POLICY "cg_select" ON public.chat_groups
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id());

CREATE POLICY "cg_insert" ON public.chat_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_org_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "cg_update" ON public.chat_groups
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.get_my_role() IN ('admin','chairman'));

CREATE POLICY "cg_delete" ON public.chat_groups
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.get_my_role() IN ('admin','chairman'));

-- chat_group_members: видят если состоят в группе своей организации
CREATE POLICY "cgm_select" ON public.chat_group_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_groups g
      WHERE g.id = group_id AND g.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "cgm_insert" ON public.chat_group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_groups g
      WHERE g.id = group_id AND g.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY "cgm_delete" ON public.chat_group_members
  FOR DELETE TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_groups g
      WHERE g.id = group_id AND g.created_by = auth.uid()
    )
    OR public.get_my_role() IN ('admin','chairman')
  );

-- chat_group_messages: видят участники группы
CREATE POLICY "cgmsg_select" ON public.chat_group_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_group_members m
      WHERE m.group_id = chat_group_messages.group_id AND m.profile_id = auth.uid()
    )
  );

CREATE POLICY "cgmsg_insert" ON public.chat_group_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_group_members m
      WHERE m.group_id = chat_group_messages.group_id AND m.profile_id = auth.uid()
    )
  );
