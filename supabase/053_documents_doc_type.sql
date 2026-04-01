-- ============================================================
-- 053: Add doc_type to documents
-- Distinguishes: 'protocol', 'agenda', NULL (material)
-- ============================================================

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS doc_type text;

-- Mark existing meeting-level docs (no agenda_item_id) as protocol
UPDATE public.documents
SET doc_type = 'protocol'
WHERE agenda_item_id IS NULL AND doc_type IS NULL;
