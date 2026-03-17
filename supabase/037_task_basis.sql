-- 037: Add "basis" field to board_tasks
-- Stores the legal/organizational basis for the task
-- (e.g., protocol number, meeting decision, regulatory requirement).

ALTER TABLE public.board_tasks
  ADD COLUMN IF NOT EXISTS basis text;

COMMENT ON COLUMN public.board_tasks.basis IS
  'Legal or organizational basis for this task (e.g. protocol reference, meeting decision)';
