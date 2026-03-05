-- ============================================================
-- Импорт «План работ НС АО «РЭС» на 2025-2026 годы»
-- Запускать ПОСЛЕ 018_board_work_plans.sql
--
-- ИДЕМПОТЕНТНЫЙ: повторный запуск не создаёт дубликатов.
-- Импортируются ТОЛЬКО будущие заседания (planned_date_from >= '2026-03-01').
-- ============================================================

DO $$
DECLARE
  _org_id uuid;
  _plan_id uuid;
  _pm3 uuid;
  _pm4 uuid;
  _pm5 uuid;
  _pm6 uuid;
  _user_id uuid;
  _meeting_id uuid;
BEGIN
  -- Берём первую организацию (в платформе одна)
  SELECT id INTO _org_id FROM public.organizations LIMIT 1;
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Организация не найдена. Сначала создайте организацию.';
  END IF;

  -- Берём admin / chairman для created_by (profiles.id = auth.uid())
  SELECT id INTO _user_id
  FROM public.profiles
  WHERE organization_id = _org_id AND role IN ('admin', 'chairman')
  LIMIT 1;

  IF _user_id IS NULL THEN
    SELECT id INTO _user_id
    FROM public.profiles
    WHERE organization_id = _org_id
    LIMIT 1;
  END IF;

  -- ============================================================
  -- 1. ПЛАН РАБОТ
  -- ============================================================
  SELECT id INTO _plan_id
  FROM public.board_work_plans
  WHERE organization_id = _org_id AND title = 'План работ НС АО «РЭС» на 2025-2026 годы'
  LIMIT 1;

  IF _plan_id IS NULL THEN
    INSERT INTO public.board_work_plans (organization_id, title, period_start, period_end, status)
    VALUES (_org_id, 'План работ НС АО «РЭС» на 2025-2026 годы', '2025-10-01', '2026-07-31', 'approved')
    RETURNING id INTO _plan_id;
  END IF;

  -- ============================================================
  -- Заседания 1 и 2 — ПРОШЕДШИЕ, записываем как completed (без meetings)
  -- ============================================================

  -- Заседание 1: 25-30 октября 2025 (ПРОШЛО)
  INSERT INTO public.board_plan_meetings (plan_id, meeting_number, planned_date_range_text, planned_date_from, planned_date_to, status)
  VALUES (_plan_id, 1, '25-30 октября 2025 г.', '2025-10-25', '2025-10-30', 'completed')
  ON CONFLICT (plan_id, meeting_number) DO NOTHING;

  -- Повестка заседания 1
  PERFORM 1 FROM public.board_plan_meetings WHERE plan_id = _plan_id AND meeting_number = 1;
  SELECT id INTO _pm3 FROM public.board_plan_meetings WHERE plan_id = _plan_id AND meeting_number = 1;
  INSERT INTO public.board_plan_agenda_items (plan_meeting_id, order_no, title) VALUES
    (_pm3, 1, 'Утверждение плана работ Наблюдательного совета Общества'),
    (_pm3, 2, 'Рассмотрение отчета исполнительного органа Общества об итогах финансово-хозяйственной деятельности Общества за 1 полугодие 2025 года'),
    (_pm3, 3, 'Рассмотрение отчета о ходе процессов трансформации и проделанной работе по реализации ожиданий акционеров Общества за третий квартал 2025 года'),
    (_pm3, 4, 'Ознакомление с ключевыми показателями эффективности (КПЭ) деятельности председателя правления и заместителей председателя правления Общества за третий квартал 2025 года'),
    (_pm3, 5, 'Рассмотрение отчета Службы внутреннего аудита Общества по результатам финансово-хозяйственной деятельности Общества за 1 полугодие 2025 года'),
    (_pm3, 6, 'Рассмотрение плана-графика государственных закупок Общества, проводимых в III и IV кварталах 2025 года')
  ON CONFLICT (plan_meeting_id, order_no) DO NOTHING;

  -- Заседание 2: 15-20 ноября 2025 (ПРОШЛО)
  INSERT INTO public.board_plan_meetings (plan_id, meeting_number, planned_date_range_text, planned_date_from, planned_date_to, status)
  VALUES (_plan_id, 2, '15-20 ноября 2025 г.', '2025-11-15', '2025-11-20', 'completed')
  ON CONFLICT (plan_id, meeting_number) DO NOTHING;

  SELECT id INTO _pm3 FROM public.board_plan_meetings WHERE plan_id = _plan_id AND meeting_number = 2;
  INSERT INTO public.board_plan_agenda_items (plan_meeting_id, order_no, title) VALUES
    (_pm3, 1, 'Рассмотрение отчета исполнительного органа Общества об итогах финансово-хозяйственной деятельности за 9 месяцев 2025 года'),
    (_pm3, 2, 'Ознакомление с ключевыми показателями эффективности (КПЭ) деятельности председателя правления и заместителей председателя правления Общества за 9 месяцев 2025 года'),
    (_pm3, 3, 'Рассмотрение отчета Службы внутреннего аудита Общества по результатам финансово-хозяйственной деятельности за 9 месяцев 2025 года'),
    (_pm3, 4, 'Рассмотрение отчета о ходе процессов трансформации и проделанной работе по реализации ожиданий акционеров Общества за 9 месяцев 2025 года'),
    (_pm3, 5, 'Рассмотрение плана-графика государственных закупок Общества, проводимых в 1 квартале 2026 года'),
    (_pm3, 6, 'Рассмотрение проекта по утверждению бюджет-плана Общества на 2026 год')
  ON CONFLICT (plan_meeting_id, order_no) DO NOTHING;

  -- ============================================================
  -- Заседание 3: 15-20 мая 2026 (БУДУЩЕЕ → создаём meeting)
  -- ============================================================
  INSERT INTO public.board_plan_meetings (plan_id, meeting_number, planned_date_range_text, planned_date_from, planned_date_to, status)
  VALUES (_plan_id, 3, '15-20 мая 2026 г.', '2026-05-15', '2026-05-20', 'planned')
  ON CONFLICT (plan_id, meeting_number) DO NOTHING;

  SELECT id INTO _pm3 FROM public.board_plan_meetings WHERE plan_id = _plan_id AND meeting_number = 3;

  INSERT INTO public.board_plan_agenda_items (plan_meeting_id, order_no, title) VALUES
    (_pm3, 1, 'Рассмотрение отчета исполнительного органа Общества об итогах финансово-хозяйственной деятельности за 1 квартал 2026 года'),
    (_pm3, 2, 'Ознакомление с ключевыми показателями эффективности (КПЭ) деятельности председателя правления и заместителей председателя правления Общества за 1 квартал 2026 года'),
    (_pm3, 3, 'Рассмотрение отчета Службы внутреннего аудита Общества по результатам финансово-хозяйственной деятельности за 1 квартал 2026 года'),
    (_pm3, 4, 'Утверждение плана работы и сметы расходов Службы внутреннего аудита Общества до конца 2026 года'),
    (_pm3, 5, 'Рассмотрение отчета о процессах трансформации и проделанной работе по реализации ожиданий акционеров Общества за первый квартал 2026 года'),
    (_pm3, 6, 'Рассмотрение плана-графика государственных закупок, проводимых Обществом во 2 квартале 2026 года'),
    (_pm3, 7, 'Рассмотрение результатов независимой оценки системы корпоративного управления Общества за 2025 год'),
    (_pm3, 8, 'Одобрение договоров, заключаемых Обществом с дочерними обществами в процессе осуществления текущей хозяйственной деятельности в рамках реализации государственных инвестиционных программ в 2025 году, в соответствии с требованиями законодательства о государственных закупках'),
    (_pm3, 9, 'Утверждение годового плана управления рисками: реестра рисков, карты рисков, ключевых индикаторов риска, плана реагирования на риски и утверждение уровня риска Компании')
  ON CONFLICT (plan_meeting_id, order_no) DO NOTHING;

  -- Создаём событие в meetings (если ещё нет)
  IF NOT EXISTS (SELECT 1 FROM public.meetings WHERE plan_meeting_id = _pm3) THEN
    INSERT INTO public.meetings (organization_id, title, start_at, status, created_by, source, plan_meeting_id)
    VALUES (_org_id, 'Заседание НС №3', '2026-05-15T10:00:00+05:00', 'scheduled', _user_id, 'work_plan', _pm3)
    RETURNING id INTO _meeting_id;
    UPDATE public.board_plan_meetings SET linked_meeting_id = _meeting_id WHERE id = _pm3;
  END IF;

  -- ============================================================
  -- Заседание 4: 5-10 июня 2026 (БУДУЩЕЕ → создаём meeting)
  -- ============================================================
  INSERT INTO public.board_plan_meetings (plan_id, meeting_number, planned_date_range_text, planned_date_from, planned_date_to, status)
  VALUES (_plan_id, 4, '5-10 июня 2026 года', '2026-06-05', '2026-06-10', 'planned')
  ON CONFLICT (plan_id, meeting_number) DO NOTHING;

  SELECT id INTO _pm4 FROM public.board_plan_meetings WHERE plan_id = _plan_id AND meeting_number = 4;

  INSERT INTO public.board_plan_agenda_items (plan_meeting_id, order_no, title) VALUES
    (_pm4, 1, 'Предварительное рассмотрение вопросов, включенных в повестку дня годового Общего собрания акционеров по итогам финансово-хозяйственной деятельности Общества за 2025 год'),
    (_pm4, 2, 'Рассмотрение вопросов, связанных с проведением годового Общего собрания акционеров по итогам финансово-хозяйственной деятельности Общества за 2025 год'),
    (_pm4, 3, 'Рассмотрение отчета о работе Наблюдательного совета Общества за 2025 год')
  ON CONFLICT (plan_meeting_id, order_no) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.meetings WHERE plan_meeting_id = _pm4) THEN
    INSERT INTO public.meetings (organization_id, title, start_at, status, created_by, source, plan_meeting_id)
    VALUES (_org_id, 'Заседание НС №4', '2026-06-05T10:00:00+05:00', 'scheduled', _user_id, 'work_plan', _pm4)
    RETURNING id INTO _meeting_id;
    UPDATE public.board_plan_meetings SET linked_meeting_id = _meeting_id WHERE id = _pm4;
  END IF;

  -- ============================================================
  -- Заседание 5: 20-28 июня 2026 (БУДУЩЕЕ → создаём meeting)
  -- ============================================================
  INSERT INTO public.board_plan_meetings (plan_id, meeting_number, planned_date_range_text, planned_date_from, planned_date_to, status)
  VALUES (_plan_id, 5, '20-28 июня 2026 года', '2026-06-20', '2026-06-28', 'planned')
  ON CONFLICT (plan_id, meeting_number) DO NOTHING;

  SELECT id INTO _pm5 FROM public.board_plan_meetings WHERE plan_id = _plan_id AND meeting_number = 5;

  INSERT INTO public.board_plan_agenda_items (plan_meeting_id, order_no, title) VALUES
    (_pm5, 1, 'Рассмотрение отчета исполнительного органа Общества об итогах финансово-хозяйственной деятельности Общества за 2025 год и годового отчета Общества'),
    (_pm5, 2, 'Ознакомление с ключевыми показателями эффективности (КПЭ) деятельности председателя правления и заместителей председателя правления Общества за 2025 год'),
    (_pm5, 3, 'Рассмотрение отчета Службы внутреннего аудита Общества по результатам финансово-хозяйственной деятельности Общества за 2025 год'),
    (_pm5, 4, 'Рассмотрение отчета о ходе процесса трансформации Общества по итогам 2025 года и проведенной работе по реализации ожиданий акционеров'),
    (_pm5, 5, 'Рассмотрение вопроса о продлении срока трудовых договоров с членами Исполнительного органа Общества'),
    (_pm5, 6, 'Рассмотрение отчета внешней аудиторской организации по результатам финансово-хозяйственной деятельности Общества за 2025 год, подготовленного в соответствии с международными стандартами финансовой отчетности'),
    (_pm5, 7, 'Рассмотрение прибылей и убытков Общества за 2025 год и вопроса о выплате дивидендов акционерам')
  ON CONFLICT (plan_meeting_id, order_no) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.meetings WHERE plan_meeting_id = _pm5) THEN
    INSERT INTO public.meetings (organization_id, title, start_at, status, created_by, source, plan_meeting_id)
    VALUES (_org_id, 'Заседание НС №5', '2026-06-20T10:00:00+05:00', 'scheduled', _user_id, 'work_plan', _pm5)
    RETURNING id INTO _meeting_id;
    UPDATE public.board_plan_meetings SET linked_meeting_id = _meeting_id WHERE id = _pm5;
  END IF;

  -- ============================================================
  -- Заседание 6: 10-15 июля 2026 (БУДУЩЕЕ → создаём meeting)
  -- ============================================================
  INSERT INTO public.board_plan_meetings (plan_id, meeting_number, planned_date_range_text, planned_date_from, planned_date_to, status)
  VALUES (_plan_id, 6, '10-15 июля 2026 года', '2026-07-10', '2026-07-15', 'planned')
  ON CONFLICT (plan_id, meeting_number) DO NOTHING;

  SELECT id INTO _pm6 FROM public.board_plan_meetings WHERE plan_id = _plan_id AND meeting_number = 6;

  INSERT INTO public.board_plan_agenda_items (plan_meeting_id, order_no, title) VALUES
    (_pm6, 1, 'Рассмотрение отчета о выполнении решений Наблюдательного совета Общества'),
    (_pm6, 2, 'Обзор ежегодного отчета о соблюдении нормативных требований и противодействии коррупции'),
    (_pm6, 3, 'Ежегодный отчет о реализации стратегии сообщества (и ее обновлении/проверке)'),
    (_pm6, 4, 'Рассмотрение отчета о деятельности дочерних обществ за прошедший год'),
    (_pm6, 5, 'Отчет о выполнении рекомендаций службы внутреннего аудита')
  ON CONFLICT (plan_meeting_id, order_no) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.meetings WHERE plan_meeting_id = _pm6) THEN
    INSERT INTO public.meetings (organization_id, title, start_at, status, created_by, source, plan_meeting_id)
    VALUES (_org_id, 'Заседание НС №6', '2026-07-10T10:00:00+05:00', 'scheduled', _user_id, 'work_plan', _pm6)
    RETURNING id INTO _meeting_id;
    UPDATE public.board_plan_meetings SET linked_meeting_id = _meeting_id WHERE id = _pm6;
  END IF;

  RAISE NOTICE 'Импорт плана работ завершён. Создано 4 заседания (№3-6) в календаре. Заседания №1-2 отмечены как выполненные (даты в прошлом).';
END
$$;
