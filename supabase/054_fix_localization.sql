-- ============================================================
-- Migration 054: Fix localization issues
-- 1. Fix notify_meeting_invitation trigger (wrong column names in 049)
-- 2. Add EN/UZ translations for existing meetings
-- 3. Add EN/UZ translations for existing agenda items
-- 4. Patch existing notifications missing title_en/body_en
-- ============================================================

-- ── 1. Fix notify_meeting_invitation (was using user_id/org_id — wrong) ───────

CREATE OR REPLACE FUNCTION public.notify_meeting_invitation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rec record;
BEGIN
  IF NEW.status <> 'scheduled' THEN RETURN NEW; END IF;

  FOR _rec IN
    SELECT p.id AS recipient
    FROM public.profiles p
    WHERE p.organization_id = NEW.organization_id
  LOOP
    IF _rec.recipient <> auth.uid() THEN
      INSERT INTO public.notifications
        (recipient_id, type, title, body, title_uz, title_en, body_uz, body_en,
         related_entity_type, related_entity_id)
      VALUES (
        _rec.recipient,
        'meeting_invitation',
        coalesce(NEW.title_ru, NEW.title, 'Новое заседание'),
        coalesce(NEW.title_ru, NEW.title, 'Заседание'),
        'Янги йиғилиш',
        'New Meeting',
        coalesce(NEW.title_uz, NEW.title, 'Мажлис'),
        coalesce(NEW.title_en, NEW.title, 'Meeting'),
        'ns_meeting',
        NEW.id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ── 2. Update meetings — add EN and UZ translations ────────────────────────────

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on Business Plan Approval for 2026 (New Edition)',
  title_uz = '2026 йилга бизнес-режани янги таҳрирда тасдиқлаш бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%утверждению БП на 2026%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on Energy Audit',
  title_uz = 'Энергетик аудит бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%энергоаудит%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on Q1 2026 Results',
  title_uz = '2026 йилнинг 1-чорак якунлари бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%итогам 1 квартала 2026%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on Annual General Shareholders Meeting Matters',
  title_uz = 'Йиллик умумий акциядорлар йиғилиши масалалари бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%годового Общего собрания акционеров%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on 2025 Annual Results',
  title_uz = '2025 йил якунлари бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%итогам 2025 года%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on Resolution Execution and Annual Control',
  title_uz = 'Қарорларни бажариш ва йиллик назорат бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%исполнению решений и годовому контролю%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on Chairman Election, Q2 Procurement Plan Approval and Committee Formation',
  title_uz = 'КК раисини сайлаш, 2-чорак харид режасини тасдиқлаш ва қўмиталарни ташкил этиш бўйича йиғилиш',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%выбору председателя%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.meetings SET
  title_en = 'Supervisory Board Meeting on External Auditor Approval',
  title_uz = 'Ташқи аудиторни тасдиқлаш бўйича Кузатув кенгаши йиғилиши',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%утверждению внешнего аудитора%'
  AND (title_en IS NULL OR title_en = '');

-- ── 3. Update agenda_items — add EN and UZ translations ───────────────────────

UPDATE public.agenda_items SET
  title_en = 'On Approval of the Business Plan of JSC "Regional Electrical Power Networks" for 2026 (New Edition)',
  title_uz = 'АЖ "Минтақавий электр тармоқлари"нинг 2026 йилга мўлжалланган бизнес-режасини янги таҳрирда тасдиқлаш тўғрисида',
  presenter_en = 'M. Muydinov — Head of Economic Analysis Department',
  presenter_uz = 'М.Муйдинов — иқтисодий таҳлил бошқармаси бошлиғи',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%утверждении Бизнес-плана%2026%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.agenda_items SET
  title_en = 'On Review of the Report on Cost Reduction Measures of JSC "Regional Electrical Power Networks" for Q1 2026',
  title_uz = 'АЖ "Минтақавий электр тармоқлари"нинг 2026 йил 1-чорак якунлари бўйича таннарх камайтириш чора-тадбирлари ижросини кўриб чиқиш тўғрисида',
  presenter_en = 'M. Muydinov — Head of Economic Analysis Department',
  presenter_uz = 'М.Муйдинов — иқтисодий таҳлил бошқармаси бошлиғи',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%снижению себестоимости%'
  AND (title_en IS NULL OR title_en = '');

UPDATE public.agenda_items SET
  title_en = 'On Conducting an Energy Audit at JSC "Regional Electrical Power Networks" and Establishing a Systematic Approach to Energy and Gas Conservation',
  title_uz = 'АЖ "Минтақавий электр тармоқлари"да энергетик аудит ўтказиш ва электр энергияси ва газни тежашга тизимли ёндашувни йўлга қўйиш масаласини кўриб чиқиш',
  presenter_en = 'B. Tadzhibaev — Company Energy Manager',
  presenter_uz = 'Б.Тажибаев — компания энергетик менежери',
  translation_status_en = 'reviewed',
  translation_status_uz = 'reviewed'
WHERE coalesce(title_ru, title) ILIKE '%энергетического аудита%'
  AND (title_en IS NULL OR title_en = '');

-- ── 4. Patch existing notifications missing title_en ──────────────────────────

-- meeting_invitation notifications: title should be "New Meeting"
UPDATE public.notifications SET
  title_en = 'New Meeting',
  title_uz = 'Янги йиғилиш'
WHERE type = 'meeting_invitation'
  AND (title_en IS NULL OR title_en = '');

-- meeting_video_conference_activated: title should be "Video conference activated"
UPDATE public.notifications SET
  title_en = 'Video conference activated',
  title_uz = 'Видеоконференция фаоллаштирилди'
WHERE type = 'meeting_video_conference_activated'
  AND (title_en IS NULL OR title_en = '');

-- task_assigned notifications
UPDATE public.notifications SET
  title_en = 'New Task',
  title_uz = 'Янги топшириқ'
WHERE type = 'task_assigned'
  AND (title_en IS NULL OR title_en = '');

-- task_comment notifications
UPDATE public.notifications SET
  title_en = 'New Comment',
  title_uz = 'Янги изоҳ'
WHERE type = 'task_comment'
  AND (title_en IS NULL OR title_en = '');

-- voting_reminder notifications
UPDATE public.notifications SET
  title_en = 'Voting Reminder',
  title_uz = 'Овоз бериш эслатмаси'
WHERE type = 'voting_reminder'
  AND (title_en IS NULL OR title_en = '');
