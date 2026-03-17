-- ============================================================
-- CLEANUP SCRIPT: Подготовка платформы к реальной работе
-- АО «Региональные электрические сети»
--
-- ЗАПУСКАТЬ В: Supabase Dashboard → SQL Editor
-- ОСТАВЛЯЕТ: только jimbodd@mail.ru (admin)
-- УДАЛЯЕТ: все тестовые данные, пользователей и файлы
--
-- Безопасный: пропускает несуществующие таблицы
-- ============================================================

DO $$
BEGIN

-- ============================================================
-- 1. УВЕДОМЛЕНИЯ
-- ============================================================
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
  DELETE FROM public.notifications;
  RAISE NOTICE 'Cleared: notifications';
END IF;

-- ============================================================
-- 2. ЧАТЫ И СООБЩЕНИЯ
-- ============================================================
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_group_messages') THEN
  DELETE FROM public.chat_group_messages;
  RAISE NOTICE 'Cleared: chat_group_messages';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_group_members') THEN
  DELETE FROM public.chat_group_members;
  RAISE NOTICE 'Cleared: chat_group_members';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_groups') THEN
  DELETE FROM public.chat_groups;
  RAISE NOTICE 'Cleared: chat_groups';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages') THEN
  DELETE FROM public.messages;
  RAISE NOTICE 'Cleared: messages';
END IF;

-- ============================================================
-- 3. ГОЛОСОВАНИЕ (board meetings)
-- ============================================================
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'votes') THEN
  DELETE FROM public.votes;
  RAISE NOTICE 'Cleared: votes';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'meeting_vote_signatures') THEN
  DELETE FROM public.meeting_vote_signatures;
  RAISE NOTICE 'Cleared: meeting_vote_signatures';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'votings') THEN
  DELETE FROM public.votings;
  RAISE NOTICE 'Cleared: votings';
END IF;

-- ============================================================
-- 4. ПОВЕСТКА И РЕШЕНИЯ
-- ============================================================
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agenda_briefs') THEN
  DELETE FROM public.agenda_briefs;
  RAISE NOTICE 'Cleared: agenda_briefs';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'decisions') THEN
  DELETE FROM public.decisions;
  RAISE NOTICE 'Cleared: decisions';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agenda_items') THEN
  DELETE FROM public.agenda_items;
  RAISE NOTICE 'Cleared: agenda_items';
END IF;

-- ============================================================
-- 5. ЗАСЕДАНИЯ
-- ============================================================
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'meetings') THEN
  DELETE FROM public.meetings;
  RAISE NOTICE 'Cleared: meetings';
END IF;

-- ============================================================
-- 6. ОБЩЕЕ СОБРАНИЕ АКЦИОНЕРОВ
-- ============================================================
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shareholder_votes') THEN
  DELETE FROM public.shareholder_votes;
  RAISE NOTICE 'Cleared: shareholder_votes';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shareholder_materials') THEN
  DELETE FROM public.shareholder_materials;
  RAISE NOTICE 'Cleared: shareholder_materials';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shareholder_agenda_items') THEN
  DELETE FROM public.shareholder_agenda_items;
  RAISE NOTICE 'Cleared: shareholder_agenda_items';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shareholder_meetings') THEN
  DELETE FROM public.shareholder_meetings;
  RAISE NOTICE 'Cleared: shareholder_meetings';
END IF;

-- ============================================================
-- 7. ПОРУЧЕНИЯ (Tasks)
-- ============================================================
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'board_task_attachments') THEN
  DELETE FROM public.board_task_attachments;
  RAISE NOTICE 'Cleared: board_task_attachments';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'board_task_comments') THEN
  DELETE FROM public.board_task_comments;
  RAISE NOTICE 'Cleared: board_task_comments';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'board_task_assignees') THEN
  DELETE FROM public.board_task_assignees;
  RAISE NOTICE 'Cleared: board_task_assignees';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'board_tasks') THEN
  DELETE FROM public.board_tasks;
  RAISE NOTICE 'Cleared: board_tasks';
END IF;

-- ============================================================
-- 8. ПЛАН РАБОТ
-- ============================================================
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'board_plan_agenda_items') THEN
  DELETE FROM public.board_plan_agenda_items;
  RAISE NOTICE 'Cleared: board_plan_agenda_items';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'board_plan_meetings') THEN
  DELETE FROM public.board_plan_meetings;
  RAISE NOTICE 'Cleared: board_plan_meetings';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'board_work_plans') THEN
  DELETE FROM public.board_work_plans;
  RAISE NOTICE 'Cleared: board_work_plans';
END IF;

-- ============================================================
-- 9. ДОКУМЕНТООБОРОТ
-- ============================================================
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'documents') THEN
  DELETE FROM public.documents;
  RAISE NOTICE 'Cleared: documents';
END IF;

IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'doc_links') THEN
  DELETE FROM public.doc_links;
  RAISE NOTICE 'Cleared: doc_links';
END IF;

-- ============================================================
-- 10. ВИДЕОКОНФЕРЕНЦИИ
-- ============================================================
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'video_conferences') THEN
  DELETE FROM public.video_conferences;
  RAISE NOTICE 'Cleared: video_conferences';
ELSE
  RAISE NOTICE 'Skipped: video_conferences (table does not exist)';
END IF;

-- ============================================================
-- 11. УДАЛЕНИЕ ТЕСТОВЫХ ПОЛЬЗОВАТЕЛЕЙ
-- Удаляем из auth.identities и auth.users всех КРОМЕ jimbodd@mail.ru
-- Каскад: auth.users → profiles (ON DELETE CASCADE)
-- ============================================================

DELETE FROM auth.identities
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email != 'jimbodd@mail.ru'
);
RAISE NOTICE 'Cleared: auth.identities (test users)';

DELETE FROM auth.users
WHERE email != 'jimbodd@mail.ru';
RAISE NOTICE 'Cleared: auth.users (test users) + cascaded to profiles';

-- ============================================================
-- 12. УБЕДИТЬСЯ, ЧТО ADMIN ПРОФИЛЬ КОРРЕКТЕН
-- ============================================================
UPDATE public.profiles
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'jimbodd@mail.ru')
  AND role != 'admin';

RAISE NOTICE '=== CLEANUP COMPLETE ===';

END;
$$;

-- ============================================================
-- ПРОВЕРКА ПОСЛЕ ОЧИСТКИ (запустите отдельно)
-- ============================================================

-- Должен вернуть ТОЛЬКО jimbodd@mail.ru
SELECT au.email, p.role, p.full_name
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id;
