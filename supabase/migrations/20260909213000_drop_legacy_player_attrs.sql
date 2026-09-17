-- Remove as 12 colunas antigas de atributo — o backfill pra "attributes"
-- (jsonb, adicionado na migration anterior) já rodou pros 3281 jogadores
-- existentes nesta sessão, confirmado sem falhas antes de rodar isto.
ALTER TABLE public.players DROP COLUMN finishing;
ALTER TABLE public.players DROP COLUMN passing;
ALTER TABLE public.players DROP COLUMN tackling;
ALTER TABLE public.players DROP COLUMN pace;
ALTER TABLE public.players DROP COLUMN stamina;
ALTER TABLE public.players DROP COLUMN dribbling;
ALTER TABLE public.players DROP COLUMN heading;
ALTER TABLE public.players DROP COLUMN vision;
ALTER TABLE public.players DROP COLUMN positioning;
ALTER TABLE public.players DROP COLUMN gk_reflexes;
ALTER TABLE public.players DROP COLUMN gk_handling;
ALTER TABLE public.players DROP COLUMN gk_positioning;
