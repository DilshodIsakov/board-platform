-- ============================================================
-- Board Platform — Edit (update body) for own chat messages
-- Запускать в Supabase SQL Editor
-- ============================================================

-- Добавляем is_edited в личные сообщения
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;

-- Добавляем is_edited в сообщения групп
ALTER TABLE public.chat_group_messages
  ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;

-- ============================================================
-- RLS: Отправитель может редактировать своё (не удалённое) сообщение
-- ============================================================

-- Личные сообщения: отправитель может обновить body + is_edited
DROP POLICY IF EXISTS "messages_update_edited" ON public.messages;
CREATE POLICY "messages_update_edited" ON public.messages
  FOR UPDATE
  USING (sender_id = public.get_my_profile_id() AND is_deleted = false)
  WITH CHECK (is_edited = true AND is_deleted = false);

-- Групповые сообщения: отправитель может обновить body + is_edited
DROP POLICY IF EXISTS "group_messages_update_edited" ON public.chat_group_messages;
CREATE POLICY "group_messages_update_edited" ON public.chat_group_messages
  FOR UPDATE
  USING (sender_id = public.get_my_profile_id() AND is_deleted = false)
  WITH CHECK (is_edited = true AND is_deleted = false);
