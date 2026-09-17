-- Cláusula de titularidade garantida: promessa formal feita na renovação de
-- contrato. bench_streak conta jogos seguidos no banco (zera a cada vez que
-- titulariza) — se o clube não cumprir a promessa, a insatisfação é bem
-- mais forte que o gatilho genérico de pouca minutagem — ver
-- src/game/unrest.ts e src/lib/advance-day.ts.
ALTER TABLE public.players ADD COLUMN guaranteed_starter BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.players ADD COLUMN bench_streak INT NOT NULL DEFAULT 0;
ALTER TABLE public.contract_offers ADD COLUMN guaranteed_starter BOOLEAN NOT NULL DEFAULT false;
