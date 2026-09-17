-- Potencial de crescimento (teto de overall) — hoje só gerado pra juniores
-- da base (ver src/game/youth.ts); jogadores existentes ficam com NULL.
-- Alimenta a nova tela de Central da base.
ALTER TABLE public.players ADD COLUMN potential INT;
