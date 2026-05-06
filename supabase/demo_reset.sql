-- ============================================================
-- DEMO RESET — удаляет все demo-данные и возвращает к исходному состоянию
-- Запустить в Supabase SQL Editor когда нужно сбросить демо
-- ============================================================

DO $$
DECLARE
  v_org_id   uuid := 'de000000-0000-0000-0000-000000000001';
  v_sec_id   uuid := 'de000000-0000-0000-0000-000000000011';
  v_mem_id   uuid := 'de000000-0000-0000-0000-000000000012';
  v_vi_id    uuid := 'de000000-0000-0000-0000-000000000013';
  v_mtg_done  uuid := 'de000000-0000-0000-0000-000000000021';
  v_mtg_ready uuid := 'de000000-0000-0000-0000-000000000022';
  v_mtg_new   uuid := 'de000000-0000-0000-0000-000000000023';
BEGIN
  -- Удаляем уведомления созданные тестировщиками
  DELETE FROM public.notifications
  WHERE recipient_id IN (v_sec_id, v_mem_id, v_vi_id);

  -- Удаляем задачи если были созданы
  DELETE FROM public.board_tasks
  WHERE organization_id = v_org_id;

  -- Удаляем пункты повестки (созданные тестировщиками)
  DELETE FROM public.agenda_items
  WHERE meeting_id IN (v_mtg_done, v_mtg_ready, v_mtg_new);

  -- Удаляем заседания
  DELETE FROM public.meetings
  WHERE id IN (v_mtg_done, v_mtg_ready, v_mtg_new);

  -- Удаляем профили
  DELETE FROM public.profiles
  WHERE id IN (v_sec_id, v_mem_id, v_vi_id);

  -- Удаляем auth-пользователей
  DELETE FROM auth.users
  WHERE id IN (v_sec_id, v_mem_id, v_vi_id);

  -- Удаляем организацию
  DELETE FROM public.organizations
  WHERE id = v_org_id;

END;
$$;

-- После сброса можно снова запустить demo_seed.sql
