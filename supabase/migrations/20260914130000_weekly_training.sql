-- Item 01 do backlog FootSim: grade semanal de treino + rotinas salvas.
-- weekly_training: array de 7 posições (WeeklyFocus), índice = dia da
-- semana (0=domingo..6=sábado). NULL = clube ainda usa o foco fixo antigo
-- (training_focus) igual em todos os dias — comportamento 100% preservado
-- pra clube que nunca abriu a tela nova.
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS weekly_training jsonb DEFAULT NULL;

-- Rotinas salvas — mesmo padrão de clubs.tactic_presets: array de
-- {id, name, days: WeeklyFocus[7]}, snapshot autocontido, sem tabela nova.
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS training_routines jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
