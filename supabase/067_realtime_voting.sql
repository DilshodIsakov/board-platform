-- ============================================================
-- Migration 067: Realtime для голосования и группового чата
--
-- В публикации supabase_realtime были только messages и notifications.
-- Из-за этого:
--   * табло голосования обновлялось только по ручному refetch;
--   * подписка ChatPage на chat_group_messages молча не работала
--     (канал создавался, но события не приходили).
--
-- Идемпотентная: повторное добавление таблицы в публикацию
-- перехватывается (duplicate_object).
-- ============================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.votings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_vote_signatures;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_group_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
