
-- Enums
DO $$ BEGIN
  CREATE TYPE public.formation AS ENUM ('4-4-2','4-3-3','4-2-3-1','3-5-2','5-3-2','4-1-4-1');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.mentality AS ENUM ('defensive','balanced','attacking');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.passing_style AS ENUM ('short','mixed','direct');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Clubs: tática
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS formation public.formation NOT NULL DEFAULT '4-4-2',
  ADD COLUMN IF NOT EXISTS mentality public.mentality NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS pressing smallint NOT NULL DEFAULT 3 CHECK (pressing BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS defensive_line smallint NOT NULL DEFAULT 3 CHECK (defensive_line BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS tempo smallint NOT NULL DEFAULT 3 CHECK (tempo BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS passing_style public.passing_style NOT NULL DEFAULT 'mixed';

-- Players: form, condition, role
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS form smallint NOT NULL DEFAULT 70 CHECK (form BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS condition smallint NOT NULL DEFAULT 100 CHECK (condition BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS role text;

-- Tactic lineups
CREATE TABLE IF NOT EXISTS public.tactic_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id uuid NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  slot text NOT NULL,
  is_starter boolean NOT NULL DEFAULT true,
  role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, slot),
  UNIQUE (club_id, player_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tactic_lineups TO authenticated;
GRANT ALL ON public.tactic_lineups TO service_role;

ALTER TABLE public.tactic_lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_tactic_lineups"
  ON public.tactic_lineups FOR ALL
  USING (public.owns_save(save_id))
  WITH CHECK (public.owns_save(save_id));

CREATE INDEX IF NOT EXISTS tactic_lineups_save_idx ON public.tactic_lineups(save_id);
CREATE INDEX IF NOT EXISTS tactic_lineups_club_idx ON public.tactic_lineups(club_id);
