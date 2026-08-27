-- ============================================================
-- Migration 066: Счётчик непрочитанных сообщений чата
--
-- Восстановлено из 027_chat_unread_counter.sql.bak — файл не входил
-- в основной набор миграций, из-за чего фронтенд (src/lib/chat.ts)
-- вызывал несуществующие RPC get_unread_chat_count,
-- mark_personal_messages_as_read, mark_group_as_read.
--
-- Отличие от .bak: get_unread_chat_count возвращала UNION ALL из двух
-- строк при RETURNS integer — до клиента доходила только первая
-- (личные сообщения), групповые терялись. Теперь возвращается сумма.
--
-- Идемпотентная: безопасно запускать повторно.
-- ============================================================

-- ── 1. Таблица отметок «прочитано» по группам ──

CREATE TABLE IF NOT EXISTS public.chat_group_reads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id      uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  last_read_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_group_reads_user_group ON public.chat_group_reads(user_id, group_id);
CREATE INDEX IF NOT EXISTS idx_chat_group_reads_updated_at ON public.chat_group_reads(updated_at);

ALTER TABLE public.chat_group_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_group_reads_select" ON public.chat_group_reads;
CREATE POLICY "chat_group_reads_select" ON public.chat_group_reads
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_group_reads_insert" ON public.chat_group_reads;
CREATE POLICY "chat_group_reads_insert" ON public.chat_group_reads
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_group_reads_update" ON public.chat_group_reads;
CREATE POLICY "chat_group_reads_update" ON public.chat_group_reads
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 2. Общее количество непрочитанных (личные + групповые) ──

CREATE OR REPLACE FUNCTION public.get_unread_chat_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT (
    -- Непрочитанные личные сообщения
    (SELECT COUNT(*)::integer
     FROM public.messages m
     WHERE m.receiver_id = auth.uid()
       AND m.is_read = false
       AND m.sender_id != auth.uid())
    +
    -- Непрочитанные групповые сообщения
    (SELECT COUNT(*)::integer
     FROM public.chat_group_messages cgm
     JOIN public.chat_group_members mem ON mem.group_id = cgm.group_id
     LEFT JOIN public.chat_group_reads cgr
       ON cgr.group_id = cgm.group_id AND cgr.user_id = auth.uid()
     WHERE mem.profile_id = auth.uid()
       AND cgm.sender_id != auth.uid()
       AND (cgr.last_read_at IS NULL OR cgm.created_at > cgr.last_read_at))
  );
$$;

-- ── 3. Пометить группу прочитанной ──

CREATE OR REPLACE FUNCTION public.mark_group_as_read(group_id_param uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.chat_group_reads (user_id, group_id, last_read_at, updated_at)
  VALUES (auth.uid(), group_id_param, now(), now())
  ON CONFLICT (user_id, group_id)
  DO UPDATE SET
    last_read_at = now(),
    updated_at = now();
END;
$$;

-- ── 4. Пометить личные сообщения прочитанными ──

CREATE OR REPLACE FUNCTION public.mark_personal_messages_as_read()
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE public.messages
  SET is_read = true
  WHERE receiver_id = auth.uid()
    AND is_read = false;
$$;

-- ── 5. Обновить кэш PostgREST ──
NOTIFY pgrst, 'reload schema';
