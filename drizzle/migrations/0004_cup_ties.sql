CREATE TABLE IF NOT EXISTS public.cup_ties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  season INT NOT NULL,
  round_index INT NOT NULL DEFAULT 0,
  round_name TEXT,
  home_club_id UUID,
  away_club_id UUID,
  leg1_match_id UUID,
  leg2_match_id UUID,
  is_single_leg BOOLEAN NOT NULL DEFAULT false,
  resolved BOOLEAN NOT NULL DEFAULT false,
  winner_club_id UUID,
  penalty_home INT,
  penalty_away INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cup_ties_competition_idx ON public.cup_ties(competition_id, season, round_index);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cup_ties TO authenticated;
GRANT ALL ON public.cup_ties TO service_role;
ALTER TABLE public.cup_ties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cup_ties_own" ON public.cup_ties;
CREATE POLICY "cup_ties_own" ON public.cup_ties FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));