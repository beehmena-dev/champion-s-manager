-- Vira-temporada: precisamos distinguir partidas de temporadas diferentes
-- dentro da mesma competição (hoje tudo cai no mesmo competition_id pra
-- sempre, então sem isso a classificação misturaria temporada 1 com 2, 3...).

ALTER TABLE public.matches
  ADD COLUMN season INT;

-- Backfill: partidas existentes pertencem à temporada atual da sua competição.
UPDATE public.matches m
  SET season = c.season
  FROM public.competitions c
  WHERE m.competition_id = c.id AND m.season IS NULL;

ALTER TABLE public.matches ALTER COLUMN season SET NOT NULL;
CREATE INDEX ON public.matches(competition_id, season);

-- Histórico de temporadas encerradas — guarda a classificação final de cada
-- clube ao fim de cada temporada, pra telas de "histórico"/retrospecto.
CREATE TABLE public.season_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  season INT NOT NULL,
  position INT NOT NULL,
  played INT NOT NULL,
  wins INT NOT NULL,
  draws INT NOT NULL,
  losses INT NOT NULL,
  gf INT NOT NULL,
  ga INT NOT NULL,
  points INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.season_history(save_id);
CREATE INDEX ON public.season_history(club_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.season_history TO authenticated;
GRANT ALL ON public.season_history TO service_role;
ALTER TABLE public.season_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "season_history_own" ON public.season_history FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));
