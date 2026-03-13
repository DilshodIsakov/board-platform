-- ============================================================
-- 034: NS Meeting Voting — agenda-item-level voting with
--      admin activation, member ballot, and per-meeting signature
-- Run AFTER 005_voting.sql and 002_meetings.sql
-- ============================================================

-- ── 1. Extend votings table ────────────────────────────────────────────────

-- Drop existing status CHECK constraint (auto-named) and recreate with 'draft'
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.votings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE public.votings DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.votings
  ADD CONSTRAINT votings_status_check CHECK (status IN ('draft', 'open', 'closed'));

-- Change default to 'draft' so newly created votings start inactive
ALTER TABLE public.votings ALTER COLUMN status SET DEFAULT 'draft';

-- Add activation / closure tracking columns
ALTER TABLE public.votings
  ADD COLUMN IF NOT EXISTS activated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS activated_by  uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS closed_at     timestamptz;

-- ── 2. meeting_vote_signatures — one record per member per meeting ──────────

CREATE TABLE IF NOT EXISTS public.meeting_vote_signatures (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid        NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id      uuid        NOT NULL REFERENCES public.organizations(id),
  signed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mvs_meeting ON public.meeting_vote_signatures(meeting_id);
CREATE INDEX IF NOT EXISTS idx_mvs_user    ON public.meeting_vote_signatures(user_id);

ALTER TABLE public.meeting_vote_signatures ENABLE ROW LEVEL SECURITY;

-- All org members can see signatures (for admin overview)
CREATE POLICY "mvs_select" ON public.meeting_vote_signatures
  FOR SELECT USING (org_id = public.get_my_org_id());

-- Any org member can sign once (UNIQUE enforces one per meeting)
CREATE POLICY "mvs_insert" ON public.meeting_vote_signatures
  FOR INSERT WITH CHECK (
    org_id  = public.get_my_org_id()
    AND user_id = public.get_my_profile_id()
  );

-- Nobody can delete signatures
-- (no DELETE policy = blocked by RLS)

-- ── 3. Tighten votes RLS: only vote when voting is 'open' ──────────────────

DROP POLICY IF EXISTS "votes_insert" ON public.votes;
CREATE POLICY "votes_insert" ON public.votes
  FOR INSERT WITH CHECK (
    org_id   = public.get_my_org_id()
    AND voter_id = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.votings v
      WHERE v.id = voting_id AND v.status = 'open'
    )
  );

DROP POLICY IF EXISTS "votes_update" ON public.votes;
CREATE POLICY "votes_update" ON public.votes
  FOR UPDATE USING (
    org_id   = public.get_my_org_id()
    AND voter_id = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.votings v
      WHERE v.id = voting_id AND v.status = 'open'
    )
  );

-- ── 4. Extend votings INSERT policy to allow creating in 'draft' ────────────

DROP POLICY IF EXISTS "votings_insert" ON public.votings;
CREATE POLICY "votings_insert" ON public.votings
  FOR INSERT WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman')
  );

DROP POLICY IF EXISTS "votings_update" ON public.votings;
CREATE POLICY "votings_update" ON public.votings
  FOR UPDATE USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('admin', 'chairman')
  );
