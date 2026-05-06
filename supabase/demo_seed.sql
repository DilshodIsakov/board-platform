-- ============================================================
-- DEMO SEED — Board Platform
-- Организация: АО «Алмаз Энерго» (вымышленная)
-- Пользователи:
--   secretary@demo.almaz.uz / Demo1234!  — Корп. секретарь
--   chairman@demo.almaz.uz  / Demo1234!  — Председатель НС
--   member@demo.almaz.uz    / Demo1234!  — Член НС
--
-- ВАЖНО: Запускать ПОСЛЕ всех миграций (001–058)
-- ============================================================

DO $$
DECLARE
  -- Фиксированные UUID для воспроизводимости
  v_org_id   uuid := 'de000000-0000-0000-0000-000000000001';
  v_sec_id   uuid := 'de000000-0000-0000-0000-000000000011';
  v_mem_id   uuid := 'de000000-0000-0000-0000-000000000012';
  v_vi_id    uuid := 'de000000-0000-0000-0000-000000000013';

  v_mtg_done  uuid := 'de000000-0000-0000-0000-000000000021';
  v_mtg_ready uuid := 'de000000-0000-0000-0000-000000000022';
  v_mtg_new   uuid := 'de000000-0000-0000-0000-000000000023';

  v_ai1_1 uuid := 'de000000-0000-0000-0000-000000000031';
  v_ai1_2 uuid := 'de000000-0000-0000-0000-000000000032';
  v_ai2_1 uuid := 'de000000-0000-0000-0000-000000000033';
  v_ai2_2 uuid := 'de000000-0000-0000-0000-000000000034';

  v_pwd text;
BEGIN
  v_pwd := crypt('Demo1234!', gen_salt('bf'));

  -- ── 1. Временно отключаем триггер создания профиля ─────────────────────────
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
  AS $f$ BEGIN RETURN new; END; $f$;

  -- ── 2. Организация ──────────────────────────────────────────────────────────
  INSERT INTO public.organizations (id, name, name_uz, name_en, created_at)
  VALUES (
    v_org_id,
    'АО «Алмаз Энерго»',
    'АЖ «Алмаз Энерго»',
    'Almaz Energo JSC',
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name    = EXCLUDED.name,
    name_uz = EXCLUDED.name_uz,
    name_en = EXCLUDED.name_en;

  -- ── 3. Auth-пользователи ────────────────────────────────────────────────────
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', v_sec_id,
      'authenticated', 'authenticated', 'secretary@demo.almaz.uz', v_pwd,
      now(), '{"provider":"email","providers":["email"]}',
      '{"full_name":"Юсупова Азиза Камолидиновна"}',
      now(), now(), '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_mem_id,
      'authenticated', 'authenticated', 'chairman@demo.almaz.uz', v_pwd,
      now(), '{"provider":"email","providers":["email"]}',
      '{"full_name":"Каримов Бахтиёр Рахимович"}',
      now(), now(), '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_vi_id,
      'authenticated', 'authenticated', 'member@demo.almaz.uz', v_pwd,
      now(), '{"provider":"email","providers":["email"]}',
      '{"full_name":"Исмоилова Малика Фаррухович"}',
      now(), now(), '', ''
    )
  ON CONFLICT (id) DO NOTHING;

  -- ── 4. Профили ──────────────────────────────────────────────────────────────
  INSERT INTO public.profiles (
    id, organization_id, email, full_name, full_name_en, full_name_uz,
    role, role_details, role_details_en, role_details_uz,
    approval_status, created_at
  ) VALUES
    (
      v_sec_id, v_org_id, 'secretary@demo.almaz.uz',
      'Юсупова Азиза Камолидиновна',
      'Aziza Yusupova',
      'Азиза Камолиддиновна Юсупова',
      'corp_secretary',
      'Корпоративный секретарь',
      'Corporate Secretary',
      'Корпоратив котиб',
      'approved', now()
    ),
    (
      v_mem_id, v_org_id, 'chairman@demo.almaz.uz',
      'Каримов Бахтиёр Рахимович',
      'Bakhtiyor Karimov',
      'Бахтиёр Раҳимович Каримов',
      'board_member',
      'Председатель Наблюдательного совета',
      'Chairman of the Supervisory Board',
      'Кузатув кенгаши раиси',
      'approved', now()
    ),
    (
      v_vi_id, v_org_id, 'member@demo.almaz.uz',
      'Исмоилова Малика Фаррухович',
      'Malika Ismoilova',
      'Малика Фаррухович Исмоилова',
      'board_member',
      'Независимый член Наблюдательного совета',
      'Independent Member of the Supervisory Board',
      'Мустақил аъзо, Кузатув кенгаши',
      'approved', now()
    )
  ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    approval_status = EXCLUDED.approval_status;

  -- ── 5. Заседания НС ─────────────────────────────────────────────────────────

  -- Завершённое заседание
  INSERT INTO public.meetings (
    id, organization_id, created_by,
    title, title_ru, title_en, title_uz,
    source_language, translation_status_ru, translation_status_en, translation_status_uz,
    start_at, status, materials_ready, created_at
  ) VALUES (
    v_mtg_done, v_org_id, v_sec_id,
    'Заседание НС по утверждению годового отчёта за 2024 год',
    'Заседание НС по утверждению годового отчёта за 2024 год',
    'Supervisory Board Meeting on Approval of Annual Report for 2024',
    '2024 йилги йиллик ҳисоботни тасдиқлаш бўйича НС йиғилиши',
    'ru', 'original', 'reviewed', 'reviewed',
    '2025-12-10 10:00:00+05', 'completed', true, now() - interval '5 months'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Запланированное (готово — зелёное)
  INSERT INTO public.meetings (
    id, organization_id, created_by,
    title, title_ru, title_en, title_uz,
    source_language, translation_status_ru, translation_status_en, translation_status_uz,
    start_at, status, materials_ready, created_at
  ) VALUES (
    v_mtg_ready, v_org_id, v_sec_id,
    'Заседание НС по утверждению бизнес-плана на 2026 год',
    'Заседание НС по утверждению бизнес-плана на 2026 год',
    'Supervisory Board Meeting on Approval of Business Plan for 2026',
    '2026 йилга бизнес-режани тасдиқлаш бўйича НС йиғилиши',
    'ru', 'original', 'reviewed', 'reviewed',
    '2026-06-20 10:00:00+05', 'scheduled', true, now() - interval '2 weeks'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Запланированное (материалы ещё не готовы)
  INSERT INTO public.meetings (
    id, organization_id, created_by,
    title, title_ru, title_en, title_uz,
    source_language, translation_status_ru, translation_status_en, translation_status_uz,
    start_at, status, materials_ready, created_at
  ) VALUES (
    v_mtg_new, v_org_id, v_sec_id,
    'Заседание НС по рассмотрению кадровых вопросов',
    'Заседание НС по рассмотрению кадровых вопросов',
    'Supervisory Board Meeting on Personnel Matters',
    'Кадр масалалари бўйича НС йиғилиши',
    'ru', 'original', 'reviewed', 'reviewed',
    '2026-07-15 10:00:00+05', 'scheduled', false, now() - interval '3 days'
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── 6. Пункты повестки ──────────────────────────────────────────────────────

  -- Повестка завершённого заседания
  INSERT INTO public.agenda_items (
    id, meeting_id, org_id, order_index,
    title, title_ru, title_en, title_uz,
    presenter, presenter_ru, presenter_en, presenter_uz,
    source_language, translation_status_ru, translation_status_en, translation_status_uz
  ) VALUES
    (
      v_ai1_1, v_mtg_done, v_org_id, 1,
      'Рассмотрение и утверждение годового отчёта АО «Алмаз Энерго» за 2024 год',
      'Рассмотрение и утверждение годового отчёта АО «Алмаз Энерго» за 2024 год',
      'Review and Approval of the Annual Report of Almaz Energo JSC for 2024',
      'АЖ «Алмаз Энерго»нинг 2024 йилги йиллик ҳисоботини кўриб чиқиш ва тасдиқлаш',
      'Юсупова А.К. — Корпоративный секретарь',
      'Юсупова А.К. — Корпоративный секретарь',
      'A. Yusupova — Corporate Secretary',
      'А.К.Юсупова — Корпоратив котиб',
      'ru', 'original', 'reviewed', 'reviewed'
    ),
    (
      v_ai1_2, v_mtg_done, v_org_id, 2,
      'Утверждение плана распределения прибыли за 2024 год',
      'Утверждение плана распределения прибыли за 2024 год',
      'Approval of the Profit Distribution Plan for 2024',
      '2024 йил фойдасини тақсимлаш режасини тасдиқлаш',
      'Каримов Б.Р. — Председатель НС',
      'Каримов Б.Р. — Председатель НС',
      'B. Karimov — Chairman of the Supervisory Board',
      'Б.Р.Каримов — Кузатув кенгаши раиси',
      'ru', 'original', 'reviewed', 'reviewed'
    )
  ON CONFLICT (id) DO NOTHING;

  -- Повестка готового заседания
  INSERT INTO public.agenda_items (
    id, meeting_id, org_id, order_index,
    title, title_ru, title_en, title_uz,
    presenter, presenter_ru, presenter_en, presenter_uz,
    source_language, translation_status_ru, translation_status_en, translation_status_uz
  ) VALUES
    (
      v_ai2_1, v_mtg_ready, v_org_id, 1,
      'Утверждение бизнес-плана АО «Алмаз Энерго» на 2026 год',
      'Утверждение бизнес-плана АО «Алмаз Энерго» на 2026 год',
      'Approval of the Business Plan of Almaz Energo JSC for 2026',
      'АЖ «Алмаз Энерго»нинг 2026 йилга бизнес-режасини тасдиқлаш',
      'Юсупова А.К. — Корпоративный секретарь',
      'Юсупова А.К. — Корпоративный секретарь',
      'A. Yusupova — Corporate Secretary',
      'А.К.Юсупова — Корпоратив котиб',
      'ru', 'original', 'reviewed', 'reviewed'
    ),
    (
      v_ai2_2, v_mtg_ready, v_org_id, 2,
      'Рассмотрение инвестиционной программы развития инфраструктуры на 2026–2028 годы',
      'Рассмотрение инвестиционной программы развития инфраструктуры на 2026–2028 годы',
      'Review of the Infrastructure Development Investment Program for 2026–2028',
      '2026–2028 йилларга инфратузилмани ривожлантириш инвестиция дастурини кўриб чиқиш',
      'Каримов Б.Р. — Председатель НС',
      'Каримов Б.Р. — Председатель НС',
      'B. Karimov — Chairman of the Supervisory Board',
      'Б.Р.Каримов — Кузатув кенгаши раиси',
      'ru', 'original', 'reviewed', 'reviewed'
    )
  ON CONFLICT (id) DO NOTHING;

  -- ── 7. Уведомления ──────────────────────────────────────────────────────────

  -- Для председателя и члена НС — приглашение на готовое заседание
  INSERT INTO public.notifications (
    recipient_id, type,
    title, title_ru, title_en, title_uz,
    body,  body_en,  body_uz,
    related_entity_type, related_entity_id, is_read, created_at
  ) VALUES
    (
      v_mem_id, 'meeting_invitation',
      'Новое заседание', 'Новое заседание', 'New Meeting', 'Янги йиғилиш',
      'Заседание НС по утверждению бизнес-плана на 2026 год',
      'Supervisory Board Meeting on Approval of Business Plan for 2026',
      '2026 йилга бизнес-режани тасдиқлаш бўйича НС йиғилиши',
      'ns_meeting', v_mtg_ready::text, false, now() - interval '2 weeks'
    ),
    (
      v_vi_id, 'meeting_invitation',
      'Новое заседание', 'Новое заседание', 'New Meeting', 'Янги йиғилиш',
      'Заседание НС по утверждению бизнес-плана на 2026 год',
      'Supervisory Board Meeting on Approval of Business Plan for 2026',
      '2026 йилга бизнес-режани тасдиқлаш бўйича НС йиғилиши',
      'ns_meeting', v_mtg_ready::text, false, now() - interval '2 weeks'
    ),
    (
      v_mem_id, 'meeting_invitation',
      'Новое заседание', 'Новое заседание', 'New Meeting', 'Янги йиғилиш',
      'Заседание НС по рассмотрению кадровых вопросов',
      'Supervisory Board Meeting on Personnel Matters',
      'Кадр масалалари бўйича НС йиғилиши',
      'ns_meeting', v_mtg_new::text, false, now() - interval '3 days'
    ),
    (
      v_vi_id, 'meeting_invitation',
      'Новое заседание', 'Новое заседание', 'New Meeting', 'Янги йиғилиш',
      'Заседание НС по рассмотрению кадровых вопросов',
      'Supervisory Board Meeting on Personnel Matters',
      'Кадр масалалари бўйича НС йиғилиши',
      'ns_meeting', v_mtg_new::text, false, now() - interval '3 days'
    );

END;
$$;
