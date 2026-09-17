-- Instruções de jogador por slot (Pressão, Entradas, Marcação, Liberdade de
-- movimento, Passe, Drible, Finalização, Risco — ver src/game/player-instructions.ts).
-- Default '{}' = todos os campos no padrão (normalizeInstructions preenche o
-- resto), então nenhuma escalação existente muda de comportamento.
ALTER TABLE public.tactic_lineups ADD COLUMN IF NOT EXISTS instructions jsonb NOT NULL DEFAULT '{}'::jsonb;
