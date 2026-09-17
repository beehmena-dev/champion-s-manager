-- Diretoria: confiança da diretoria no técnico (0-100) e objetivo da
-- temporada pro clube do usuário — ver src/game/board.ts pros efeitos.
ALTER TABLE public.clubs ADD COLUMN board_confidence INT NOT NULL DEFAULT 60;

CREATE TABLE public.season_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  season INT NOT NULL,
  kind TEXT NOT NULL,     -- 'win_league' | 'top_n' | 'avoid_relegation'
  target INT NOT NULL,    -- posição-alvo (win_league/top_n) ou limite antes do rebaixamento (avoid_relegation)
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | met | missed
  final_position INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.season_objectives(save_id);
CREATE UNIQUE INDEX season_objectives_one_per_club_season ON public.season_objectives(club_id, competition_id, season);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.season_objectives TO authenticated;
GRANT ALL ON public.season_objectives TO service_role;
ALTER TABLE public.season_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "season_objectives_own" ON public.season_objectives FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));
