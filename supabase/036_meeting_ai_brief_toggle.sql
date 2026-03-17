-- 036: Add ai_brief_enabled toggle to agenda_items table
-- Allows admin / corp_secretary to disable AI-brief generation
-- per agenda item for items containing confidential materials.

-- Move ai_brief_enabled from meetings to agenda_items
ALTER TABLE public.agenda_items
  ADD COLUMN IF NOT EXISTS ai_brief_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.agenda_items.ai_brief_enabled IS
  'When false, AI-Brief generation is disabled for this agenda item (confidential materials)';

-- Clean up: remove from meetings if it was added there previously
ALTER TABLE public.meetings
  DROP COLUMN IF EXISTS ai_brief_enabled;

-- Fix missing UPDATE policy on meetings table
-- (only INSERT and SELECT existed — UPDATE was silently blocked by RLS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meetings' AND cmd = 'UPDATE'
  ) THEN
    CREATE POLICY "Meetings: update allowed roles" ON public.meetings
      FOR UPDATE
      USING (
        organization_id = (
          SELECT p.organization_id FROM profiles p WHERE p.id = auth.uid()
        )
        AND (
          (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
          IN ('admin', 'chairman', 'corp_secretary')
        )
      );
  END IF;
END
$$;
