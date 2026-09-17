-- scout_reports nunca foi referenciada por nenhum código deste repositório
-- e nem sequer foi criada por uma migration rastreada aqui — sobra de um
-- recurso abandonado antes desta sessão (provável precursor de
-- scouting_assignments, que tem forma parecida). Tabela vazia (0 linhas),
-- sem risco de perda de dado.
DROP TABLE IF EXISTS public.scout_reports;
