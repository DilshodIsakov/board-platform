-- ============================================================
-- Migration 053: Fix video conference activation trigger
-- Исправление триггера уведомлений при активации видеоконференции
-- Проблема: триггер ссылался на profiles.user_id и profiles.org_id,
-- но в реальной БД это profiles.id и profiles.organization_id
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_video_conference_activated()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
BEGIN
  -- Only fire when video_conference_enabled goes from false/null → true
  IF NOT (COALESCE(OLD.video_conference_enabled, false) = false
          AND NEW.video_conference_enabled = true) THEN
    RETURN NEW;
  END IF;

  -- Get all profiles in the same organization via the meeting's org
  FOR _rec IN
    SELECT p.id AS recipient
    FROM public.profiles p
    WHERE p.organization_id = NEW.organization_id
  LOOP
    INSERT INTO public.notifications
      (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
       related_entity_type, related_entity_id)
    VALUES (
      _rec.recipient,
      'meeting_video_conference_activated',
      'Видеоконференция активирована',
      'Для заседания «' || coalesce(NEW.title_ru, NEW.title, '') || '» активирована видеоконференция. Вы можете подключиться по кнопке в карточке заседания.',
      'Видеоконференция фаоллаштирилди',
      'Video conference activated',
      '«' || coalesce(NEW.title_uz, NEW.title, '') || '» мажлиси учун видеоконференция фаоллаштирилди. Мажлис карточкасидаги тугма орқали уланишингиз мумкин.',
      'Video conference for "' || coalesce(NEW.title_en, NEW.title, '') || '" has been activated. You can join using the button on the meeting card.',
      'ns_meeting',
      NEW.id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;
