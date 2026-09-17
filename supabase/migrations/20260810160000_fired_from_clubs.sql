-- Registra cada clube que já demitiu o usuário nesse save, pra não
-- reaparecer na lista de escolha em saves.$saveId.setup.tsx — ver
-- src/lib/season-rollover.ts (onde a demissão de fato acontece).
ALTER TABLE public.saves ADD COLUMN fired_from_club_ids UUID[] NOT NULL DEFAULT '{}';
