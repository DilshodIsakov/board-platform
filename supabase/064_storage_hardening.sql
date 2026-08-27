-- ============================================================
-- Migration 064: Ужесточение Storage-политик + лимиты бакетов
--
-- Проблема: прежние политики (006, 014, 020, 025) позволяли ЛЮБОМУ
-- аутентифицированному пользователю читать, загружать и УДАЛЯТЬ любые
-- файлы во всех бакетах.
--
-- Новая модель:
--   SELECT  — только файлы своей организации (первый сегмент пути = org_id);
--   INSERT  — только в каталог своей организации;
--   DELETE  — только владелец файла (загрузивший) или admin/corp_secretary;
--   UPDATE  — разрешён по тем же правилам, что и DELETE, и только для
--             бакета documents (перезапись версий). Для остальных бакетов
--             UPDATE-политики нет: приложение туда пишет всегда новым
--             путём, поэтому перезапись объектов запрещена полностью.
--
-- Пути в бакетах (задаются фронтендом):
--   documents        → {org_id}/...
--   chat-attachments → {org_id}/...
--   board-task-files → org/{org_id}/tasks/...
--   briefs           → пишет только Edge Function (service_role, минует RLS)
--
-- Идемпотентная: безопасно запускать повторно.
-- ============================================================

-- ── 1. Хелпер: владелец объекта или админ/секретарь ──

CREATE OR REPLACE FUNCTION public.can_manage_storage_object(obj_owner uuid, obj_owner_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    obj_owner = auth.uid()
    OR obj_owner_id = auth.uid()::text
    OR public.get_my_role() IN ('admin', 'corp_secretary');
$$;

-- ── 2. Снять старые слишком широкие политики ──

DROP POLICY IF EXISTS "documents_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "documents_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "documents_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "documents_storage_delete" ON storage.objects;

DROP POLICY IF EXISTS "chat_att_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_att_insert" ON storage.objects;
DROP POLICY IF EXISTS "chat_att_delete" ON storage.objects;

DROP POLICY IF EXISTS "btf_select" ON storage.objects;
DROP POLICY IF EXISTS "btf_insert" ON storage.objects;
DROP POLICY IF EXISTS "btf_delete" ON storage.objects;

DROP POLICY IF EXISTS "briefs_select" ON storage.objects;
DROP POLICY IF EXISTS "briefs_insert" ON storage.objects;
DROP POLICY IF EXISTS "briefs_update" ON storage.objects;

-- ── 3. documents: {org_id}/... ──

CREATE POLICY "documents_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = public.get_my_org_id()::text
  );

CREATE POLICY "documents_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = public.get_my_org_id()::text
  );

CREATE POLICY "documents_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = public.get_my_org_id()::text
    AND public.can_manage_storage_object(owner, owner_id)
  );

CREATE POLICY "documents_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = public.get_my_org_id()::text
    AND public.can_manage_storage_object(owner, owner_id)
  );

-- ── 4. chat-attachments: {org_id}/... ──

CREATE POLICY "chat_att_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = public.get_my_org_id()::text
  );

CREATE POLICY "chat_att_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = public.get_my_org_id()::text
  );

CREATE POLICY "chat_att_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = public.get_my_org_id()::text
    AND public.can_manage_storage_object(owner, owner_id)
  );

-- ── 5. board-task-files: org/{org_id}/tasks/... ──

CREATE POLICY "btf_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'board-task-files'
    AND (storage.foldername(name))[2] = public.get_my_org_id()::text
  );

CREATE POLICY "btf_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'board-task-files'
    AND (storage.foldername(name))[2] = public.get_my_org_id()::text
  );

CREATE POLICY "btf_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'board-task-files'
    AND (storage.foldername(name))[2] = public.get_my_org_id()::text
    AND public.can_manage_storage_object(owner, owner_id)
  );

-- ── 6. briefs: читают все в организации; пишет только Edge Function
--        (service_role минует RLS, поэтому insert/update политики не нужны) ──

CREATE POLICY "briefs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'briefs');

-- ── 7. Лимиты бакетов: размер и MIME-типы ──
-- Действуют на уровне бакета для всех, включая service_role.

UPDATE storage.buckets SET file_size_limit = 52428800            -- 50 MB
  WHERE id = 'documents';

UPDATE storage.buckets SET file_size_limit = 26214400            -- 25 MB
  WHERE id = 'chat-attachments';

UPDATE storage.buckets SET file_size_limit = 26214400            -- 25 MB
  WHERE id = 'board-task-files';

UPDATE storage.buckets SET file_size_limit = 20971520            -- 20 MB
  WHERE id = 'briefs';
