-- Múltiplos esquemas táticos salvos em paralelo ("1 / 2 / +" do FM) — deixa
-- o usuário alternar entre um plano titular e um plano B sem reconstruir a
-- escalação/instruções do zero toda vez.
--
-- Guardado como JSONB em vez de tabela própria: cada preset é um instantâneo
-- autocontido (formação + instruções + escalação completa), não precisa de
-- FK pra linha nenhuma — snapshot puro, mais simples de ler/escrever de uma
-- vez só (um UPDATE, não N linhas). Formato de cada item do array:
--   { id, name, formation, mentality, pressing, defensive_line, tempo,
--     passing_style, lineup: [{ slot, playerId, role }] }
-- `clubs.formation/mentality/.../tactic_lineups` continuam sendo a tática
-- ATIVA (o que o motor de simulação de fato lê) — os presets são só
-- instantâneos que o usuário pode carregar por cima disso.

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS tactic_presets jsonb NOT NULL DEFAULT '[]'::jsonb;
