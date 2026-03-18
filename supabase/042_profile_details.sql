-- ============================================================
-- Migration 042: Profile Details & Avatar
-- Расширенные профили пользователей: биография, фото, контакты
-- ============================================================

-- 1. Добавить avatar_url в основную таблицу profiles (нужен везде)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Создать таблицу profile_details для биографических данных
CREATE TABLE IF NOT EXISTS public.profile_details (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Статус в совете
  board_status    text CHECK (board_status IN ('independent', 'executive', 'non_executive', 'employee')),

  -- Текущая должность (3 языка)
  current_position_ru  text,
  current_position_en  text,
  current_position_uz  text,

  -- Текущая компания (3 языка)
  current_company_ru   text,
  current_company_en   text,
  current_company_uz   text,

  -- Подразделение (3 языка)
  department_ru        text,
  department_en        text,
  department_uz        text,

  -- Краткая биография (3 языка)
  short_bio_ru         text,
  short_bio_en         text,
  short_bio_uz         text,

  -- Образование (3 языка)
  education_ru         text,
  education_en         text,
  education_uz         text,

  -- Опыт работы (3 языка)
  work_experience_ru   text,
  work_experience_en   text,
  work_experience_uz   text,

  -- Контакты
  phone                text,
  contact_email        text,
  linkedin             text,
  telegram             text,

  -- Настройки приватности
  is_profile_public    boolean NOT NULL DEFAULT true,
  show_contacts        boolean NOT NULL DEFAULT false,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_details_profile ON public.profile_details(profile_id);

-- 3. RLS
ALTER TABLE public.profile_details ENABLE ROW LEVEL SECURITY;

-- SELECT: все могут видеть (контакты фильтруются на уровне приложения)
CREATE POLICY "profile_details_select" ON public.profile_details
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_id
    )
  );

-- INSERT: только свой профиль или admin
CREATE POLICY "profile_details_insert" ON public.profile_details
  FOR INSERT WITH CHECK (
    profile_id = auth.uid()
    OR public.get_my_role() = 'admin'
  );

-- UPDATE: только свой профиль или admin
CREATE POLICY "profile_details_update" ON public.profile_details
  FOR UPDATE USING (
    profile_id = auth.uid()
    OR public.get_my_role() = 'admin'
  );

-- DELETE: только admin
CREATE POLICY "profile_details_delete" ON public.profile_details
  FOR DELETE USING (
    public.get_my_role() = 'admin'
  );

-- 4. Обновить кэш PostgREST
NOTIFY pgrst, 'reload schema';
