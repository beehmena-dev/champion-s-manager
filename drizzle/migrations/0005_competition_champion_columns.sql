ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS champion_club_id UUID,
  ADD COLUMN IF NOT EXISTS champion_season INT;