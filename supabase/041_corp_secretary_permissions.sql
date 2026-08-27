-- ============================================================
-- Migration 041: Расширение прав corp_secretary — ОТМЕНЕНА
--
-- Исходная версия этой миграции была нерабочей: она создавала политики
-- на несуществующих таблицах (ns_meetings, ns_agenda_items,
-- work_plan_meetings, work_plan_agenda_items, agenda_brief_langs)
-- и ссылалась на несуществующие колонки (agenda_briefs.agenda_item_id,
-- meetings.org_id вместо organization_id), из-за чего падала при
-- чистой накатке базы.
--
-- Полностью заменена миграцией 044_fix_corp_secretary_permissions.sql,
-- где те же права выданы на реальных таблицах (board_plan_meetings,
-- board_plan_agenda_items и т.д.) с правильными именами колонок.
--
-- Файл сохранён как no-op, чтобы не ломать нумерацию и порядок накатки.
-- ============================================================

SELECT 1; -- no-op: см. 044_fix_corp_secretary_permissions.sql
