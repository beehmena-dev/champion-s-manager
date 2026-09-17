-- Equipes B / elenco reserva (item 15 do backlog FootSim) — partição nova
-- de jogador: "elenco principal" vs "equipe B/reservas". Controlada pelo
-- técnico (nunca automática) na tela de Elenco.
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS squad_tier text NOT NULL DEFAULT 'first_team'
    CHECK (squad_tier IN ('first_team', 'b_team'));
