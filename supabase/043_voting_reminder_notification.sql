-- ============================================================
-- Migration 043: Уведомления о голосованиях
-- Добавить тип voting_reminder и триггер для напоминания
-- ============================================================

-- 1. Добавить новый тип в enum
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'voting_reminder';

-- 2. Триггер: при создании нового голосования — уведомить всех board_member и chairman
CREATE OR REPLACE FUNCTION public.fn_notify_voting_created()
RETURNS trigger AS $$
DECLARE
  member RECORD;
BEGIN
  -- Уведомить всех board_member и chairman из той же организации
  FOR member IN
    SELECT p.id AS user_id
    FROM public.profiles p
    WHERE p.org_id = NEW.org_id
      AND p.role IN ('board_member', 'chairman')
      AND p.id != auth.uid()
  LOOP
    INSERT INTO public.notifications (recipient_id, type, title, body, related_entity_type, related_entity_id)
    VALUES (
      member.user_id,
      'voting_reminder',
      NEW.title,
      'Начато новое голосование. Пожалуйста, проголосуйте.',
      'voting',
      NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_voting_created ON public.votings;
CREATE TRIGGER trg_notify_voting_created
  AFTER INSERT ON public.votings
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_voting_created();

-- 3. Обновить кэш PostgREST
NOTIFY pgrst, 'reload schema';
