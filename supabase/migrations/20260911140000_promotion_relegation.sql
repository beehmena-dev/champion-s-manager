-- Acesso e rebaixamento.
--
-- competitions.tier    -> 1 = primeira divisão, 2 = segunda, etc.
-- competitions.country -> código do país (BR, EN, ES...). Duas competições com
--   o mesmo country e tiers consecutivos formam uma pirâmide: no fim da
--   temporada os N piores da de cima trocam de lugar com os N melhores da de
--   baixo (src/lib/season-rollover.ts::applyPromotionRelegation).

ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS tier integer NOT NULL DEFAULT 1;
ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS country text;

-- Backfill para saves já existentes (o importador preenche nos novos).
UPDATE public.competitions SET tier = 2
  WHERE type = 'league' AND code IN ('D107191', 'D12', 'D33', 'D23', 'D17', 'D68');

UPDATE public.competitions SET country = CASE code
    WHEN 'D102423' THEN 'BR' WHEN 'D107191' THEN 'BR'
    WHEN 'D11' THEN 'EN' WHEN 'D12' THEN 'EN'
    WHEN 'D67' THEN 'ES' WHEN 'D68' THEN 'ES'
    WHEN 'D32' THEN 'IT' WHEN 'D33' THEN 'IT'
    WHEN 'D22' THEN 'DE' WHEN 'D23' THEN 'DE'
    WHEN 'D16' THEN 'FR' WHEN 'D17' THEN 'FR'
    WHEN 'D102421' THEN 'AR' WHEN 'D60' THEN 'PT' WHEN 'D29' THEN 'NL'
    WHEN 'D130286' THEN 'TR' WHEN 'D40' THEN 'US' WHEN 'D136543' THEN 'AT'
    WHEN 'D137889' THEN 'CH' WHEN 'D135973' THEN 'MX' WHEN 'D7920263' THEN 'SA'
    WHEN 'D5260948' THEN 'CO' WHEN 'D5512770' THEN 'UY'
    ELSE country
  END
  WHERE type = 'league';
