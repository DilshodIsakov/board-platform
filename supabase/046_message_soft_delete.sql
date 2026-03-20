-- ============================================================
-- Board Platform — Soft delete for chat messages
-- Запускать в Supabase SQL Editor
-- ============================================================

-- Добавляем is_deleted в личные сообщения
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

-- Добавляем is_deleted в сообщения групп
ALTER TABLE public.chat_group_messages
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

-- ============================================================
-- RLS: Отправитель может пометить своё сообщение как удалённое
-- (отдельная политика от messages_update_read, они ORятся)
-- ============================================================

-- Личные сообщения: отправитель может обновить is_deleted
DROP POLICY IF EXISTS "messages_update_deleted" ON public.messages;
CREATE POLICY "messages_update_deleted" ON public.messages
  FOR UPDATE
  USING (sender_id = public.get_my_profile_id())
  WITH CHECK (is_deleted = true);

-- Групповые сообщения: отправитель может обновить is_deleted
DROP POLICY IF EXISTS "group_messages_update_deleted" ON public.chat_group_messages;
CREATE POLICY "group_messages_update_deleted" ON public.chat_group_messages
  FOR UPDATE
  USING (sender_id = public.get_my_profile_id())
  WITH CHECK (is_deleted = true);
