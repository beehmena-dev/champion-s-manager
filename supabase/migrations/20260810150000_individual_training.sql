-- Foco de treino individual — sobrescreve, só pra esse jogador, o foco do
-- time inteiro (clubs.training_focus) quando definido. NULL = usa o do clube
-- (comportamento de sempre). Ver src/game/training.ts.
ALTER TABLE public.players ADD COLUMN individual_training_focus TEXT;
