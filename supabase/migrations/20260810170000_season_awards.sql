-- Estatísticas de temporada por jogador (só rastreadas pro elenco do
-- usuário — as partidas de outros clubes usam simulação rápida sem
-- detalhe de quem marcou) e o prêmio calculado no fim de cada temporada —
-- ver src/lib/advance-day.ts (acúmulo) e src/lib/season-rollover.ts (prêmio + reset).
ALTER TABLE public.players ADD COLUMN goals_season INT NOT NULL DEFAULT 0;
ALTER TABLE public.players ADD COLUMN appearances_season INT NOT NULL DEFAULT 0;

CREATE TABLE public.season_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id UUID NOT NULL REFERENCES public.saves(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
  season INT NOT NULL,
  kind TEXT NOT NULL, -- 'top_scorer' | 'player_of_season'
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL, -- SET NULL (não CASCADE): aposentadoria apaga o jogador, mas o prêmio no histórico continua
  player_name TEXT NOT NULL, -- congelado no momento do prêmio
  value INT NOT NULL, -- gols (top_scorer) ou overall (player_of_season)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.season_awards(save_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.season_awards TO authenticated;
GRANT ALL ON public.season_awards TO service_role;
ALTER TABLE public.season_awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "season_awards_own" ON public.season_awards FOR ALL USING (public.owns_save(save_id)) WITH CHECK (public.owns_save(save_id));
