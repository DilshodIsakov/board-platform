-- 048_video_conference.sql
-- Add video conference fields to the meetings table

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS video_conference_url          text,
  ADD COLUMN IF NOT EXISTS video_conference_provider     text,
  ADD COLUMN IF NOT EXISTS video_conference_enabled      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_conference_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS video_conference_started_by   uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS video_conference_title        text,
  ADD COLUMN IF NOT EXISTS video_conference_notes        text;

-- Extend notification_type enum with new value
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'meeting_video_conference_activated';

-- ─── Trigger function: notify all org members when VC is activated ─────────────

CREATE OR REPLACE FUNCTION public.notify_video_conference_activated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  meeting_title text;
  org_member    RECORD;
BEGIN
  -- Only fire when video_conference_enabled transitions false → true
  IF (OLD.video_conference_enabled IS DISTINCT FROM NEW.video_conference_enabled)
     AND NEW.video_conference_enabled = true THEN

    meeting_title := COALESCE(NEW.title_ru, NEW.title, '');

    FOR org_member IN
      SELECT id FROM public.profiles
      WHERE organization_id = NEW.organization_id
    LOOP
      INSERT INTO public.notifications
        (recipient_id, type, title, body, related_entity_type, related_entity_id)
      VALUES (
        org_member.id,
        'meeting_video_conference_activated',
        'Видеоконференция активирована',
        'Для заседания «' || meeting_title || '» активирована видеоконференция. Вы можете подключиться по кнопке в карточке заседания.',
        'ns_meeting',
        NEW.id::text
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_video_conference_activated ON public.meetings;
CREATE TRIGGER on_video_conference_activated
  AFTER UPDATE ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_video_conference_activated();
