-- Tática 100% livre no campo (estilo Football Manager): o jogador arrasta
-- cada titular pra QUALQUER ponto do campo, não só pros 11 marcadores fixos
-- de um template. `tactic_lineups` ganha a coordenada própria de cada slot;
-- `clubs.formation` deixa de ser um enum fechado nos templates (o rótulo
-- calculado a partir da arrumação real pode ser qualquer combinação, tipo
-- "4-1-3-2", não só uma das 11 conhecidas).

ALTER TABLE public.tactic_lineups
  ADD COLUMN IF NOT EXISTS pos_x real CHECK (pos_x IS NULL OR pos_x BETWEEN 5 AND 95),
  ADD COLUMN IF NOT EXISTS pos_y real CHECK (pos_y IS NULL OR pos_y BETWEEN 5 AND 95);

ALTER TABLE public.clubs
  ALTER COLUMN formation TYPE text USING formation::text,
  ALTER COLUMN formation SET DEFAULT '4-4-2';

DROP TYPE IF EXISTS public.formation;
