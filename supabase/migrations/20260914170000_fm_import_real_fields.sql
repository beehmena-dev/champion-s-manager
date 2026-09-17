-- Campos reais do export FM24 (Genie Scout) que já vinham na CLUBES.csv/
-- JOGADORES.csv do usuário mas o parser (scripts/fm-csv-to-seed.mjs) não
-- lia ainda: nacionalidade, data de nascimento, carreira na seleção,
-- verba de salários e público médio real do clube.
--
-- birth_date é só informativo/exibição — o envelhecimento do jogador
-- continua sendo o +1 por temporada em season-rollover.ts
-- (agePlayersAndReleaseContracts), não é recalculado a partir desta data.
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS international_caps INT NOT NULL DEFAULT 0;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS international_goals INT NOT NULL DEFAULT 0;

-- Informativos por enquanto (não realimentam gateIncome/board.ts nesta
-- passada — misturar dado real de público com a fórmula de ocupação
-- procedural por temperamento é uma mudança de mecânica à parte).
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS wage_budget BIGINT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS avg_attendance INT;

NOTIFY pgrst, 'reload schema';
