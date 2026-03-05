-- ============================================================
-- Board Platform — Вложения в чат (файлы и изображения)
-- Запускать в Supabase SQL Editor
-- ============================================================

-- 1. Storage bucket для файлов чата
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS на bucket
CREATE POLICY "chat_att_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "chat_att_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "chat_att_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments');

-- 2. Добавить колонки вложений в messages (личные сообщения)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS file_name    text,
  ADD COLUMN IF NOT EXISTS file_size    integer,
  ADD COLUMN IF NOT EXISTS mime_type    text,
  ADD COLUMN IF NOT EXISTS storage_path text;

-- 3. Добавить колонки вложений в chat_group_messages (групповые)
ALTER TABLE public.chat_group_messages
  ADD COLUMN IF NOT EXISTS file_name    text,
  ADD COLUMN IF NOT EXISTS file_size    integer,
  ADD COLUMN IF NOT EXISTS mime_type    text,
  ADD COLUMN IF NOT EXISTS storage_path text;

-- 4. Разрешить пустой текст (сообщение может быть только файлом)
-- Убираем NOT NULL с body/content и CHECK constraint

-- Для messages: убрать CHECK на body (если есть) и сделать nullable
DO $$
DECLARE
  con_name text;
BEGIN
  -- Ищем CHECK constraint на колонке body или content
  FOR con_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I', con_name);
  END LOOP;
END $$;

ALTER TABLE public.messages ALTER COLUMN body DROP NOT NULL;

-- Для chat_group_messages: сделать content nullable
ALTER TABLE public.chat_group_messages ALTER COLUMN content DROP NOT NULL;
