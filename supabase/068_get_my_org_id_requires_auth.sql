-- ============================================================
-- Migration 068: get_my_org_id() не должна отвечать анониму
--
-- Проблема. 029_fix_get_my_org_id.sql переопределила функцию как
--   SELECT id FROM public.organizations LIMIT 1
-- ради single-company схемы. Но функция SECURITY DEFINER и не смотрит
-- на auth.uid(): анонимный запрос с publishable-ключом (он лежит в
-- JS-бандле у каждого посетителя) получает тот же org_id, что и
-- сотрудник. Все политики вида
--   USING (org_id = public.get_my_org_id())
-- без явного TO authenticated стали эквивалентны USING (true).
--
-- Подтверждено 15.09.2026: GET /rest/v1/votings и /rest/v1/documents
-- с одним лишь anon-ключом возвращали строки (вопросы повестки на
-- голосовании, названия и пути документов). meetings / profiles /
-- board_tasks не текли — у них политики уже TO authenticated.
--
-- Решение. Сохраняем single-company поведение (организация одна,
-- profiles.organization_id может быть не заполнен), но возвращаем
-- NULL, если сессии нет. NULL не равен ни одному org_id, и все
-- 27 политик, опирающихся на функцию, закрываются разом.
--
-- Идемпотентная.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    ELSE COALESCE(
      (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()),
      (SELECT o.id FROM public.organizations o ORDER BY o.created_at LIMIT 1)
    )
  END;
$$;

-- Ремень к подтяжкам: явный запрет анонимной роли на таблицах, которые
-- текли. Даже если кто-то снова перепишет функцию, anon останется без
-- SELECT. Остальные права роли authenticated не меняются.
REVOKE SELECT ON public.votings  FROM anon;
REVOKE SELECT ON public.documents FROM anon;
REVOKE SELECT ON public.votes     FROM anon;
REVOKE SELECT ON public.agenda_items FROM anon;
