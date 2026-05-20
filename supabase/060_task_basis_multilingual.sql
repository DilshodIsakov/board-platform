-- 060: Add multilingual basis fields to board_tasks
ALTER TABLE public.board_tasks
  ADD COLUMN IF NOT EXISTS basis_ru text,
  ADD COLUMN IF NOT EXISTS basis_uz text,
  ADD COLUMN IF NOT EXISTS basis_en text;

-- Backfill: copy existing basis into basis_ru
UPDATE public.board_tasks SET basis_ru = basis WHERE basis IS NOT NULL AND basis_ru IS NULL;
