-- Adiciona sistema de posição granular + versatilidade (posição natural e
-- posições secundárias/proficientes), permitindo escalar um jogador fora da
-- posição natural com penalidade de rendimento calculada no motor tático
-- (ver src/game/tactics.ts, função familiarityFor).

ALTER TABLE public.players
  ADD COLUMN natural_position TEXT,
  ADD COLUMN secondary_positions TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.players.natural_position IS
  'Posição granular natural do jogador (GOL, ZAG, LD, LE, VOL, MC, MD, ME, MEI, PD, PE, CA). Rende 100% dos atributos.';
COMMENT ON COLUMN public.players.secondary_positions IS
  'Posições granulares onde o jogador é proficiente (rende ~92% dos atributos). Qualquer outra posição = ~74%.';

-- Backfill: jogadores existentes (importados antes dessa coluna existir)
-- recebem uma posição natural derivada da posição base (GK/DEF/MID/FWD),
-- só pra não ficarem com natural_position vazio.
UPDATE public.players SET natural_position = CASE position
  WHEN 'GK' THEN 'GOL'
  WHEN 'DEF' THEN 'ZAG'
  WHEN 'MID' THEN 'MC'
  WHEN 'FWD' THEN 'CA'
  ELSE 'MC'
END
WHERE natural_position IS NULL;
