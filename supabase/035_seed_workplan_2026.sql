-- ============================================================
-- Импорт «План работ НС на 2026 год» — актуальные заседания
-- Запускать в Supabase Dashboard → SQL Editor
--
-- ИДЕМПОТЕНТНЫЙ: повторный запуск не создаёт дубликатов.
-- Импортирует 4 заседания: май, июнь (2 шт), июль 2026
-- Трёхязычные поля: ru, uz (кириллица), en
-- Создаёт события в календаре (meetings) с привязкой
-- ============================================================

DO $$
DECLARE
  _org_id uuid;
  _plan_id uuid;
  _user_id uuid;
  _pm uuid;
  _meeting_id uuid;
BEGIN
  -- Организация (одна в системе)
  SELECT id INTO _org_id FROM public.organizations LIMIT 1;
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Организация не найдена. Сначала создайте организацию.';
  END IF;

  -- Админ для created_by
  SELECT id INTO _user_id FROM public.profiles WHERE role::text = 'admin' LIMIT 1;
  IF _user_id IS NULL THEN
    SELECT id INTO _user_id FROM public.profiles LIMIT 1;
  END IF;

  -- ============================================================
  -- 1. ПЛАН РАБОТ
  -- ============================================================
  SELECT id INTO _plan_id
  FROM public.board_work_plans
  WHERE organization_id = _org_id
    AND period_start = '2026-01-01' AND period_end = '2026-12-31'
  LIMIT 1;

  IF _plan_id IS NULL THEN
    INSERT INTO public.board_work_plans (
      organization_id, title, title_ru, title_uz, title_en,
      source_language, period_start, period_end, status
    ) VALUES (
      _org_id,
      'План работ Наблюдательного совета на 2026 год',
      'План работ Наблюдательного совета на 2026 год',
      'Кузатув кенгашининг 2026 йил учун иш режаси',
      'Supervisory Board Work Plan for 2026',
      'ru', '2026-01-01', '2026-12-31', 'approved'
    )
    RETURNING id INTO _plan_id;
    RAISE NOTICE 'Created work plan: %', _plan_id;
  ELSE
    -- Update multilingual fields if plan already exists
    UPDATE public.board_work_plans SET
      title_ru = 'План работ Наблюдательного совета на 2026 год',
      title_uz = 'Кузатув кенгашининг 2026 йил учун иш режаси',
      title_en = 'Supervisory Board Work Plan for 2026',
      source_language = 'ru',
      status = 'approved'
    WHERE id = _plan_id;
    RAISE NOTICE 'Updated existing work plan: %', _plan_id;
  END IF;

  -- ============================================================
  -- ЗАСЕДАНИЕ 1: 15–20 мая 2026 — Итоги 1 квартала
  -- ============================================================
  INSERT INTO public.board_plan_meetings (
    plan_id, meeting_number, planned_date_range_text,
    planned_date_from, planned_date_to, status
  ) VALUES (
    _plan_id, 1, '15–20 мая 2026 г.',
    '2026-05-15', '2026-05-20', 'planned'
  )
  ON CONFLICT (plan_id, meeting_number) DO UPDATE SET
    planned_date_range_text = EXCLUDED.planned_date_range_text,
    planned_date_from = EXCLUDED.planned_date_from,
    planned_date_to = EXCLUDED.planned_date_to,
    status = EXCLUDED.status;

  SELECT id INTO _pm FROM public.board_plan_meetings
  WHERE plan_id = _plan_id AND meeting_number = 1;

  -- Повестка заседания 1
  DELETE FROM public.board_plan_agenda_items WHERE plan_meeting_id = _pm;
  INSERT INTO public.board_plan_agenda_items (plan_meeting_id, order_no, title, title_ru, title_uz, title_en, source_language, translation_status_ru, translation_status_uz, translation_status_en) VALUES
    (_pm, 1,
     'Рассмотрение отчета исполнительного органа Общества об итогах финансово-хозяйственной деятельности за 1 квартал 2026 года.',
     'Рассмотрение отчета исполнительного органа Общества об итогах финансово-хозяйственной деятельности за 1 квартал 2026 года.',
     'Жамиятнинг 2026 йил 1-чораги молиявий хўжалик фаолияти натижалари якунлари юзасидан бўйича Жамият Ижро органининг ҳисоботини кўриб чиқиш.',
     'Review of the report by the Executive Body of the Company on the financial and economic performance results for the 1st quarter of 2026.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 2,
     'Ознакомление с ключевыми показателями эффективности (КПЭ) деятельности председателя правления и заместителей председателя правления Общества за 1 квартал 2026 года.',
     'Ознакомление с ключевыми показателями эффективности (КПЭ) деятельности председателя правления и заместителей председателя правления Общества за 1 квартал 2026 года.',
     'Жамият Бошқарув раиси ва бошқарув раиси ўринбосарларининг 2026 йил 1-чораги якунлари бўйича амалга оширган фаолиятининг энг муҳим самарадорлик кўрсаткичлари (KPI) билан танишиш.',
     'Review of the key performance indicators (KPI) for the activities of the Chairman and Deputy Chairmen of the Management Board for the 1st quarter of 2026.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 3,
     'Рассмотрение отчета Службы внутреннего аудита Общества по результатам финансово-хозяйственной деятельности за 1 квартал 2026 года.',
     'Рассмотрение отчета Службы внутреннего аудита Общества по результатам финансово-хозяйственной деятельности за 1 квартал 2026 года.',
     'Жамиятнинг 2026 йил 1-чораги якунлари бўйича молиявий хўжалик фаолияти натижалари юзасидан Жамият Ички аудит хизматининг ҳисоботини кўриб чиқиш.',
     'Review of the report by the Internal Audit Service of the Company on the financial and economic performance results for the 1st quarter of 2026.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 4,
     'Утверждение плана работы и сметы расходов Службы внутреннего аудита Общества до конца 2026 года.',
     'Утверждение плана работы и сметы расходов Службы внутреннего аудита Общества до конца 2026 года.',
     'Жамият Ички аудит хизматининг 2026 йилнинг охиригача бўлган иш-режаси ва харажатлар сметасини тасдиқлаш тўғрисида.',
     'Approval of the work plan and budget estimate of the Internal Audit Service until the end of 2026.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 5,
     'Рассмотрение отчета о процессах трансформации и проделанной работе по реализации ожиданий акционеров Общества за первый квартал 2026 года.',
     'Рассмотрение отчета о процессах трансформации и проделанной работе по реализации ожиданий акционеров Общества за первый квартал 2026 года.',
     'Жамиятнинг 2026 йил 1-чораги якунлари бўйича трансформация жараёнлари ҳамда акциядор кутилмаси юзасидан амалга оширилган ишлар тўғрисида ҳисоботни кўриб чиқиш.',
     'Report on the work carried out regarding transformation and shareholder expectations for the 1st quarter of 2026.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 6,
     'Рассмотрение плана-графика государственных закупок, проводимых Обществом во 2 квартале 2026 года.',
     'Рассмотрение плана-графика государственных закупок, проводимых Обществом во 2 квартале 2026 года.',
     'Жамият томонидан 2026 йилнинг 2-чорагида амалга ошириладиган давлат харидларининг жадвалини кўриб чиқиш.',
     'Review of the schedule of public procurements to be carried out in the 2nd and 3rd quarters of 2026.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 7,
     'Рассмотрение результатов независимой оценки системы корпоративного управления Общества за 2025 год.',
     'Рассмотрение результатов независимой оценки системы корпоративного управления Общества за 2025 год.',
     '2025 йил якунлари бўйича Жамият корпоратив бошқаруви тизимини мустақил баҳолаш натижаларини кўриб чиқиш.',
     'Review of the results of the independent assessment of the corporate governance system for 2025.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 8,
     'Одобрение договоров, заключаемых Обществом с дочерними обществами Общества в процессе осуществления текущей хозяйственной деятельности в рамках реализации государственных инвестиционных программ в 2025 году, в соответствии с требованиями законодательства о государственных закупках.',
     'Одобрение договоров, заключаемых Обществом с дочерними обществами Общества в процессе осуществления текущей хозяйственной деятельности в рамках реализации государственных инвестиционных программ в 2025 году, в соответствии с требованиями законодательства о государственных закупках.',
     'Жамият томонидан 2025 йилда давлат инвестиция дастурларини бажариш доирасида кундалик хўжалик фаолияти жараёнида Жамиятнинг аффилланган шахслари билан Давлат харидлари қонунчилиги талаблари асосида тузиладиган битимларни маъқуллаш.',
     'Approval of transactions to be concluded with affiliated persons during current business activities within the framework of state investment programs.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 9,
     'Утверждение годового плана управления рисками: реестра рисков, карты рисков, ключевых индикаторов риска, плана реагирования на риски и утверждение уровня риска Компании.',
     'Утверждение годового плана управления рисками: реестра рисков, карты рисков, ключевых индикаторов риска, плана реагирования на риски и утверждение уровня риска Компании.',
     'Рискларни бошқаришнинг йиллик режасини тасдиқлаш: рисклар реестри, хавф хариталари, хавфнинг асосий кўрсаткичлари ва хавф-хатарларга жавоб бериш режаси тасдиқлаш.',
     'Approval of the annual risk management plan: risk register, risk maps, key risk indicators, risk response plan, and the Company''s risk appetite.',
     'ru', 'original', 'reviewed', 'reviewed');

  -- Событие в календаре (meetings) для заседания 1
  IF NOT EXISTS (SELECT 1 FROM public.meetings WHERE plan_meeting_id = _pm) THEN
    INSERT INTO public.meetings (
      organization_id, title, title_ru, title_uz, title_en,
      source_language, start_at, status, created_by, source, plan_meeting_id
    ) VALUES (
      _org_id,
      'Заседание НС по итогам 1 квартала 2026 года',
      'Заседание НС по итогам 1 квартала 2026 года',
      '2026 йил 1-чорак якунлари бўйича Кузатув кенгаши йиғилиши',
      'Supervisory Board Meeting on Q1 2026 Results',
      'ru', '2026-05-15T10:00:00+05:00', 'scheduled', _user_id, 'work_plan', _pm
    )
    RETURNING id INTO _meeting_id;
    UPDATE public.board_plan_meetings SET linked_meeting_id = _meeting_id WHERE id = _pm;
    RAISE NOTICE 'Created meeting 1 in calendar: %', _meeting_id;
  END IF;

  -- ============================================================
  -- ЗАСЕДАНИЕ 2: 5–10 июня 2026 — Годовое ОСА
  -- ============================================================
  INSERT INTO public.board_plan_meetings (
    plan_id, meeting_number, planned_date_range_text,
    planned_date_from, planned_date_to, status
  ) VALUES (
    _plan_id, 2, '5–10 июня 2026 г.',
    '2026-06-05', '2026-06-10', 'planned'
  )
  ON CONFLICT (plan_id, meeting_number) DO UPDATE SET
    planned_date_range_text = EXCLUDED.planned_date_range_text,
    planned_date_from = EXCLUDED.planned_date_from,
    planned_date_to = EXCLUDED.planned_date_to,
    status = EXCLUDED.status;

  SELECT id INTO _pm FROM public.board_plan_meetings
  WHERE plan_id = _plan_id AND meeting_number = 2;

  DELETE FROM public.board_plan_agenda_items WHERE plan_meeting_id = _pm;
  INSERT INTO public.board_plan_agenda_items (plan_meeting_id, order_no, title, title_ru, title_uz, title_en, source_language, translation_status_ru, translation_status_uz, translation_status_en) VALUES
    (_pm, 1,
     'Предварительное рассмотрение вопросов, включенных в повестку дня годового Общего собрания акционеров по итогам финансово-хозяйственной деятельности Общества за 2025 год.',
     'Предварительное рассмотрение вопросов, включенных в повестку дня годового Общего собрания акционеров по итогам финансово-хозяйственной деятельности Общества за 2025 год.',
     'Жамиятнинг 2025 йил молиявий-хўжалик фаолияти якуни бўйича акциядорларнинг йиллик Умумий йиғилиши кун тартибига киритилаётган масалаларни дастлабки кўриб чиқиш.',
     'Preliminary review of the issues to be included in the agenda of the Annual General Meeting of Shareholders on the results of financial and economic performance for 2025.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 2,
     'Рассмотрение вопросов, связанных с проведением годового Общего собрания акционеров по итогам финансово-хозяйственной деятельности Общества за 2025 год.',
     'Рассмотрение вопросов, связанных с проведением годового Общего собрания акционеров по итогам финансово-хозяйственной деятельности Общества за 2025 год.',
     'Жамиятнинг 2025 йил молиявий-хўжалик фаолияти якуни бўйича акциядоларнинг йиллик Умумий йиғилиши ўтказилиши билан боғлик масалаларни кўриб чиқиш.',
     'Review of matters related to the holding of the Annual General Meeting of Shareholders based on the results of the Company''s financial and economic performance for 2025.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 3,
     'Рассмотрение отчета о работе Наблюдательного совета Общества за 2025 год.',
     'Рассмотрение отчета о работе Наблюдательного совета Общества за 2025 год.',
     'Жамият Кузатув кенгашининг 2025 йилда амалга оширган ишлари тўғрисидаги ҳисоботини кўриб чиқиш.',
     'Consideration of the report on the work of the Supervisory Board of the Company for 2025.',
     'ru', 'original', 'reviewed', 'reviewed');

  IF NOT EXISTS (SELECT 1 FROM public.meetings WHERE plan_meeting_id = _pm) THEN
    INSERT INTO public.meetings (
      organization_id, title, title_ru, title_uz, title_en,
      source_language, start_at, status, created_by, source, plan_meeting_id
    ) VALUES (
      _org_id,
      'Заседание НС по вопросам годового Общего собрания акционеров',
      'Заседание НС по вопросам годового Общего собрания акционеров',
      'Акциядорларнинг йиллик Умумий йиғилиши масалалари бўйича Кузатув кенгаши йиғилиши',
      'Supervisory Board Meeting on Annual General Meeting Matters',
      'ru', '2026-06-05T10:00:00+05:00', 'scheduled', _user_id, 'work_plan', _pm
    )
    RETURNING id INTO _meeting_id;
    UPDATE public.board_plan_meetings SET linked_meeting_id = _meeting_id WHERE id = _pm;
    RAISE NOTICE 'Created meeting 2 in calendar: %', _meeting_id;
  END IF;

  -- ============================================================
  -- ЗАСЕДАНИЕ 3: 20–28 июня 2026 — Итоги 2025 года
  -- ============================================================
  INSERT INTO public.board_plan_meetings (
    plan_id, meeting_number, planned_date_range_text,
    planned_date_from, planned_date_to, status
  ) VALUES (
    _plan_id, 3, '20–28 июня 2026 г.',
    '2026-06-20', '2026-06-28', 'planned'
  )
  ON CONFLICT (plan_id, meeting_number) DO UPDATE SET
    planned_date_range_text = EXCLUDED.planned_date_range_text,
    planned_date_from = EXCLUDED.planned_date_from,
    planned_date_to = EXCLUDED.planned_date_to,
    status = EXCLUDED.status;

  SELECT id INTO _pm FROM public.board_plan_meetings
  WHERE plan_id = _plan_id AND meeting_number = 3;

  DELETE FROM public.board_plan_agenda_items WHERE plan_meeting_id = _pm;
  INSERT INTO public.board_plan_agenda_items (plan_meeting_id, order_no, title, title_ru, title_uz, title_en, source_language, translation_status_ru, translation_status_uz, translation_status_en) VALUES
    (_pm, 1,
     'Рассмотрение отчета исполнительного органа Общества об итогах финансово-хозяйственной деятельности Общества за 2025 год и годового отчета Общества.',
     'Рассмотрение отчета исполнительного органа Общества об итогах финансово-хозяйственной деятельности Общества за 2025 год и годового отчета Общества.',
     'Жамиятнинг 2025 йил якунлари бўйича молиявий хўжалик фаолияти якунлари юзасидан Жамият Ижро органининг ҳисоботини ва Жамиятнинг йиллик ҳисоботини кўриб чиқиш.',
     'Review of the Executive Body''s report and the Annual Report of the Company on the financial and economic performance results for 2025.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 2,
     'Ознакомление с ключевыми показателями эффективности (КПЭ) деятельности председателя правления и заместителей председателя правления Общества за 2025 год.',
     'Ознакомление с ключевыми показателями эффективности (КПЭ) деятельности председателя правления и заместителей председателя правления Общества за 2025 год.',
     'Жамият Бошқарув раиси ва бошқарув раиси ўринбосарларининг 2025 йил якунлари бўйича амалга оширган фаолиятининг энг муҳим самарадорлик кўрсаткичлари (KPI) билан танишиш.',
     'Review of the key performance indicators (KPI) for the activities of the Chairman and Deputy Chairmen of the Management Board for 2025.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 3,
     'Рассмотрение отчета Службы внутреннего аудита Общества по результатам финансово-хозяйственной деятельности Общества за 2025 год.',
     'Рассмотрение отчета Службы внутреннего аудита Общества по результатам финансово-хозяйственной деятельности Общества за 2025 год.',
     'Жамиятнинг 2025 йил якунлари бўйича молиявий хўжалик фаолияти якунлари юзасидан Жамият Ички аудит хизматининг ҳисоботини кўриб чиқиш.',
     'Review of the report by the Internal Audit Service on the financial and economic performance results for 2025.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 4,
     'Рассмотрение отчета о ходе процесса трансформации Общества по итогам 2025 года и проведенной работе по реализации ожиданий акционеров.',
     'Рассмотрение отчета о ходе процесса трансформации Общества по итогам 2025 года и проведенной работе по реализации ожиданий акционеров.',
     'Жамиятнинг 2025 йил якунлари бўйича трансформация жараёнлари ҳамда акциядор кутилмаси юзасидан амалга оширилган ишлар тўғрисида ҳисоботни кўриб чиқиш.',
     'Report on the work carried out regarding transformation and shareholder expectations for the full year of 2025.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 5,
     'Рассмотрение вопроса о продлении срока трудовых договоров с членами Исполнительного органа Общества.',
     'Рассмотрение вопроса о продлении срока трудовых договоров с членами Исполнительного органа Общества.',
     'Жамият бошқарув аъзолари билан меҳнат шартномаларини амал қилиш муддатини узайтириш масаласини кўриб чиқиш.',
     'Review of the extension of employment contracts with the members of the Management Board.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 6,
     'Рассмотрение отчета внешней аудиторской организации по результатам финансово-хозяйственной деятельности Общества за 2025 год, подготовленного в соответствии с международными стандартами финансовой отчетности.',
     'Рассмотрение отчета внешней аудиторской организации по результатам финансово-хозяйственной деятельности Общества за 2025 год, подготовленного в соответствии с международными стандартами финансовой отчетности.',
     'Ташқи аудиторлик ташкилотининг Жамиятнинг 2025 йил якунлари бўйича молиявий хўжалик фаолияти натижалари юзасидан молиявий ҳисоботларнинг халқаро стандартларига кўра тайёрлаган ҳисоботини кўриб чиқиш.',
     'Review of the report prepared by the external audit organization on the financial and economic performance for 2025 in accordance with IFRS.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 7,
     'Рассмотрение прибылей и убытков Общества за 2025 год и вопроса о выплате дивидендов акционерам.',
     'Рассмотрение прибылей и убытков Общества за 2025 год и вопроса о выплате дивидендов акционерам.',
     'Жамиятнинг 2025 йил якунлари бўйича олинган фойда ва зарарларни ҳамда акциядорларга дивидендлар тўлаш масаласини кўриб чиқиш.',
     'Review of the profit and loss results for 2025 and the issue of dividend payments to shareholders.',
     'ru', 'original', 'reviewed', 'reviewed');

  IF NOT EXISTS (SELECT 1 FROM public.meetings WHERE plan_meeting_id = _pm) THEN
    INSERT INTO public.meetings (
      organization_id, title, title_ru, title_uz, title_en,
      source_language, start_at, status, created_by, source, plan_meeting_id
    ) VALUES (
      _org_id,
      'Заседание НС по итогам 2025 года',
      'Заседание НС по итогам 2025 года',
      '2025 йил якунлари бўйича Кузатув кенгаши йиғилиши',
      'Supervisory Board Meeting on 2025 Results',
      'ru', '2026-06-20T10:00:00+05:00', 'scheduled', _user_id, 'work_plan', _pm
    )
    RETURNING id INTO _meeting_id;
    UPDATE public.board_plan_meetings SET linked_meeting_id = _meeting_id WHERE id = _pm;
    RAISE NOTICE 'Created meeting 3 in calendar: %', _meeting_id;
  END IF;

  -- ============================================================
  -- ЗАСЕДАНИЕ 4: 10–15 июля 2026 — Исполнение решений
  -- ============================================================
  INSERT INTO public.board_plan_meetings (
    plan_id, meeting_number, planned_date_range_text,
    planned_date_from, planned_date_to, status
  ) VALUES (
    _plan_id, 4, '10–15 июля 2026 г.',
    '2026-07-10', '2026-07-15', 'planned'
  )
  ON CONFLICT (plan_id, meeting_number) DO UPDATE SET
    planned_date_range_text = EXCLUDED.planned_date_range_text,
    planned_date_from = EXCLUDED.planned_date_from,
    planned_date_to = EXCLUDED.planned_date_to,
    status = EXCLUDED.status;

  SELECT id INTO _pm FROM public.board_plan_meetings
  WHERE plan_id = _plan_id AND meeting_number = 4;

  DELETE FROM public.board_plan_agenda_items WHERE plan_meeting_id = _pm;
  INSERT INTO public.board_plan_agenda_items (plan_meeting_id, order_no, title, title_ru, title_uz, title_en, source_language, translation_status_ru, translation_status_uz, translation_status_en) VALUES
    (_pm, 1,
     'Рассмотрение отчета о выполнении решений Наблюдательного совета Общества.',
     'Рассмотрение отчета о выполнении решений Наблюдательного совета Общества.',
     'Жамият Кузатув кенгаши томонидан қабул қилинган қарорларининг бажарилиши тўғрисидаги ҳисоботини кўриб чиқиш.',
     'Consideration of the report on the implementation of decisions of the Supervisory Board of the Company.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 2,
     'Обзор ежегодного отчета о соблюдении нормативных требований и противодействии коррупции.',
     'Обзор ежегодного отчета о соблюдении нормативных требований и противодействии коррупции.',
     'Комплаенс ва коррупцияга қарши кураш бўйича йиллик ҳисоботини кўриб чиқиш.',
     'Annual compliance and anti-corruption report.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 3,
     'Ежегодный отчет о реализации стратегии сообщества (и ее обновлении/проверке).',
     'Ежегодный отчет о реализации стратегии сообщества (и ее обновлении/проверке).',
     'Жамият стратегияни амалга ошириш бўйича йиллик ҳисобот (ва уни янгилаш/тасдиқлаш).',
     'Annual report on the implementation of the strategy (including its update/approval).',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 4,
     'Рассмотрение отчета о деятельности дочерних обществ за прошедший год.',
     'Рассмотрение отчета о деятельности дочерних обществ за прошедший год.',
     'Ўтган йил учун шўъба корхоналарнинг фаолияти тўғрисида ҳисоботни кўриб чиқиш.',
     'Review of the report on the performance of subsidiary enterprises for the previous year.',
     'ru', 'original', 'reviewed', 'reviewed'),
    (_pm, 5,
     'Отчет о выполнении рекомендаций службы внутреннего аудита.',
     'Отчет о выполнении рекомендаций службы внутреннего аудита.',
     'Ички аудит ҳизмати томонидан берилган тавсияларни бажарилиши тўғрисида ҳисобот.',
     'Report on the progress of implementing internal and external audit recommendations.',
     'ru', 'original', 'reviewed', 'reviewed');

  IF NOT EXISTS (SELECT 1 FROM public.meetings WHERE plan_meeting_id = _pm) THEN
    INSERT INTO public.meetings (
      organization_id, title, title_ru, title_uz, title_en,
      source_language, start_at, status, created_by, source, plan_meeting_id
    ) VALUES (
      _org_id,
      'Заседание НС по исполнению решений и годовому контролю',
      'Заседание НС по исполнению решений и годовому контролю',
      'Қарорлар ижроси ва йиллик назорат бўйича Кузатув кенгаши йиғилиши',
      'Supervisory Board Meeting on Implementation Oversight and Annual Control',
      'ru', '2026-07-10T10:00:00+05:00', 'scheduled', _user_id, 'work_plan', _pm
    )
    RETURNING id INTO _meeting_id;
    UPDATE public.board_plan_meetings SET linked_meeting_id = _meeting_id WHERE id = _pm;
    RAISE NOTICE 'Created meeting 4 in calendar: %', _meeting_id;
  END IF;

  RAISE NOTICE '=== Импорт плана работ НС на 2026 год завершён ===';
  RAISE NOTICE 'Создано: 1 план, 4 заседания, 24 вопроса повестки, 4 события в календаре';
  RAISE NOTICE 'Все данные на 3 языках: ru, uz, en';
END
$$;
