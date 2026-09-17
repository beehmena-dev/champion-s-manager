-- Número da camisa. A base do FM não traz esse dado, então é atribuído por nós
-- (ver src/game/squad-numbers.ts): no import, ao contratar/promover da base, e
-- neste backfill pros elencos que já existem. Nulo pra agente livre / pool de
-- base sem clube.
ALTER TABLE public.players ADD COLUMN squad_number INT;

-- Backfill: numera 1..N por setor (GK → DEF → MID → FWD) e overall dentro do
-- clube. Simplificação em SQL — o import/contratação usam a pilha de
-- preferência (9/10/7 pro ataque etc.).
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY club_id
      ORDER BY
        CASE position WHEN 'GK' THEN 0 WHEN 'DEF' THEN 1 WHEN 'MID' THEN 2 ELSE 3 END,
        overall DESC, id
    ) AS rn
  FROM public.players
  WHERE club_id IS NOT NULL
)
UPDATE public.players p
SET squad_number = ranked.rn
FROM ranked
WHERE p.id = ranked.id;
