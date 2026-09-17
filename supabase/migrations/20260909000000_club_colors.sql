-- Cores do clube (uniforme principal) — usadas no visualizador 3D da partida
-- pra colorir os modelos dos jogadores (ver src/components/match-3d-pitch.tsx).
-- Nulo até o import trazer valor real; fallback visual fica no cliente.
ALTER TABLE public.clubs ADD COLUMN primary_color TEXT;
ALTER TABLE public.clubs ADD COLUMN secondary_color TEXT;

-- Backfill: distribui uma paleta curada (10 cores de camisa comuns no
-- futebol) por hash determinístico do id, só pra não deixar todo mundo com
-- a cor de fallback até re-importar uma base com cores reais.
WITH palette AS (
  SELECT ARRAY[
    '#dc2626', '#2563eb', '#16a34a', '#000000', '#ffffff',
    '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#78716c'
  ] AS colors
)
UPDATE public.clubs c
SET
  primary_color = palette.colors[1 + (abs(hashtext(c.id::text)) % 10)],
  secondary_color = palette.colors[1 + (abs(hashtext(c.id::text || 's')) % 10)]
FROM palette
WHERE c.primary_color IS NULL;
