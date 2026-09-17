-- Estatísticas de carreira do jogador — nunca zeram (diferente de
-- goals_season/appearances_season, que resetam a cada virada de temporada
-- pro prêmio de artilheiro). Ver src/lib/advance-day.ts.
ALTER TABLE public.players ADD COLUMN career_goals INT NOT NULL DEFAULT 0;
ALTER TABLE public.players ADD COLUMN career_appearances INT NOT NULL DEFAULT 0;
