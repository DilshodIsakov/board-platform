-- ============================================================
-- Migration 065: Бакет profile-photos (аватары)
--
-- Фронтенд (src/lib/profileDetails.ts) загружает аватары в бакет
-- "profile-photos" по пути {profile_id}/avatar_*.ext и сохраняет
-- publicUrl в profiles.avatar_url — до этой миграции бакет нигде
-- не создавался, и загрузка аватара падала на чистой установке.
--
-- Бакет публичный (avatar_url — публичная ссылка), но запись/удаление
-- разрешены только в собственную папку (первый сегмент = auth.uid()).
-- Лимит 5 MB, только изображения — дублирует клиентскую проверку.
--
-- Идемпотентная: безопасно запускать повторно.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos', 'profile-photos', true,
  5242880,                                        -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Легаси-политики, созданные вручную через дашборд при первоначальной
-- настройке бакета: avatar_select / avatar_upload / avatar_update /
-- avatar_delete. Ограничения у них те же (своя папка в profile-photos),
-- то есть дыры они не давали, но дублировали политики ниже. Снимаем,
-- чтобы на бакете остался один набор правил.
DROP POLICY IF EXISTS "avatar_select" ON storage.objects;
DROP POLICY IF EXISTS "avatar_upload" ON storage.objects;
DROP POLICY IF EXISTS "avatar_update" ON storage.objects;
DROP POLICY IF EXISTS "avatar_delete" ON storage.objects;

DROP POLICY IF EXISTS "profile_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_update" ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_delete" ON storage.objects;

-- Аватары видны всем аутентифицированным (бакет и так публичный,
-- политика нужна для list/createSignedUrl через API).
CREATE POLICY "profile_photos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'profile-photos');

-- Загружать/менять/удалять можно только в свою папку; админ — любые.
CREATE POLICY "profile_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.get_my_role() = 'admin'
    )
  );

CREATE POLICY "profile_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.get_my_role() = 'admin'
    )
  );

CREATE POLICY "profile_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.get_my_role() = 'admin'
    )
  );
