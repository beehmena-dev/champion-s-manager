-- Cartões acumulados e suspensão por rodadas — src/lib/advance-day.ts já
-- grava nessas colunas há tempo (yellowDelta/suspensionDelta), mas elas
-- nunca existiram de fato no banco: os updates falhavam silenciosamente
-- (Supabase retorna {error}, nunca checado), então suspensão por cartão
-- nunca funcionou de verdade.
ALTER TABLE public.players
  ADD COLUMN suspended_matches INT NOT NULL DEFAULT 0,
  ADD COLUMN yellow_cards_season INT NOT NULL DEFAULT 0;
