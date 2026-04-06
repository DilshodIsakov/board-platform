-- ============================================================
-- 056: Add multilingual description fields to committees
-- ============================================================

ALTER TABLE public.committees
  ADD COLUMN IF NOT EXISTS description_en TEXT,
  ADD COLUMN IF NOT EXISTS description_uz TEXT;

-- Update English and Uzbek descriptions for the 4 seeded committees
UPDATE public.committees SET
  description_en = 'Oversight of financial reporting, internal controls and audit',
  description_uz = 'Молиявий ҳисоботлар, ички назорат ва аудит устидан назорат'
WHERE type = 'audit';

UPDATE public.committees SET
  description_en = 'Strategic planning and investment policy',
  description_uz = 'Стратегик режалаштириш ва инвестиция сиёсати'
WHERE type = 'strategy';

UPDATE public.committees SET
  description_en = 'HR policy, appointments and remuneration system',
  description_uz = 'Кадрлар сиёсати, тайинлашлар ва мукофотлаш тизими'
WHERE type = 'nominations';

UPDATE public.committees SET
  description_en = 'Compliance with ethical standards and anti-corruption policy',
  description_uz = 'Этика нормаларига риоя қилиш, коррупцияга қарши сиёсат'
WHERE type = 'anticorruption';
