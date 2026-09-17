-- Cobradores de bola parada + capitão.
--
-- 4 colunas opcionais em clubs apontando pra players. NULL = o motor escolhe
-- sozinho o melhor do XI titular pra cada função a cada partida
-- (src/game/set-pieces.ts::resolveTakersForXI). Se o jogador escolhido não
-- estiver no XI daquela partida (lesão, poupado, vendido), o motor também cai
-- na escolha automática — então id "velho" nunca quebra nada.
--
-- ON DELETE SET NULL: quando um jogador se aposenta/é removido do save
-- (src/lib/season-rollover.ts), a referência some limpa.

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS penalty_taker_id uuid REFERENCES public.players(id) ON DELETE SET NULL;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS free_kick_taker_id uuid REFERENCES public.players(id) ON DELETE SET NULL;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS corner_taker_id uuid REFERENCES public.players(id) ON DELETE SET NULL;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS captain_id uuid REFERENCES public.players(id) ON DELETE SET NULL;
